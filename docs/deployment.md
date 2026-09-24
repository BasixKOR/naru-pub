# Production deployment

Deploy from the development machine, not the server:

```bash
./deploy.sh
```

It builds `naru-pub-control-plane:<commit>` and `naru-pub-proxy:<commit>` from
`origin/main` in a clean checkout of its own (`~/.cache/naru-pub-deploy`),
ships both images over ssh to the host named by the `naru-pub-deploy` alias in
`~/.ssh/config`, and runs `deploy-server.sh <commit>` there. Nothing compiles
on the server, and its Compose file has no `build:` on purpose: a Next.js build
and a release Cargo build there ran the Docker VM that every other service on
the host shares out of memory. Push first; only `origin/main` is deployed.

`deploy-server.sh` uses blue-green HTTP deployments. A stable nginx gateway owns host
ports `40000` (control plane) and `40001` (hosted-site proxy). The blue and green
application slots have no published host ports.

For each deployment, `deploy-server.sh`:

1. fast-forwards the server checkout to exactly the commit the images were
   built from;
2. points the `:current` tags at that commit's images;
3. runs database migrations from the new control-plane image;
4. starts the inactive slot and waits for the control plane, database, and
   hosted-site proxy to become healthy;
5. reloads nginx to atomically direct new requests to the healthy slot;
6. recreates the cron and worker processes from the new image; and
7. stops the previous slot and removes release images nothing can come back to.

After the checkout moves, the script re-executes the checked-in copy once
before it reads the Compose topology. This keeps a deployment safe when the
deployment script or Compose file itself changes in that commit.

The previous HTTP slot is stopped once traffic has left it. nginx finishes
in-flight requests on its old workers after a reload, so the script waits for
those workers to exit (at most `DRAIN_TIMEOUT_SECONDS`, 120 by default) before
stopping the slot. Its containers are kept, not removed, so an immediate
traffic rollback starts them again without a rebuild:

```bash
./deploy.sh rollback             # from the development machine
./deploy-server.sh rollback      # or on the server itself
```

A rollback starts the stopped slot, waits for it to become healthy, switches
traffic to it, and stops the slot it left. The slots use
`restart: unless-stopped`, so a stopped slot also stays stopped across a Docker
restart.

Rollback only switches the HTTP services. It does not reverse database
migrations or roll back cron and worker code. Migrations deployed through this
flow must therefore use the expand-and-contract pattern: first add compatible
schema, deploy code that can use it, and remove old schema only in a later
deployment after rollback is no longer required.

The first deployment from the legacy Compose topology has a short one-time
cutover while the stable gateway takes ownership of ports `40000` and `40001`.
Subsequent deployments keep the gateway and active slot running throughout. A
rollback slot first becomes available after the second blue-green deployment.

Runtime state is stored under `.deploy-state/` and must not be committed. If the
active-slot file is lost, inspect the nginx configuration and restore
`.deploy-state/active-slot` to `blue` or `green` before deploying again.

## Cloudflare cache rule for hosted sites

Hosted pages (HTML, JS and JSON served by the site proxy) carry
`Cache-Control: public, max-age=0, stale-if-error=86400`. Cloudflare stores
each page but revalidates it at the origin on every request, so edits appear
at once and pageviews are still counted. When the origin answers with a `5xx`,
Cloudflare serves the last good copy for up to a day instead. The proxy
therefore reports its own failures as `5xx`: `503` when PostgreSQL is
unreachable (after at most 3 seconds) and `502` when R2 fails. Only a missing
site or file is a `404`, which replaces the cached copy. Redirects to R2 and
to directory URLs are cached for an hour, with the same one-day fallback.

This only covers failures the origin can still answer: PostgreSQL or R2
outages, and both proxy slots being down (the nginx gateway returns `502`).
When the whole host or the tunnel is down, Cloudflare generates the error
itself (`530`/1033) and `stale-if-error` does not apply.

Cloudflare does not cache HTML or JSON by default, so the rule below is
required. Without it the header has no effect (`cf-cache-status: DYNAMIC`).
Custom domains use this zone's rules through Cloudflare for SaaS. Like the data
rule, it is zone configuration: recreate it by hand if the zone is rebuilt.

**Caching → Cache Rules → `Hosted site fallback`**

Expression (list every hostname that is not a hosted site). The R2 hosts must
stay out: their objects carry no `Cache-Control`, so this rule would stop them
being cached at all:

```
(not http.host in {"naru.pub" "r2.naru.pub" "r2-screenshots.naru.pub" "media.naru.pub"})
```

| Setting                                | Value                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| Cache eligibility                      | Eligible for cache                                       |
| Edge TTL                               | Use cache-control header if present, bypass cache if not |
| Browser TTL                            | Respect origin TTL                                       |
| Serve stale content while revalidating | Off                                                      |

Keep this rule after the zone's `Exclude CSS/ICO/JS from being cached` rules.
Later rules win, so hosted-site JS gets the fallback (the `max-age=0` header
keeps it fresh) while the exclusions still apply to `naru.pub` and R2.

**Always Online** (Caching → Configuration) must stay off, because Cloudflare
ignores `stale-if-error` while it is on.

Enable the rule only after the proxy that sends these headers is deployed. The
older proxy sends `max-age=3600`, and only URLs on the platform subdomain are
purged on edit, so an edited page on a custom domain would stay stale for up
to an hour.

Check it with a GET on a hosted page. The first request is `MISS`, later ones
are `REVALIDATED` or `EXPIRED`, never `DYNAMIC`:

```bash
curl -s -o /dev/null -D - "https://eyecntct.naru.pub/" | grep -iE 'cf-cache-status|cache-control'
```

## Cloudflare cache rule for public data reads

The site data API marks anonymous reads of `world`-readable collections
`Cache-Control: public, max-age=0, s-maxage=10`, but Cloudflare does not cache
API responses on its own. Without the rule below every visitor's read reaches
PostgreSQL. The rule is zone configuration, not code: recreate it by hand if the
`naru.pub` zone is ever rebuilt.

**Caching → Cache Rules → `Public site data reads`**

Expression:

```
(http.request.method eq "GET"
 and starts_with(http.request.uri.path, "/api/data/")
 and not len(http.request.headers["authorization"]) > 0)
```

| Setting                                | Value                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| Cache eligibility                      | Eligible for cache                                       |
| Edge TTL                               | Use cache-control header if present, bypass cache if not |
| Browser TTL                            | Respect origin TTL                                       |
| Cache key                              | Defaults; the query string must stay part of the key     |
| Serve stale content while revalidating | Off                                                      |

The trailing slash in `/api/data/` keeps sign-in (`/api/data-auth/`) and the
control panel (`/api/account/database`) out. The origin decides what is actually
stored: requests with a token, admin-only collections, `/_files`, writes and
every error carry `no-store`, and anonymous public responses use
`Access-Control-Allow-Origin: *`, so ignoring `Vary` cannot hand one caller's
response to another. Stale serving stays off because the 10-second window is
also how long a collection just changed from `world` to `admin` can still be
served. The browser SDK reads a collection with `cache: "no-store"` and the private
`fresh=1` query parameter after its own write for the rest of the loaded module's lifetime. The server returns `no-store` for that query variant. Keep query
strings in the cache key and respect origin headers: this makes read-after-write
independent of the shared cache duration. A request with `fresh=1` must never
be a cache HIT.

Check it with GET requests; `curl -I` sends HEAD, which the expression does not
match and which always reports `DYNAMIC`:

```bash
curl -s -o /dev/null -D - "https://naru.pub/api/data/v1/eyecntct/posts?size=1" | grep -i cf-cache-status
```

Within 10 seconds a repeat is `HIT`, after that `EXPIRED`; with an
`Authorization` header it is `DYNAMIC`, and error responses are `BYPASS`.
