// Run: node --experimental-vm-modules --test tests/database-blog.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { SourceTextModule, SyntheticModule } from "node:vm";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("jest-environment-jsdom"))(
  "jsdom",
);
const root = new URL("../public/examples/database-blog/", import.meta.url);
async function page(name, db, storage = new Map(), query = "") {
  // The admin page lives in its own directory so it is served at /blog/admin/.
  const file = name === "admin" ? "admin/index.html" : `${name}.html`;
  const url = `https://example.naru.pub/blog/${name === "admin" ? "admin/" : file}`;
  const dom = new JSDOM(await readFile(new URL(file, root), "utf8"), {
    url: `${url}${query}`,
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.confirm = () => true;
  for (const [key, value] of storage) window.sessionStorage.setItem(key, value);
  const context = dom.getInternalVMContext(),
    events = new Map();
  const add = window.EventTarget.prototype.addEventListener;
  window.EventTarget.prototype.addEventListener = function (
    type,
    handler,
    ...rest
  ) {
    if (this.id) events.set(`${this.id}:${type}`, handler);
    return add.call(this, type, handler, ...rest);
  };
  const modules = new Map();
  modules.set(
    "config.js",
    new SyntheticModule(
      ["config"],
      function () {
        this.setExport("config", { site: "example" });
      },
      { context },
    ),
  );
  modules.set(
    "client.js",
    new SyntheticModule(
      ["connect"],
      function () {
        // Only what NaruClient exposes, so pages cannot rely on anything else.
        this.setExport("connect", async () => ({
          collection: (name) => db.collection(name),
          auth: {
            session: () => db.auth?.session?.() ?? db.adminSession?.(),
            signIn: ({ collections }) =>
              db.auth?.signIn?.({ collections }) ?? db.signIn?.(collections),
          },
        }));
      },
      { context },
    ),
  );
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    const mod = new SourceTextModule(
      await readFile(new URL(name, root), "utf8"),
      { context },
    );
    modules.set(name, mod);
    await mod.link((specifier) => load(specifier.replace(/^\.\//, "")));
    return mod;
  }
  // Resolve the page's script the way the browser would, relative to the page.
  const script = new URL(
    window.document.querySelector('script[type="module"]').getAttribute("src"),
    url,
  ).href.slice("https://example.naru.pub/blog/".length);
  await (await load(script)).evaluate();
  return {
    setConfirm: (answer) => {
      window.confirm = () => answer;
    },
    $: (id) => window.document.getElementById(id),
    fire: (id, type) => events.get(`${id}:${type}`)({ preventDefault() {} }),
    storage: () =>
      new Map(
        Array.from({ length: window.sessionStorage.length }, (_, i) => {
          const k = window.sessionStorage.key(i);
          return [k, window.sessionStorage.getItem(k)];
        }),
      ),
  };
}
test("post list paginates and renders hostile input as text", async () => {
  const requests = [];
  const app = await page("index", {
    collection(name) {
      assert.equal(name, "posts");
      return {
        list: async (options) => {
          requests.push(options);
          return requests.length === 1
            ? {
                documents: [
                  {
                    id: "a",
                    data: {
                      title: "<img src=x onerror=alert(1)>",
                      body: "<script>bad()</script>",
                    },
                  },
                ],
                nextCursor: "a",
              }
            : { documents: [{ id: "b", data: null }], nextCursor: null };
        },
      };
    },
  });
  assert.equal(app.$("entries").querySelector("img,script"), null);
  assert.match(app.$("entries").textContent, /<img/);
  assert.equal(app.$("more").hidden, false);
  await app.fire("more", "click");
  assert.equal(requests[1].after, "a");
  assert.ok(
    requests.every(
      (r) => r.sort[0][0].metadata === "createdAt" && r.sort[0][1] === "desc",
    ),
  );
  assert.equal(app.$("entries").children.length, 2);
  assert.equal(app.$("more").hidden, true);
});
test("post detail reads selected ID and preserves plain text", async () => {
  const app = await page(
    "post",
    {
      collection: () => ({
        get: async (id) => {
          assert.equal(id, "hello");
          return { data: { title: "첫 글", body: "<b>본문</b>" } };
        },
      }),
    },
    new Map(),
    "?id=hello",
  );
  assert.equal(app.$("body").textContent, "<b>본문</b>");
  assert.equal(app.$("body").children.length, 0);
});
test("guestbook submits via add only and resets after success", async () => {
  const writes = [];
  const app = await page("guestbook", {
    collection(name) {
      assert.equal(name, "guestbook");
      return {
        list: async () => ({ documents: [], nextCursor: null }),
        add: async (data) => {
          writes.push(data);
          return { id: "generated" };
        },
      };
    },
  });
  app.$("name").value = " 방문자 ";
  app.$("message").value = " 안녕 ";
  await app.fire("entry-form", "submit");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].message, "안녕");
  assert.equal(app.$("message").value, "");
  assert.equal(app.$("submit").disabled, false);
});
test("admin preserves draft across login, retries same ID, fails closed on expiry", async () => {
  let requested;
  const before = await page("admin", {
    adminSession: async () => null,
    signIn: async (collections) => {
      requested = collections;
    },
  });
  assert.equal(before.$("publish").disabled, true);
  before.$("title").value = "제목";
  before.$("body").value = "본문";
  await before.fire("login", "click");
  assert.equal(requested.join(), "posts,drafts");
  const writes = [];
  let failure = new Error("response lost");
  const admin = fakeAdmin({
    collection: () => ({
      get: async (id) => ({
        id,
        data: writes.at(-1).data,
        revision: "r1.saved",
      }),
      list: async () => ({ documents: [], nextCursor: null }),
    }),
    async batch(operations) {
      const operation = operations[0].set;
      writes.push({ id: operation.id, data: operation.data });
      if (failure) throw failure;
    },
  });
  const after = await page(
    "admin",
    { adminSession: async () => admin },
    before.storage(),
  );
  assert.equal(after.$("title").value, "제목");
  await after.fire("post-form", "submit");
  assert.equal(after.$("body").value, "본문");
  failure = null;
  await after.fire("post-form", "submit");
  assert.equal(writes[0].id, writes[1].id);
  assert.equal(after.$("view-post").hidden, false);
  assert.match(
    after.$("view-post").href,
    /^https:\/\/example\.naru\.pub\/blog\/post\.html\?id=/,
  );
  assert.equal(after.storage().size, 1);
  await after.fire("new-post", "click");
  after.$("title").value = "다음 글";
  after.$("body").value = "내용";
  failure = Object.assign(new Error("expired"), { code: "AUTH_REQUIRED" });
  await after.fire("post-form", "submit");
  assert.equal(after.$("publish").disabled, true);
  assert.equal(after.$("login").hidden, false);
  assert.equal(after.$("body").value, "내용");
});
test("admin clears local authorization when server revocation fails", async () => {
  const app = await page("admin", {
    adminSession: async () =>
      fakeAdmin({
        signOut: async () => {
          throw new Error("offline");
        },
      }),
  });
  await app.fire("logout", "click");
  assert.equal(app.$("publish").disabled, true);
  assert.equal(app.$("login").hidden, false);
  assert.match(app.$("status").textContent, /나루에 알리지 못했습니다/);
});

test("guestbook distinguishes successful save from failed list refresh", async () => {
  let reads = 0;
  const app = await page("guestbook", {
    collection: () => ({
      list: async () => {
        if (++reads > 1) throw new Error("offline");
        return { documents: [], nextCursor: null };
      },
      add: async () => ({ id: "saved" }),
    }),
  });
  app.$("name").value = "방문자";
  app.$("message").value = "안녕";
  await app.fire("entry-form", "submit");
  assert.match(app.$("status").textContent, /저장되었지만/);
  assert.equal(app.$("message").value, "");
});

test("malformed draft does not prevent admin callback completion", async () => {
  let completed = false;
  const app = await page(
    "admin",
    {
      adminSession: async () => {
        completed = true;
        return fakeAdmin();
      },
    },
    new Map([["naru:blog-draft:example:/blog/admin/", "invalid JSON"]]),
  );
  assert.equal(completed, true);
  assert.equal(app.$("publish").disabled, false);
  assert.match(app.$("status").textContent, /되살리지 못했습니다/);
});

test("category changes reset the cursor and preserve filters on subsequent pages", async () => {
  const calls = [];
  const app = await page("index", {
    collection: () => ({
      list: async (options) => {
        calls.push(options);
        return {
          documents: [
            {
              id: String(calls.length),
              data: { title: "제목", category: "일상" },
            },
          ],
          nextCursor: "v1.next",
        };
      },
    }),
  });
  await app.fire("more", "click");
  app.$("filter-category").value = "일상";
  await app.fire("filter-form", "submit");
  assert.equal(calls[2].after, undefined);
  assert.equal(calls[2].filter.category, "일상");
  assert.equal(app.$("entries").children.length, 1);
  await app.fire("more", "click");
  assert.equal(calls[3].after, "v1.next");
  assert.equal(calls[3].filter.category, "일상");
  app.$("filter-category").value = "";
  await app.fire("filter-form", "submit");
  assert.equal(Object.keys(calls[4].filter).length, 0);
  assert.equal(calls[4].after, undefined);
});
// Stands in for the SDK's admin client.
function fakeAdmin(methods = {}) {
  return { ...methods };
}
function editorBackend() {
  const rows = { posts: new Map(), drafts: new Map() },
    calls = [];
  let failure;
  const versions = { posts: new Map(), drafts: new Map() };
  const revision = (kind, id) => `test.${versions[kind].get(id) ?? 1}`;
  const check = (kind, id, condition) => {
    if (
      (condition?.absent && rows[kind].has(id)) ||
      (condition?.revision &&
        (!rows[kind].has(id) || condition.revision !== revision(kind, id)))
    )
      throw Object.assign(new Error("conflict"), { code: "CONFLICT" });
  };
  return {
    rows,
    calls,
    setFailure(fn) {
      failure = fn;
    },
    admin: fakeAdmin({
      async batch(writes) {
        for (const write of writes) {
          const type = write.set ? "set" : "delete";
          const operation = write.set ?? write.delete;
          check(write.collection, operation.id, operation.condition);
          const error = failure?.(type, write.collection);
          if (error) throw error;
        }
        for (const write of writes) {
          const type = write.set ? "set" : "delete";
          const operation = write.set ?? write.delete;
          calls.push([type, write.collection, operation.id]);
          if (write.set)
            rows[write.collection].set(
              operation.id,
              structuredClone(write.set.data),
            );
          else rows[write.collection].delete(operation.id);
          versions[write.collection].set(
            operation.id,
            (versions[write.collection].get(operation.id) ?? 1) + 1,
          );
        }
      },
      collection(kind) {
        assert.ok(kind in rows);
        return {
          async set(id, data, options = {}) {
            check(kind, id, options.condition);
            calls.push(["set", kind, id]);
            const error = failure?.("set", kind);
            if (error) throw error;
            rows[kind].set(id, structuredClone(data));
            versions[kind].set(id, (versions[kind].get(id) ?? 1) + 1);
            return {
              id,
              data: structuredClone(data),
              revision: revision(kind, id),
            };
          },
          async delete(id, options = {}) {
            check(kind, id, options.condition);
            calls.push(["delete", kind, id]);
            const error = failure?.("delete", kind);
            if (error) throw error;
            rows[kind].delete(id);
            return { success: true };
          },
          async get(id) {
            if (!rows[kind].has(id))
              throw Object.assign(new Error("missing"), { code: "NOT_FOUND" });
            return {
              id,
              data: structuredClone(rows[kind].get(id)),
              revision: revision(kind, id),
            };
          },
          async list() {
            return {
              documents: [...rows[kind]].map(([id, data]) => ({
                id,
                data: structuredClone(data),
                revision: revision(kind, id),
              })),
              nextCursor: null,
            };
          },
        };
      },
    }),
  };
}
test("server drafts survive publication failure; retry publishes same ID before cleanup", async () => {
  const db = editorBackend(),
    app = await page("admin", { adminSession: async () => db.admin });
  app.$("title").value = "초안";
  app.$("body").value = "비공개 내용";
  app.$("category").value = "일상";
  await app.fire("save-draft", "click");
  assert.equal(db.rows.drafts.size, 1);
  assert.equal(db.rows.posts.size, 0);
  const id = [...db.rows.drafts.keys()][0];
  db.setFailure((op, kind) =>
    op === "set" && kind === "posts" ? new Error("offline") : null,
  );
  await app.fire("post-form", "submit");
  assert.equal(db.rows.drafts.size, 1);
  assert.equal(db.rows.posts.size, 0);
  db.setFailure(() => null);
  await app.fire("post-form", "submit");
  assert.equal(db.rows.posts.get(id).category, "일상");
  assert.equal(db.rows.drafts.size, 0);
  assert.deepEqual(db.calls.slice(-2), [
    ["set", "posts", id],
    ["delete", "drafts", id],
  ]);
  assert.match(app.$("editing").textContent, /공개한 글 고치는 중/);
});
test("batch cleanup failure rolls publication back and can be retried", async () => {
  const db = editorBackend(),
    app = await page("admin", { adminSession: async () => db.admin });
  app.$("title").value = "제목";
  app.$("body").value = "내용";
  await app.fire("save-draft", "click");
  db.setFailure((op, kind) =>
    op === "delete" && kind === "drafts" ? new Error("offline") : null,
  );
  await app.fire("post-form", "submit");
  assert.equal(db.rows.posts.size, 0);
  assert.equal(db.rows.drafts.size, 1);
  assert.match(app.$("status").textContent, /offline/);
  db.setFailure(() => null);
  await app.fire("post-form", "submit");
  assert.equal(db.rows.posts.size, 1);
  assert.equal(db.rows.drafts.size, 0);
});
test("editing preserves extra fields and deletion confirms and affects only selected collection", async () => {
  const db = editorBackend();
  db.rows.posts.set("existing", {
    title: "이전 글",
    body: "본문",
    category: "일상",
    extra: 42,
  });
  db.rows.drafts.set("existing", { title: "다른 초안", body: "내용" });
  const app = await page("admin", {
    adminSession: async () => db.admin,
  });
  await app.fire("reload-list", "click");
  await app.fire("edit-posts-existing", "click");
  app.$("title").value = "수정된 글";
  await app.fire("post-form", "submit");
  assert.equal(db.rows.posts.get("existing").title, "수정된 글");
  assert.equal(db.rows.posts.get("existing").extra, 42);
  app.setConfirm(false);
  await app.fire("delete-post", "click");
  assert.equal(db.rows.posts.size, 1);
  app.setConfirm(true);
  await app.fire("delete-post", "click");
  assert.equal(db.rows.posts.size, 0);
  assert.equal(db.rows.drafts.size, 1);
  assert.match(app.$("editing").textContent, /새 글/);
});

test("two editors cannot overwrite or delete a post saved by the other", async () => {
  const db = editorBackend();
  db.rows.posts.set("shared", { title: "Original", body: "Body" });
  const first = await page("admin", { adminSession: async () => db.admin });
  const second = await page("admin", { adminSession: async () => db.admin });
  for (const app of [first, second]) {
    await app.fire("reload-list", "click");
    await app.fire("edit-posts-shared", "click");
  }
  first.$("title").value = "First save";
  await first.fire("post-form", "submit");
  second.$("title").value = "Stale save";
  await second.fire("post-form", "submit");
  assert.equal(db.rows.posts.get("shared").title, "First save");
  assert.match(second.$("status").textContent, /다른 곳에서/);
  await second.fire("delete-post", "click");
  assert.equal(db.rows.posts.has("shared"), true);
  // The first editor received a fresh document and can save again.
  first.$("title").value = "Second save";
  await first.fire("post-form", "submit");
  assert.equal(db.rows.posts.get("shared").title, "Second save");
});

test("publication does not delete a draft changed since it was opened", async () => {
  const db = editorBackend();
  db.rows.drafts.set("draft", { title: "Draft", body: "Body" });
  const app = await page("admin", { adminSession: async () => db.admin });
  app.$("manage-kind").value = "drafts";
  await app.fire("reload-list", "click");
  await app.fire("edit-drafts-draft", "click");
  await db.admin
    .collection("drafts")
    .set("draft", { title: "Other editor", body: "New body" });
  await app.fire("post-form", "submit");
  assert.equal(db.rows.posts.size, 0);
  assert.equal(db.rows.drafts.get("draft").title, "Other editor");
  assert.match(app.$("status").textContent, /다른 곳에서/);
});
