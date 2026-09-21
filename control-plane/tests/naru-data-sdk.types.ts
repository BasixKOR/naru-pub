import {
  createNaru,
  type Document,
  type Json,
  NaruError,
  type Owner,
  type StoredFile,
  type WriteResult,
} from "../public/sdk/1.0.0/naru-data.js";

interface Post {
  title: string;
  published: boolean;
}
const naru = createNaru({ site: "alice" });
const posts = naru.collection<Post>("posts");
const other = naru.collection("other");
const signal = new AbortController().signal;

const post: Promise<Document<Post>> = posts.get("one", { signal });
posts.add({ title: "hello", published: false });
// @ts-expect-error Wrong field type.
posts.set("one", { title: 123, published: false });
const written: Promise<WriteResult> = posts.set(
  "one",
  { title: "hello", published: true },
  { ifAbsent: true, signal },
);
posts.delete("one", { ifRevision: "opaque" });

async function page() {
  let cursor: string | null = null;
  do {
    const result = await posts.list({
      where: { published: true, title: { gte: "a", lt: "b" } },
      orderBy: [
        ["title", "asc"],
        ["$createdAt", "desc"],
      ],
      limit: 20,
      cursor,
      count: true,
      signal,
    });
    const title: string = result.documents[0].data.title;
    const total: number | undefined = result.totalCount;
    cursor = result.nextCursor;
  } while (cursor);
  const loose: Json = (await other.get("one")).data;
}
// @ts-expect-error orderBy is always a list of pairs.
posts.list({ orderBy: "$createdAt" });
// @ts-expect-error Arrays are not filter values.
posts.list({ where: { tags: ["x"] } });
// @ts-expect-error Merge patches are not part of the API.
posts.update("one", { title: "x" });

async function owner(admin: Owner) {
  const drafts = admin.collection<Post>("drafts");
  await drafts.set("one", { title: "draft", published: false });
  const results = await admin.atomic([
    { type: "add", collection: "logs", data: { at: "now" } },
    { type: "set", collection: "posts", id: "one", data: {}, ifAbsent: true },
    { type: "delete", collection: "drafts", id: "one" },
  ]);
  const file: StoredFile = await admin.files.upload(new Blob(["x"]), {
    signal,
  });
  const url: string = file.url;
  // @ts-expect-error The site SDK deliberately has no media manager.
  admin.files.list();
  await admin.signOut();
}

async function auth() {
  const admin: Owner | null = await naru.auth.session();
  if (!admin) await naru.auth.signIn({ collections: ["posts"] });
}

const error: Error = new NaruError("Conflict", "CONFLICT");
void [post, written, page, owner, auth, error];
