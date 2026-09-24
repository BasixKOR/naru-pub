import {
  createNaru,
  type Document,
  type Filter,
  type Json,
  type ListOptions,
  NaruError,
  type NaruErrorCode,
  type Admin,
  type AdminCollection,
  type Page,
  type PublicCollection,
  type Revision,
  type Sort,
  type WriteCondition,
} from "../public/sdk/1.0.0/naru.js";
// Only names an application writes itself are exported.
// @ts-expect-error Spelled out in place rather than exported.
import type { WriteResult } from "../public/sdk/1.0.0/naru.js";

interface Post {
  title: string;
  published: boolean;
}
const naru = createNaru({ site: "alice" });
const posts: PublicCollection<Post> = naru.collection<Post>("posts");
const other = naru.collection("other");
const signal = new AbortController().signal;

const post: Promise<Document<Post>> = posts.get("one", { signal });
const added: Promise<Document<Post>> = posts.add({
  title: "hello",
  published: false,
});
// @ts-expect-error Visitor access is the default, without another namespace.
void naru.public;
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
async function walk() {
  const total: number = await posts.count({ filter: { published: true } });
  for await (const page of posts.pages({ sort: [["title", "asc"]], size: 100 }))
    for (const document of page.documents) {
      const title: string = document.data.title;
      void title;
    }
  // @ts-expect-error A count has nothing to sort or page.
  posts.count({ size: 10 });
  void total;
}
void walk;
// @ts-expect-error sort is always a list of pairs.
posts.list({ sort: "createdAt" });
// @ts-expect-error Arrays are not filter values.
posts.list({ filter: { tags: ["x"] } });
posts.list({ sort: [[{ metadata: "id" }, "desc"]] });
// Helpers that pass options along can name them.
const recent: Sort = [[{ metadata: "createdAt" }, "desc"]];
const published: Filter = { published: true };
const everything = (options: ListOptions) =>
  posts.list({ ...options, size: 100 });
void everything({ sort: recent, filter: published });
// @ts-expect-error Merge patches are not part of the API.
posts.update("one", { title: "x" });

async function admin(admin: Admin) {
  const drafts: AdminCollection<Post> = admin.collection<Post>("drafts");
  await drafts.set("one", { title: "draft", published: false });
  const revision = (await drafts.get("one")).revision;
  const written = await drafts.set(
    "one",
    { title: "edited", published: false },
    { condition: { revision }, signal },
  );
  const next: Revision = written.revision;
  const created: string = written.createdAt;
  const saved: string = written.updatedAt;
  const expected: WriteCondition = next ? { revision: next } : { absent: true };
  // @ts-expect-error "Delete only if absent" could only ever do nothing.
  await drafts.delete("one", { condition: { absent: true } });
  await drafts.delete("one", { condition: { revision: next } });
  void [created, saved, expected];
  const [stored0, removed] = await admin.batch([
    {
      collection: "posts",
      set: { id: "one", data: {}, condition: { absent: true } },
    },
    { collection: "drafts", delete: { id: "one" } },
  ]);
  // A set reports its new revision; a delete reports null.
  const after: Revision | undefined = stored0?.revision;
  void [after, removed];
  // Documents typed with interfaces go in a batch as they go in set(), even
  // when the batch spans collections of different shapes.
  const post: Post = { title: "x", published: true };
  interface Category {
    name: string;
  }
  const category: Category = { name: "news" };
  await admin.batch([
    { collection: "posts", set: { id: "one", data: post } },
    { collection: "categories", set: { id: "news", data: category } },
  ]);
  // @ts-expect-error A batch result carries metadata, not the data written.
  void stored0?.data;
  const file = await admin.media.upload(new Blob(["x"]), {
    signal,
    onProgress(progress) {
      if (progress.phase === "uploading") {
        const share: number = progress.loaded / progress.total;
        void share;
      }
      // @ts-expect-error Only an upload in progress has byte counts.
      if (progress.phase === "finishing") void progress.loaded;
    },
  });
  const url: string = file.url;
  const stored: [string, string, number] = [
    file.name,
    file.contentType,
    file.size,
  ];
  // @ts-expect-error The website SDK does not manage the library by id.
  void file.id;
  void stored;
  // @ts-expect-error The site SDK deliberately has no media manager.
  admin.media.list();
  await admin.signOut();
}

async function auth() {
  const admin: Admin | null = await naru.auth.session();
  if (!admin) await naru.auth.signIn({ collections: ["posts"] });
}

function failed(error: unknown) {
  if (!(error instanceof NaruError)) return;
  const code: NaruErrorCode = error.code;
  // @ts-expect-error A transient error does not make a write safe to retry.
  void error.retryable;
  // @ts-expect-error HTTP status is not part of the contract.
  void error.status;
  void code;
}
// @ts-expect-error Only the SDK creates errors.
new NaruError("Conflict", "CONFLICT");
declare const opaque: Revision;
void [post, page, admin, auth, failed, opaque];
