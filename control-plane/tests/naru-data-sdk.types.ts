import {
  createNaru,
  type Document,
  type Json,
  NaruError,
  type NaruErrorCode,
  type Owner,
  type OwnerCollection,
  type Page,
  type PublicCollection,
  type Revision,
} from "../public/sdk/1.0.0/naru-data.js";
// Only names an application writes itself are exported.
// @ts-expect-error Spelled out in place rather than exported.
import type { WriteResult } from "../public/sdk/1.0.0/naru-data.js";

interface Post {
  title: string;
  published: boolean;
}
const naru = createNaru({ site: "alice" });
const posts: PublicCollection<Post> = naru.public.collection<Post>("posts");
const other = naru.public.collection("other");
const signal = new AbortController().signal;

const post: Promise<Document<Post>> = posts.get("one", { signal });
posts.add({ title: "hello", published: false });
// @ts-expect-error Public handles cannot replace documents.
posts.set("one", { title: 123, published: false });

async function page() {
  let cursor: string | null = null;
  do {
    const result = await posts.list({
      filter: { published: true, title: { gte: "a", lt: "b" } },
      sort: [
        ["title", "asc"],
        [{ metadata: "createdAt" }, "desc"],
      ],
      size: 20,
      after: cursor,
      includeTotal: true,
      signal,
    });
    const title: string = result.documents[0].data.title;
    const total: number | undefined = result.totalCount;
    const typed: Page<Post> = result;
    cursor = result.nextCursor;
  } while (cursor);
  const loose: Json = (await other.get("one")).data;
}
// @ts-expect-error sort is always a list of pairs.
posts.list({ sort: "createdAt" });
// @ts-expect-error Arrays are not filter values.
posts.list({ filter: { tags: ["x"] } });
// @ts-expect-error The id is the default order, not a sort key.
posts.list({ sort: [[{ metadata: "id" }, "asc"]] });
// @ts-expect-error Merge patches are not part of the API.
posts.update("one", { title: "x" });

async function owner(admin: Owner) {
  const drafts: OwnerCollection<Post> = admin.collection<Post>("drafts");
  await drafts.set("one", { title: "draft", published: false });
  const revision = (await drafts.get("one")).revision;
  const written = await drafts.set(
    "one",
    { title: "edited", published: false },
    { condition: { revision }, signal },
  );
  const next: Revision = written.revision;
  const created: string = written.createdAt;
  // @ts-expect-error A write reports when the document was created, not more.
  void written.updatedAt;
  await admin.transaction([
    {
      collection: "posts",
      set: { id: "one", data: {}, condition: { absent: true } },
    },
    { collection: "drafts", delete: { id: "one" } },
  ]);
  const file = await admin.media.upload(new Blob(["x"]), {
    signal,
  });
  const url: string = file.url;
  // @ts-expect-error An upload reports only where the file is served.
  void file.name;
  // @ts-expect-error The site SDK deliberately has no media manager.
  admin.media.list();
  await admin.signOut();
}

async function auth() {
  const admin: Owner | null = await naru.auth.session();
  if (!admin) await naru.auth.signIn({ collections: ["posts"] });
}

function failed(error: unknown) {
  if (!(error instanceof NaruError)) return;
  const code: NaruErrorCode = error.code;
  const retry: boolean = error.retryable;
  // @ts-expect-error HTTP status is not part of the contract.
  void error.status;
  void [code, retry];
}
// @ts-expect-error Only the SDK creates errors.
new NaruError("Conflict", "CONFLICT");
declare const opaque: Revision;
void [post, page, owner, auth, failed, opaque];
