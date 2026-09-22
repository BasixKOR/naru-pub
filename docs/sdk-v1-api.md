# Naru Data SDK v1 API reference

Naru Data is a dependency-free browser ES module for JSON documents and media
owned by one Naru site. Import the versioned module and create one client:

```js
import { createNaru, NaruError } from "https://naru.pub/sdk/1/naru-data.js";

const naru = createNaru({ site: "alice" });
```

`site` may be omitted (or empty) on a `*.naru.pub` site. The module's matching
TypeScript declarations are at `https://naru.pub/sdk/1/naru-data.d.ts`.

`/sdk/1/` is the newest 1.x release, so a site importing it gets compatible
fixes automatically. To pin one exact release instead, import
`/sdk/1.0.0/naru-data.js`; exact versions never change once released.

## Capabilities

The client separates anonymous operations from owner-authorized operations:

```ts
const posts = naru.public.collection<Post>("posts");
const post = await posts.get("hello", { signal });
const page = await posts.list({
  filter: { published: true, date: { gte: "2026-01-01" } },
  sort: [
    ["date", "desc"],
    [{ metadata: "createdAt" }, "desc"],
  ],
  size: 20,
  includeTotal: true,
  signal,
});
const created = await posts.add({ title: "Hello" }, { signal });
```

`public.collection(name)` has only `get`, `list`, and `add`. Collection policy
decides whether a particular anonymous operation is allowed. An owner capability
is restored for the current browser tab or obtained by redirecting for approval:

```js
let owner = await naru.auth.session();
if (!owner) {
  await naru.auth.signIn({ collections: ["posts", "categories"] });
  // The browser leaves this page. Call session() after the redirect back.
}
```

An owner collection adds replacement and deletion:

```js
const posts = owner.collection("posts");
const saved = await posts.set(
  "hello",
  { title: "Hello" },
  {
    condition: { absent: true },
    signal,
  },
);
await posts.set(
  "hello",
  { title: "Updated" },
  {
    condition: { revision: saved.revision },
  },
);
await posts.delete("hello", {
  condition: { revision: saved.revision },
});
```

`set` replaces the complete JSON value; there is no patch operation. An
unconditional `set` is last-write-wins. Deleting an absent document succeeds
unless a condition was supplied.

## Documents, pages, and queries

`get` and `list` return document envelopes:

```ts
interface Document<T> {
  id: string;
  data: T;
  createdAt: string;
  updatedAt: string;
  revision: Revision;
}

interface Page<T> {
  documents: Document<T>[];
  nextCursor: string | null;
  totalCount?: number;
}
```

Filters are ANDed predicates on top-level user fields. A value is either scalar
equality or a range with `gt`, `gte`, `lt`, and/or `lte`. Sorting accepts one or
two `[field, "asc" | "desc"]` entries. User fields are strings; the timestamps
are `{ metadata: "createdAt" }` or `{ metadata: "updatedAt" }`. Without `sort`,
and after the last key, documents are in ID order. `size` is 1–100
and defaults to 50. `totalCount` is returned only when `includeTotal` was
requested.

`nextCursor` is opaque and bound to its original site, collection, filter, and
sort. Pass it unchanged as `after`. Pagination is not a snapshot across
separate requests, so concurrent writes can change later pages.

## Revisions and transactions

Revisions are opaque concurrency tokens. Store and return them unchanged; their
text has no public format. `{ revision }` performs optimistic concurrency, while
`{ absent: true }` permits creation only when the ID is unused.

`owner.transaction(writes)` atomically commits ID-addressed replacements and
deletions across authorized collections:

```js
await owner.transaction(
  [
    {
      collection: "posts",
      set: { id: "hello", data: post, condition: { revision } },
    },
    {
      collection: "categories",
      set: { id: "news", data: category },
    },
  ],
  { signal },
);
```

It resolves with `undefined`. Any failed condition or write rolls back every
write in the transaction. The SDK does not automatically retry writes or
transactions.

## Media and sign-out

```js
const media = await owner.media.upload(file, { signal });
await owner.signOut();
owner = null;
```

`upload` returns `{ url }`, the file's public address.
The SDK may resize supported images before upload. The website SDK deliberately
does not list or delete media; owners do that in Naru's media library. Sign-out
forgets the tab's session before requesting remote revocation.

## Errors and cancellation

SDK failures are `NaruError` instances. Application logic should use the stable
`code`, not HTTP status or message:

| Code                      | Meaning                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `CONFLICT`                | A revision or absence condition failed.                       |
| `QUOTA_EXCEEDED`          | The site's database or media storage is full.                 |
| `AUTH_REQUIRED`           | Owner authorization is missing, expired, or revoked.          |
| `ACCESS_DENIED`           | The collection policy or owner scope denies the operation.    |
| `NOT_FOUND`               | The requested site, collection, document, or media is absent. |
| `RATE_LIMITED`            | The caller must wait before retrying.                         |
| `INVALID_REQUEST`         | Input is malformed or outside documented limits.              |
| `REDIRECT_NOT_REGISTERED` | The current owner callback was not registered.                |
| `UNAVAILABLE`             | The service, network, or response is temporarily unusable.    |

`error.retryable` is the SDK's retry hint: true for `RATE_LIMITED` and
`UNAVAILABLE`. `error.message` is diagnostic and may change; a network
failure's original error is the standard `error.cause`. Only the SDK creates
`NaruError`s; check them with `instanceof`. Passing an `AbortSignal` cancels the request and
rejects with the platform's native `AbortError`, not `NaruError`.

## Compatibility guarantees

The declarations export only what an application names itself: `createNaru`,
`NaruError`, `NaruErrorCode`, `NaruClient`, `Owner`, `PublicCollection`,
`OwnerCollection`, `Document`, `Page`, `Revision` and `Json`. Option and result
shapes are written out in place.

Naru v1 guarantees the public TypeScript shapes and behavior described here:

- cursors and revisions remain opaque;
- each request observes a consistent result, but pages are not a shared snapshot;
- transactions are all-or-nothing;
- anonymous reads may be served from a short shared cache;
- authenticated reads, writes, and errors are not shared-cacheable;
- `NaruError.code` and `retryable` are the compatibility boundary for failures;
  the code list above is closed for v1.

Collection names starting with `_` are reserved and cannot be created.

The SDK talks to a versioned wire protocol (`/api/data/v1/…`), which Naru keeps
compatible for every released 1.x SDK file. It is documented for Naru's own
maintenance in [database.md](database.md#internal-http-protocol); applications
should use the SDK. Revision and cursor encoding, owner-token storage, upload
choreography, database technology, cache implementation, and HTTP status values
are private and may change.
