# Naru Data SDK v1 API reference

Naru Data is a dependency-free browser ES module for JSON documents and media
owned by one Naru site. Import the versioned module and create one client:

```js
import { createNaru, NaruError } from "https://naru.pub/sdk/1/naru.js";

const naru = createNaru({ site: "alice" });
```

`site` may be omitted (or empty) on a `*.naru.pub` site. The module's matching
TypeScript declarations are at `https://naru.pub/sdk/1/naru.d.ts`.

`/sdk/1/` is the newest 1.x release, so a site importing it gets compatible
fixes automatically. It is the URL to import: 1.0.0 is still being changed, so
no exact release is fixed enough to pin yet.

## Start with reading

Create a `posts` collection in the control panel, enable public reading, and
save a document with a `title`. Add this to a page hosted on your Naru site:

```html
<ul id="posts"></ul>
<script type="module">
  import { createNaru } from "https://naru.pub/sdk/1/naru.js";
  const naru = createNaru();
  const page = await naru.collection("posts").list();
  for (const post of page.documents) {
    const item = document.createElement("li");
    item.textContent = post.data.title;
    document.querySelector("#posts").append(item);
  }
</script>
```

A collection groups documents. Each document has an ID and your JSON in `data`.
This example reads the first page; add pagination when you need more records.

For a guestbook, create a `guestbook` collection with public reading and
create-only visitor writing. Call the following from a submit or click handler,
not on page load. The saved result has the same shape as a read:

```js
const saved = await naru.collection("guestbook").add({
  name: "Visitor",
  message: "Hello!",
});
console.log(saved.data.message, saved.createdAt);
```

Next, learn owner sign-in to edit posts, then pagination, and finally revision
conditions and atomic batches. No API key or build tool is needed.

## Visitor collections and queries

The client separates anonymous operations from owner-authorized operations:

```ts
const posts = naru.collection<Post>("posts");
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

`naru.collection(name)` has only `get`, `list`, and `add`. Collection policy
decides whether a particular anonymous operation is allowed. These handles always
use visitor access, even while signed in.

## Sign in to edit

An owner capability
is restored for the current browser tab or obtained by redirecting for approval:

```js
let owner = await naru.auth.session();
if (!owner) {
  await naru.auth.signIn({ collections: ["posts", "categories"] });
  // The browser leaves this page. Call session() after the redirect back.
}
```

`signIn` makes no request of its own. Register the page's exact URL in the
control panel first; if it is not registered, Naru's consent page says so and
links to the fix, so the site never sees that error.

The browser leaves the page during `signIn`, and a page that holds unsaved
input should put it somewhere that survives, such as `sessionStorage`, before
calling it, and restore it after the redirect back. The same applies when a
request fails with `AUTH_REQUIRED`, which is the other moment an editor asks
its owner to sign in again. Active use renews the session within platform limits; it can still expire or
be revoked. Preserve unsaved work independently of the session.

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

`get`, `add`, and `set` return a document envelope; `list` returns a page of
these same envelopes. Write results contain the data actually stored by the server,
including for create-only visitors (their new document only):

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
two `[field, "asc" | "desc"]` entries. User fields are strings; metadata is
`{ metadata: "id" | "createdAt" | "updatedAt" }`, where the ID may only be the
sole key. Without `sort`, and after the last key, documents are in ID order. `size` is 1–100
and defaults to 50. `totalCount` is returned only when `includeTotal` was
requested.

Ascending field order is: missing/null/non-scalar values (one tied group),
strings, numbers, then booleans (`false` before `true`). Strings compare by
Unicode code point, without locale rules or normalization; numbers compare
numerically. Descending reverses this order. ID ties use ASCII order in the
last sort key's direction; the default is ID ascending. Arrays and objects
can be stored but are not meaningfully ordered. String ranges use the same
code-point comparison. Prefer one consistent scalar type per sortable field.

`nextCursor` is opaque and bound to its original site, collection, filter, and
sort. Pass it unchanged as `after`. Pagination is not a snapshot across
separate requests, so concurrent writes can change later pages.

## Revisions and atomic batches

Revisions are opaque concurrency tokens. Store and return them unchanged; their
text has no public format. `{ revision }` performs optimistic concurrency, while
`{ absent: true }` permits creation only when the ID is unused; a delete takes
only `{ revision }`, since deleting only when absent could never do anything.

`owner.batch(writes)` atomically commits ID-addressed replacements and
deletions across authorized collections:

```js
await owner.batch(
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
write in the batch. The SDK does not automatically retry writes or
batches.

## Media and sign-out

```js
const media = await owner.media.upload(file, { signal });
await owner.signOut();
owner = null;
```

`upload` returns `{ url, name, contentType, size }` as stored: shrinking may
have renamed and re-encoded the file (HEIC becomes WebP, for instance).
The SDK may resize supported images before upload. The website SDK deliberately
does not list or delete media; owners do that in Naru's media library. Sign-out
forgets the tab's session before requesting remote revocation.

## Errors and cancellation

Service failures are `NaruError` instances. Application logic should use the stable
`code`, not HTTP status or message:

| Code              | Meaning                                                       |
| ----------------- | ------------------------------------------------------------- |
| `CONFLICT`        | A revision or absence condition failed.                       |
| `QUOTA_EXCEEDED`  | The site's database or media storage is full.                 |
| `AUTH_REQUIRED`   | Owner authorization is missing, expired, or revoked.          |
| `ACCESS_DENIED`   | The collection policy or owner scope denies the operation.    |
| `NOT_FOUND`       | The requested site, collection, document, or media is absent. |
| `RATE_LIMITED`    | The caller must wait before retrying.                         |
| `INVALID_REQUEST` | Input is malformed or outside documented limits.              |
| `UNAVAILABLE`     | The service, network, or response is temporarily unusable.    |

`error.message` is diagnostic and may change; a network failure's original
error is the standard `error.cause`. Only the SDK creates `NaruError`s; check
them with `instanceof`. There is no `retryable` flag and no automatic retry:
a lost response can mean a write succeeded, so retrying `add()` can duplicate
it. Reconcile a failed write before trying again.

Invalid names, IDs, malformed single-write conditions, and non-JSON document values throw `TypeError`.
Documents accept null, booleans, strings, finite numbers, dense arrays, and plain
objects containing these values. Undefined, functions, symbols, bigint, dates,
class instances, accessors, sparse arrays, and cycles are refused before sending.
Convert dates to strings explicitly. This checks JSON values, not your schema;
applications still validate their fields. Other malformed requests fail with
`INVALID_REQUEST`. Passing an `AbortSignal` cancels the request and rejects
with the platform's native `AbortError`, not `NaruError`. Cancellation does not
roll back a write the server already accepted.

## Compatibility guarantees

The declarations export only what an application names itself: `createNaru`,
`NaruError`, `NaruErrorCode`, `NaruClient`, `Owner`, `PublicCollection`,
`OwnerCollection`, `Document`, `Page`, `ListOptions`, `Filter`, `Sort`,
`WriteCondition`, `Revision` and `Json`. Other option and result shapes are
written out in place.

Naru v1 guarantees the public TypeScript shapes and behavior described here:

- cursors and revisions remain opaque;
- each request observes a consistent result, but pages are not a shared snapshot;
- transactions are all-or-nothing;
- anonymous reads may be served from a short shared cache;
- after a write, the same loaded SDK bypasses caches for that collection for
  the remainder of its lifetime, including when the write response was lost;
  the server's cache duration is private. Reads can also see later writes by
  others; this is not a snapshot or a guarantee that your value remains unchanged;
- authenticated reads, writes, and errors are not shared-cacheable;
- `NaruError.code` is the compatibility boundary for service failures;
  the code list above is closed for v1.

Collection names starting with `_` are reserved and cannot be created.

The SDK talks to a versioned wire protocol (`/api/data/v1/…`), which Naru keeps
compatible for every released 1.x SDK file. It is documented for Naru's own
maintenance in [database.md](database.md#internal-http-protocol); applications
should use the SDK. Revision and cursor encoding, owner-token storage, upload
choreography, database technology, cache implementation, and HTTP status values
are private and may change.
