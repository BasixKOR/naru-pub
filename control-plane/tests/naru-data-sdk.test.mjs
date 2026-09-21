import { test } from "node:test";
import assert from "node:assert/strict";
import { createNaru, NaruError } from "../public/sdk/1.0.0/naru-data.js";

const collection = (name, options) =>
  createNaru(options).public.collection(name);
const ownerSession = (options) => createNaru(options).auth.session();
const signIn = ({ collections, ...options }) =>
  createNaru(options).auth.signIn({ collections });

const SESSION =
  "naru:owner:https://naru.pub:alice:https://alice.naru.pub/admin.html";

// The SDK reads location, sessionStorage and history as globals, the way a
// page does. Each test gets a fresh set, and every call fetch receives.
async function browser(
  run,
  { href = "https://alice.naru.pub/admin.html" } = {},
) {
  const names = ["location", "sessionStorage", "history", "fetch"];
  const saved = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const storage = new Map();
  const calls = [];
  let respond = () => Response.json({});
  const location = {
    href,
    get origin() {
      return new URL(this.href).origin;
    },
    get pathname() {
      return new URL(this.href).pathname;
    },
    get hostname() {
      return new URL(this.href).hostname;
    },
    assign(url) {
      this.href = url;
    },
  };
  const values = {
    location,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    history: {
      state: null,
      replaceState: (_state, _title, url) => (location.href = url),
    },
    fetch: async (url, init = {}) => {
      const call = { url: new URL(url), method: "GET", ...init };
      calls.push(call);
      return respond(call);
    },
  };
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: values[name],
    });
  try {
    await run({
      calls,
      storage,
      location,
      respond: (handler) => (respond = handler),
    });
  } finally {
    names.forEach((name, index) =>
      saved[index]
        ? Object.defineProperty(globalThis, name, saved[index])
        : delete globalThis[name],
    );
  }
}

const written = (id = "one", version = 1) => ({
  id,
  revision: `r1.${version.toString(36)}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const revision = (version = 1) => `r1.${version.toString(36)}`;
const saveSession = (storage, expiresAt = Date.now() + 3600000) =>
  storage.set(
    SESSION,
    JSON.stringify({ accessToken: "t".repeat(43), expiresAt }),
  );
const emptyPage = () => Response.json({ documents: [], nextPageToken: null });

test("a page on <site>.naru.pub needs no site; anywhere else must name one", async () => {
  await browser(async ({ calls, respond }) => {
    respond(emptyPage);
    await collection("posts").list();
    assert.equal(calls[0].url.href, "https://naru.pub/api/data/alice/posts");
    await collection("posts", { site: "bob" }).list();
    assert.equal(calls[1].url.pathname, "/api/data/bob/posts");
  });
  await browser(
    async () => {
      assert.throws(() => collection("posts"), /site/);
      assert.throws(() => collection("posts", { site: "../bob" }), TypeError);
      collection("posts", {
        site: "alice",
        controlPlaneOrigin: "http://localhost:3000",
      });
      assert.throws(
        () =>
          collection("posts", {
            site: "alice",
            controlPlaneOrigin: "https://evil.example",
          }),
        TypeError,
      );
    },
    { href: "https://alice.example/" },
  );
});

test("documents are read and written with plain requests that carry no cookies", async () => {
  await browser(async ({ calls, respond, storage }) => {
    saveSession(storage);
    const document = { ...written(), data: { title: "hello" } };
    respond(({ method }) =>
      Response.json(
        method === "GET"
          ? { document }
          : method === "DELETE"
            ? { success: true }
            : written(),
      ),
    );
    const posts = collection("posts");
    assert.deepEqual(await posts.get("one"), {
      id: "one",
      data: { title: "hello" },
      revision: "r1.1",
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
    assert.deepEqual(await posts.add({ title: "new" }), {
      id: "one",
      revision: "r1.1",
      createdAt: written().createdAt,
      updatedAt: written().updatedAt,
    });
    const owned = await ownerSession();
    await owned
      .collection("posts")
      .set("one", { title: "x" }, { condition: { absent: true } });
    assert.equal(
      await owned.collection("posts").delete("one", {
        condition: { revision: revision(3) },
      }),
      undefined,
    );
    assert.deepEqual(
      calls.map(({ method, url }) => [method, url.pathname + url.search]),
      [
        ["GET", "/api/data/alice/posts/one"],
        ["POST", "/api/data/alice/posts"],
        ["PUT", "/api/data/alice/posts/one?ifAbsent=1"],
        ["DELETE", "/api/data/alice/posts/one?ifRevision=r1.3"],
      ],
    );
    assert.deepEqual(JSON.parse(calls[1].body), { data: { title: "new" } });
    assert.equal((await posts.add({ title: "revision" })).revision, "r1.1");
    assert.equal(calls[3].body, undefined);
    for (const [index, call] of calls.entries()) {
      assert.equal(call.credentials, "omit");
      assert.equal(call.redirect, "error");
      assert.equal(
        call.headers.Authorization,
        index === 2 || index === 3 ? `Bearer ${"t".repeat(43)}` : undefined,
      );
      assert.equal(call.headers.Accept, "application/vnd.naru.data.v1+json");
    }
    // ".." would resolve to another path once inside a URL.
    assert.throws(() => owned.collection("posts").set("..", {}), TypeError);
    assert.throws(() => collection("a/b"), TypeError);
  });
});

test("list sends only the query options that constrain something", async () => {
  await browser(async ({ calls, respond }) => {
    respond(() =>
      Response.json({ documents: [], nextPageToken: "next", total: 3 }),
    );
    const posts = collection("posts");
    await posts.list({ filter: {}, page: { after: null } });
    assert.equal(calls[0].url.search, "");
    const page = await posts.list({
      filter: { category: "일상", date: { gte: "2026-09-01" } },
      sort: [
        ["date", "desc"],
        [{ metadata: "createdAt" }, "desc"],
      ],
      page: { size: 8, after: "next", includeTotal: true },
    });
    assert.equal(page.totalCount, 3);
    const search = calls[1].url.searchParams;
    assert.deepEqual(JSON.parse(search.get("where")), {
      category: "일상",
      date: { gte: "2026-09-01" },
    });
    assert.deepEqual(JSON.parse(search.get("orderBy")), [
      ["data.date", "desc"],
      ["createdAt", "desc"],
    ]);
    assert.equal(search.get("limit"), "8");
    assert.equal(search.get("pageToken"), "next");
    assert.equal(search.get("includeTotal"), "1");
  });
});

test("revisions are passed through without client-side parsing", async () => {
  await browser(async ({ calls, respond, storage }) => {
    saveSession(storage);
    respond(() => Response.json({ ...written(), revision: "future.token" }));
    const posts = (await ownerSession()).collection("posts");
    assert.equal((await posts.set("one", {})).revision, "future.token");
    await posts.delete("one", { condition: { revision: "future.token" } });
    assert.equal(calls[1].url.searchParams.get("ifRevision"), "future.token");
  });
});

test("errors have semantic codes and transport details stay diagnostic", async () => {
  await browser(async ({ respond, storage }) => {
    saveSession(storage);
    const posts = (await ownerSession()).collection("posts");
    respond(() =>
      Response.json(
        { error: "Document version does not match.", code: "VERSION_CONFLICT" },
        { status: 409 },
      ),
    );
    await assert.rejects(
      posts.set("one", {}, { condition: { revision: revision(1) } }),
      (error) => {
        assert.ok(error instanceof NaruError);
        assert.equal(error.status, 409);
        assert.equal(error.code, "CONFLICT");
        assert.equal(error.message, "Document version does not match.");
        return true;
      },
    );
    // A challenge or proxy page can answer 200; it is not an empty result.
    respond(() => new Response("<html>checking your browser</html>"));
    await assert.rejects(posts.get("one"), {
      status: 200,
      code: "UNAVAILABLE",
    });
    respond(() => Response.json(null));
    await assert.rejects(posts.list(), { code: "UNAVAILABLE" });
    respond(() => new Response("<html>bad gateway</html>", { status: 502 }));
    await assert.rejects(posts.get("one"), {
      status: 502,
      code: "UNAVAILABLE",
    });
    respond(() => {
      throw new TypeError("offline");
    });
    await assert.rejects(posts.get("one"), { code: "UNAVAILABLE" });
    const controller = new AbortController();
    respond(({ signal }) => {
      assert.equal(signal, controller.signal);
      throw new DOMException("aborted", "AbortError");
    });
    controller.abort();
    await assert.rejects(posts.list({ signal: controller.signal }), {
      name: "AbortError",
    });
  });
});

test("a collection this browser wrote is read past the shared cache for ten seconds", async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await browser(async ({ calls, respond }) => {
      respond(({ method }) =>
        method === "POST" ? Response.json(written()) : emptyPage(),
      );
      const guestbook = collection("guestbook");
      await guestbook.list();
      await guestbook.add({ message: "hi" });
      await guestbook.list();
      // Unwritten here (the SDK's memory outlives one test, so not "posts").
      await collection("notes").list();
      // Another site's collection of the same name is a different entry.
      await collection("guestbook", { site: "bob" }).list();
      assert.deepEqual(
        calls.map((call) => call.cache),
        ["default", "no-store", "no-store", "default", "default"],
      );
      now += 10_001;
      await guestbook.list();
      assert.equal(calls.at(-1).cache, "default");
      // A write whose response was lost may still have landed.
      respond(({ method }) => {
        if (method === "POST") throw new TypeError("offline");
        return emptyPage();
      });
      await assert.rejects(guestbook.add({ message: "again" }), {
        code: "UNAVAILABLE",
      });
      await guestbook.list();
      assert.equal(calls.at(-1).cache, "no-store");
    });
  } finally {
    Date.now = realNow;
  }
});

test("signIn discovers the client and leaves for approval with a PKCE challenge", async () => {
  await browser(async ({ calls, respond, storage, location }) => {
    respond(() => Response.json({ clientId: "client-1" }));
    await signIn({ collections: ["posts", "drafts"] });
    assert.equal(calls[0].url.pathname, "/api/data-auth/discover");
    assert.equal(
      calls[0].url.searchParams.get("redirectUri"),
      "https://alice.naru.pub/admin.html",
    );
    const approval = new URL(location.href);
    assert.equal(
      approval.origin + approval.pathname,
      "https://naru.pub/database/authorize",
    );
    const pending = JSON.parse(storage.get(`${SESSION}:pending`));
    assert.equal(pending.clientId, "client-1");
    assert.equal(approval.searchParams.get("clientId"), "client-1");
    assert.equal(approval.searchParams.get("state"), pending.state);
    assert.equal(approval.searchParams.get("collections"), "posts,drafts");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(pending.verifier),
    );
    assert.equal(
      approval.searchParams.get("challenge"),
      Buffer.from(digest).toString("base64url"),
    );
  });
  await browser(async ({ respond, location }) => {
    respond(() =>
      Response.json(
        {
          error: "Administrator callback is not registered.",
          code: "UNREGISTERED_REDIRECT_URI",
        },
        { status: 404 },
      ),
    );
    await assert.rejects(signIn({ collections: ["posts"] }), {
      code: "REDIRECT_NOT_REGISTERED",
    });
    assert.equal(location.href, "https://alice.naru.pub/admin.html");
  });
});

test("ownerSession exchanges the returned code once and strips it from the address", async () => {
  await browser(async ({ calls, respond, storage, location }) => {
    storage.set(
      `${SESSION}:pending`,
      JSON.stringify({
        clientId: "client-1",
        verifier: "v".repeat(43),
        state: "s1",
        startedAt: Date.now(),
      }),
    );
    location.href = "https://alice.naru.pub/admin.html?tab=2&code=c1&state=s1";
    const expiresAt = Date.now() + 3600000;
    respond(() => Response.json({ accessToken: "t".repeat(43), expiresAt }));
    const owner = await ownerSession();
    assert.ok(owner);
    assert.equal(location.href, "https://alice.naru.pub/admin.html?tab=2");
    assert.equal(calls[0].url.href, "https://naru.pub/api/data-auth/token");
    assert.deepEqual(JSON.parse(calls[0].body), {
      code: "c1",
      verifier: "v".repeat(43),
      clientId: "client-1",
      redirectUri: "https://alice.naru.pub/admin.html",
    });
    assert.equal(storage.has(`${SESSION}:pending`), false);
    assert.deepEqual(JSON.parse(storage.get(SESSION)), {
      accessToken: "t".repeat(43),
      expiresAt,
    });
    // A reload restores the same deadline without a request.
    assert.ok(await ownerSession());
    assert.equal(calls.length, 1);
  });
  for (const query of [
    "?code=c1&state=forged",
    "?error=access_denied&state=s1",
  ])
    await browser(async ({ calls, storage, location }) => {
      storage.set(
        `${SESSION}:pending`,
        JSON.stringify({ state: "s1", startedAt: Date.now() }),
      );
      location.href = `https://alice.naru.pub/admin.html${query}`;
      await assert.rejects(ownerSession(), NaruError);
      assert.equal(calls.length, 0);
      assert.equal(location.href, "https://alice.naru.pub/admin.html");
    });
});

test("a page's own ?code= is left alone when no sign-in was started here", async () => {
  await browser(async ({ calls, storage, location }) => {
    location.href =
      "https://alice.naru.pub/admin.html?code=SUMMER&error=none&state=x";
    assert.equal(await ownerSession(), null);
    saveSession(storage);
    assert.ok(await ownerSession());
    assert.equal(
      location.href,
      "https://alice.naru.pub/admin.html?code=SUMMER&error=none&state=x",
    );
    // A sign-in in progress does not claim a ?code= that carries no state.
    storage.set(
      `${SESSION}:pending`,
      JSON.stringify({ state: "s1", startedAt: Date.now() }),
    );
    location.href = "https://alice.naru.pub/admin.html?code=SUMMER";
    assert.ok(await ownerSession());
    assert.equal(
      location.href,
      "https://alice.naru.pub/admin.html?code=SUMMER",
    );
    assert.equal(calls.length, 0);
  });
});

test("the owner client sends its token and forgets it when the session ends", async () => {
  await browser(async ({ calls, respond, storage }) => {
    assert.equal(await ownerSession(), null);
    saveSession(storage, Date.now() - 1);
    assert.equal(await ownerSession(), null);
    assert.equal(storage.has(SESSION), false);

    saveSession(storage);
    const owner = await ownerSession();
    respond(() => Response.json(written()));
    await owner.collection("posts").set("one", { title: "x" });
    assert.equal(calls[0].headers.Authorization, `Bearer ${"t".repeat(43)}`);
    assert.equal(calls[0].cache, "no-store");

    respond(() => Response.json({ error: "Revoked." }, { status: 401 }));
    await assert.rejects(owner.collection("posts").get("one"), {
      code: "AUTH_REQUIRED",
    });
    assert.equal(storage.has(SESSION), false);
    assert.equal(await ownerSession(), null);
  });
  await browser(async ({ calls, storage }) => {
    const realNow = Date.now;
    saveSession(storage, realNow() + 1000);
    const owner = await ownerSession();
    Date.now = () => realNow() + 2000;
    try {
      await assert.rejects(owner.collection("posts").list(), {
        code: "AUTH_REQUIRED",
      });
    } finally {
      Date.now = realNow;
    }
    assert.equal(calls.length, 0);
    assert.equal(storage.has(SESSION), false);
  });
});

test("signing out forgets the session before revoking, and never erases a newer one", async () => {
  await browser(async ({ calls, respond, storage }) => {
    saveSession(storage);
    const owner = await ownerSession();
    respond(() => {
      assert.equal(storage.has(SESSION), false);
      throw new TypeError("offline");
    });
    await assert.rejects(owner.signOut(), { code: "UNAVAILABLE" });
    assert.equal(calls[0].url.pathname, "/api/data-auth/revoke");
    assert.equal(calls[0].headers.Authorization, `Bearer ${"t".repeat(43)}`);

    saveSession(storage);
    const older = await ownerSession();
    storage.set(
      SESSION,
      JSON.stringify({
        accessToken: "n".repeat(43),
        expiresAt: Date.now() + 1e6,
      }),
    );
    respond(() => Response.json({}));
    await older.signOut();
    assert.equal(JSON.parse(storage.get(SESSION)).accessToken, "n".repeat(43));
  });
});

test("transaction sends semantic writes and returns no transport results", async () => {
  await browser(async ({ calls, respond, storage }) => {
    saveSession(storage);
    const owner = await ownerSession();
    respond(() =>
      Response.json({ results: [written("hello"), { success: true }] }),
    );
    const writes = [
      {
        collection: "posts",
        set: { id: "hello", data: {}, condition: { absent: true } },
      },
      { collection: "drafts", delete: { id: "hello" } },
    ];
    assert.equal(await owner.transaction(writes), undefined);
    assert.equal(calls[0].url.pathname, "/api/data/alice/_batch");
    assert.deepEqual(JSON.parse(calls[0].body), {
      operations: [
        {
          type: "set",
          collection: "posts",
          id: "hello",
          data: {},
          condition: { absent: true },
        },
        { type: "delete", collection: "drafts", id: "hello" },
      ],
    });
    // The public client reads both collections past the cache afterwards.
    respond(emptyPage);
    await collection("drafts").list();
    assert.equal(calls.at(-1).cache, "no-store");
  });
});

// Stands in for the browser's decode and encode steps.
function fakeImages({
  width,
  height,
  encodes = ["image/webp", "image/jpeg"],
  size = 1000,
}) {
  const steps = [];
  const oldBitmap = globalThis.createImageBitmap;
  const oldCanvas = globalThis.OffscreenCanvas;
  globalThis.createImageBitmap = async (_file, options) => {
    steps.push({ decode: options });
    return { width, height, close() {} };
  };
  globalThis.OffscreenCanvas = class {
    getContext() {
      const context = {
        fillStyle: "",
        fillRect: () => steps.push({ fill: context.fillStyle }),
        drawImage: (_bitmap, _x, _y, w, h) => steps.push({ draw: [w, h] }),
      };
      return context;
    }
    async convertToBlob({ type, quality }) {
      steps.push({ encode: type, quality });
      // Browsers hand back PNG for a type they cannot encode.
      const produced = encodes.includes(type) ? type : "image/png";
      return new Blob([new Uint8Array(size)], { type: produced });
    }
  };
  return {
    steps,
    restore() {
      globalThis.createImageBitmap = oldBitmap;
      globalThis.OffscreenCanvas = oldCanvas;
    },
  };
}

async function upload(file, images) {
  let calls;
  let stored;
  try {
    await browser(async (page) => {
      calls = page.calls;
      saveSession(page.storage);
      const owner = await ownerSession();
      page.respond(({ url, method }) => {
        if (url.host === "upload.example")
          return new Response(null, { status: 200 });
        if (method === "POST")
          return Response.json({
            id: "f1",
            uploadUrl: "https://upload.example/signed",
            headers: { "Content-Type": "image/webp" },
          });
        return Response.json({ file: { id: "f1", url: "https://media" } });
      });
      stored = await owner.media.upload(file);
    });
  } finally {
    images?.restore();
  }
  return { calls, stored, declared: JSON.parse(calls[0].body) };
}

test("upload authorizes, sends the bytes straight to storage, then finalizes", async () => {
  const file = new File(["hello"], "note.txt", { type: "text/plain" });
  const { calls, stored, declared } = await upload(file);
  assert.deepEqual(stored, { id: "f1", url: "https://media" });
  assert.deepEqual(
    calls.map(({ method, url }) => [method, url.href]),
    [
      ["POST", "https://naru.pub/api/data/alice/_files"],
      ["PUT", "https://upload.example/signed"],
      ["PUT", "https://naru.pub/api/data/alice/_files/f1"],
    ],
  );
  assert.deepEqual(declared, {
    name: "note.txt",
    contentType: "text/plain",
    size: 5,
  });
  assert.equal(calls[1].body, file);
  assert.equal(calls[1].headers.Authorization, undefined);
  assert.equal(calls[1].credentials, "omit");
});

test("a large photo is shrunk to 2048px WebP before authorization", async () => {
  const images = fakeImages({ width: 4096, height: 3072 });
  const photo = new File([new Uint8Array(4_000_000)], "IMG_1.JPG", {
    type: "image/jpeg",
  });
  const { calls, declared } = await upload(photo, images);
  assert.deepEqual(images.steps[0], {
    decode: { imageOrientation: "from-image" },
  });
  assert.deepEqual(
    images.steps.find((step) => step.draw),
    { draw: [2048, 1536] },
  );
  assert.deepEqual(declared, {
    name: "IMG_1.webp",
    contentType: "image/webp",
    size: 1000,
  });
  assert.equal(calls[1].body.type, "image/webp");
});

test("photos fall back to JPEG, and are left alone when shrinking would not help", async () => {
  // No WebP encoder: JPEG, on white since JPEG has no transparency.
  const noWebp = fakeImages({
    width: 3000,
    height: 3000,
    encodes: ["image/jpeg"],
  });
  const png = new File([new Uint8Array(4_000_000)], "a.png", {
    type: "image/png",
  });
  const jpeg = await upload(png, noWebp);
  assert.equal(jpeg.declared.contentType, "image/jpeg");
  assert.equal(jpeg.declared.name, "a.jpeg");
  assert.ok(noWebp.steps.some((step) => step.fill === "#fff"));

  // Small and within 2048px: never re-encoded.
  const tiny = fakeImages({ width: 64, height: 64 });
  const icon = new File([new Uint8Array(1000)], "icon.png", {
    type: "image/png",
  });
  assert.equal((await upload(icon, tiny)).calls[1].body, icon);
  assert.equal(tiny.steps.filter((step) => step.encode).length, 0);

  // Re-encoding came out bigger: the original goes up instead.
  const dense = new File([new Uint8Array(600_000)], "d.webp", {
    type: "image/webp",
  });
  const bigger = fakeImages({ width: 1000, height: 1000, size: 700_000 });
  assert.equal((await upload(dense, bigger)).calls[1].body, dense);

  // HEIC cannot be stored as is, so it is converted whatever the size.
  const heic = new File([new Uint8Array(100)], "IMG.HEIC", {
    type: "image/heic",
  });
  const converted = fakeImages({ width: 100, height: 100, size: 5000 });
  assert.equal(
    (await upload(heic, converted)).declared.contentType,
    "image/webp",
  );
});

test("a failed transfer is reported and not finalized", async () => {
  await browser(async ({ calls, respond, storage }) => {
    saveSession(storage);
    const owner = await ownerSession();
    respond(({ url }) =>
      url.host === "upload.example"
        ? new Response(null, { status: 403 })
        : Response.json({
            id: "f1",
            uploadUrl: "https://upload.example/signed",
            headers: {},
          }),
    );
    await assert.rejects(
      owner.media.upload(new Blob(["x"], { type: "text/plain" })),
      { status: 403 },
    );
    assert.equal(calls.length, 2);
  });
});
