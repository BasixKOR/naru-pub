# Production deployment

`deploy.sh` uses blue-green HTTP deployments. A stable nginx gateway owns host
ports `40000` (control plane) and `40001` (hosted-site proxy). The blue and green
application slots have no published host ports.

For each deployment, the script:

1. pulls the latest commit with a fast-forward-only pull;
2. builds the inactive control-plane and site-proxy slot;
3. runs database migrations from the new control-plane image;
4. starts the inactive slot and waits for the control plane, database, and
   hosted-site proxy to become healthy;
5. reloads nginx to atomically direct new requests to the healthy slot; and
6. recreates the cron and worker processes from the new image.

After pulling, the deploy command re-executes the checked-in script once before
it reads the Compose topology. This keeps a deployment safe when the deployment
script or Compose file itself changes in the pulled commit.

The previous HTTP slot stays running after the switch. Existing nginx workers
can finish in-flight requests against it, and it remains available for an
immediate traffic rollback:

```bash
./deploy.sh rollback
```

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
served. The browser SDK reads a collection with `cache: "no-store"` for 10
seconds after its own write, so a writer sees their change immediately.

Check it with GET requests; `curl -I` sends HEAD, which the expression does not
match and which always reports `DYNAMIC`:

```bash
curl -s -o /dev/null -D - "https://naru.pub/api/data/eyecntct/posts?limit=1" | grep -i cf-cache-status
```

Within 10 seconds a repeat is `HIT`, after that `EXPIRED`; with an
`Authorization` header it is `DYNAMIC`, and error responses are `BYPASS`.
