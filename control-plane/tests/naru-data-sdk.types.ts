import {
  createNaru,
  type Document,
  type Json,
  type Media,
  NaruError,
  type Owner,
  type Revision,
  type WriteResult,
} from "../public/sdk/1.0.0/naru-data.js";

interface Post {
  title: string;
  published: boolean;
}
const naru = createNaru({ site: "alice" });
const posts = naru.public.collection<Post>("posts");
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
      page: { size: 20, after: cursor, includeTotal: true },
      signal,
    });
    const title: string = result.documents[0].data.title;
    const total: number | undefined = result.totalCount;
    cursor = result.nextCursor;
  } while (cursor);
  const loose: Json = (await other.get("one")).data;
}
// @ts-expect-error sort is always a list of pairs.
posts.list({ sort: "createdAt" });
// @ts-expect-error Arrays are not filter values.
posts.list({ filter: { tags: ["x"] } });
// @ts-expect-error Merge patches are not part of the API.
posts.update("one", { title: "x" });

async function owner(admin: Owner) {
  const drafts = admin.collection<Post>("drafts");
  await drafts.set("one", { title: "draft", published: false });
  const revision = (await drafts.get("one")).revision;
  const written: Promise<WriteResult> = drafts.set(
    "one",
    { title: "edited", published: false },
    { condition: { revision }, signal },
  );
  await admin.transaction([
    {
      collection: "posts",
      set: { id: "one", data: {}, condition: { absent: true } },
    },
    { collection: "drafts", delete: { id: "one" } },
  ]);
  const file: Media = await admin.media.upload(new Blob(["x"]), {
    signal,
  });
  const url: string = file.url;
  // @ts-expect-error The site SDK deliberately has no media manager.
  admin.media.list();
  await admin.signOut();
}

async function auth() {
  const admin: Owner | null = await naru.auth.session();
  if (!admin) await naru.auth.signIn({ collections: ["posts"] });
}

const error: Error = new NaruError("Conflict", "CONFLICT");
declare const opaque: Revision;
void [post, page, owner, auth, error, opaque];
