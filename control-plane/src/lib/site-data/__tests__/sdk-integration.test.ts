/** @jest-environment node */
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { sql } from "kysely";
import { db } from "@/lib/database";
import { GET as dataRoute } from "@/app/(main)/api/data/[site]/[[...path]]/route";
import { POST as authRoute } from "@/app/(main)/api/data-auth/[action]/route";
import { executeData } from "../service";
import {
  approveAuthorization,
  authorizationInput,
  digest,
  exchangeCode,
  registerClient,
  siteClientId,
} from "../owner-auth";
import { setupTestDatabase, teardownTestDatabase } from "./test-database";
import {
  createDatabase,
  type OwnerDatabase,
} from "../../../../public/sdk/1.0.0/naru-data.js";

const integration =
  process.env.NARU_DATA_TEST === "1" ? describe : describe.skip;

// Real SDK -> native fetch -> HTTP -> actual route -> service -> PostgreSQL.
// The adapter replaces Next's HTTP listener, not the route or its responses.
integration("SDK and data API contract", () => {
  let ready = false;
  let server: Server | undefined;
  let origin: string;
  let accessToken: string;
  let owner: OwnerDatabase;
  let publicDb: ReturnType<typeof createDatabase>;
  const nativeFetch = globalThis.fetch;
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldFeatureMode = process.env.FEATURE_ACCESS_MODE;

  beforeAll(async () => {
    await setupTestDatabase();
    ready = true;
    server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers))
          if (value !== undefined)
            headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        const request = new Request(`${origin}${incoming.url}`, {
          method: incoming.method,
          headers,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        });
        const parts = new URL(request.url).pathname.split("/");
        const response =
          parts[2] === "data-auth"
            ? await authRoute(request, {
                params: Promise.resolve({ action: parts[3] }),
              })
            : await dataRoute(request, {
                params: Promise.resolve({
                  site: parts[3],
                  path: parts.slice(4),
                }),
              });
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers),
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        outgoing.destroy(error as Error);
      }
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Node fetch does not add a browser Origin header. Everything else, including
    // HTTP errors, JSON serialization and response bodies, crosses the socket.
    globalThis.fetch = (input, init) => {
      if (new URL(String(input)).origin !== origin)
        throw new Error("SDK test attempted nonlocal HTTP");
      const headers = new Headers(init?.headers);
      headers.set("Origin", origin);
      return nativeFetch(input, { ...init, headers });
    };
    const userId = (
      await sql<{
        id: number;
      }>`insert into users(login_name) values ('alice') returning id`.execute(
        db,
      )
    ).rows[0].id;
    await sql`insert into sessions values ('sdk-session', ${userId}, now() + interval '1 hour')`.execute(
      db,
    );
    const collections = ["crud", "feed", "atomic", "private", "raw"];
    for (const name of collections)
      await executeData({
        site: "alice",
        adminUserId: userId,
        method: "POST",
        path: [],
        body: {
          name,
          read: name === "private" ? "admin" : "world",
          write: name === "private" ? "admin" : "world",
        },
      });
    const redirectUri = `${origin}/admin`;
    await registerClient(userId, { redirectUri, collections });
    const clientId = await siteClientId(userId),
      verifier = "v".repeat(43);
    const approval = await approveAuthorization(
      userId,
      "sdk-session",
      authorizationInput({
        site: "alice",
        clientId,
        redirectUri,
        collections,
        state: "s".repeat(43),
        challenge: digest(verifier),
      }),
    );
    const token = await exchangeCode(
      {
        code: new URL(approval.redirect).searchParams.get("code"),
        verifier,
        clientId,
        redirectUri,
      },
      origin,
    );
    accessToken = token.accessToken;
    const storage = new Map<string, string>([
      [
        `naru:owner:${origin}:alice:session:${redirectUri}`,
        JSON.stringify({
          accessToken: token.accessToken,
          expiresAt: token.expiresAt,
          redirectUri,
        }),
      ],
    ]);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: new URL(redirectUri),
        sessionStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          removeItem: (key: string) => storage.delete(key),
        },
      },
    });
    publicDb = createDatabase({ site: "alice", controlPlaneOrigin: origin });
    owner = (await publicDb.completeOwnerSignIn())!;
  }, 30000);

  afterAll(async () => {
    globalThis.fetch = nativeFetch;
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
    try {
      if (server?.listening) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => (error ? reject(error) : resolve())),
        );
      }
      if (ready) await teardownTestDatabase();
    } finally {
      await db.destroy();
      if (oldFeatureMode === undefined) delete process.env.FEATURE_ACCESS_MODE;
      else process.env.FEATURE_ACCESS_MODE = oldFeatureMode;
    }
  });

  test("CRUD preserves JSON, metadata, versions, and HTTP failures", async () => {
    const posts = publicDb.collection("crud");
    const added = await posts.add({
      title: "한글",
      nested: { value: null },
      tags: [1, true],
    });
    expect(added).toEqual({ id: expect.any(String), version: 1 });
    const first = await posts.get(added.id);
    expect(first).toEqual({
      ...added,
      data: { title: "한글", nested: { value: null }, tags: [1, true] },
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(
      await posts.set(
        added.id,
        { replaced: true },
        { ifVersion: first.version },
      ),
    ).toEqual({ id: added.id, version: 2 });
    const replaced = await posts.get(added.id);
    expect(replaced.created_at).toBe(first.created_at);
    expect(replaced.data).toEqual({ replaced: true });
    await expect(
      posts.set(added.id, null, { ifVersion: 1 }),
    ).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    await posts.update(
      added.id,
      { count: 2 },
      { ifVersion: 2, unset: ["replaced"] },
    );
    expect((await posts.get(added.id)).data).toEqual({ count: 2 });
    await expect(
      posts.delete(added.id, { ifVersion: 2 }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await posts.delete(added.id, { ifVersion: 3 })).toEqual({
      success: true,
    });
    await expect(posts.get(added.id)).rejects.toMatchObject({ status: 404 });
    expect(await posts.delete(added.id)).toEqual({ success: true });
    await posts.set("new", null, { ifVersion: 0 });
    await expect(
      posts.set("new", false, { ifVersion: 0 }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  test("filtered pages, count, and all use the same real query contract", async () => {
    const feed = publicDb.collection<{ rank: number; visible: boolean }>(
      "feed",
    );
    for (let rank = 1; rank <= 5; rank++)
      await feed.set(`post_${rank}`, { rank, visible: rank !== 3 });
    const query = {
      where: { rank: { gte: 2 }, visible: true },
      orderBy: "data.rank" as const,
      direction: "desc" as const,
    };
    expect(await feed.count({ where: query.where })).toBe(3);
    const first = await feed.list({ ...query, limit: 2 });
    expect(first.documents.map((d) => d.id)).toEqual(["post_5", "post_4"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await feed.list({
      ...query,
      limit: 2,
      after: first.nextCursor!,
    });
    expect(second.documents.map((d) => d.id)).toEqual(["post_2"]);
    expect(second.nextCursor).toBeNull();
    const ids: string[] = [];
    for await (const document of feed.all({ ...query, limit: 1 }))
      ids.push(document.id);
    expect(ids).toEqual(["post_5", "post_4", "post_2"]);
    await expect(
      feed.list({
        ...query,
        where: { visible: false },
        after: first.nextCursor!,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("owner batches return operation results and roll back conflicts across collections", async () => {
    await expect(publicDb.collection("private").list()).rejects.toMatchObject({
      status: 403,
    });
    const result = await owner.batch([
      {
        type: "set",
        collection: "atomic",
        id: "one",
        data: { original: true },
      },
      { type: "add", collection: "private", data: { secret: true } },
      { type: "delete", collection: "atomic", id: "missing" },
    ]);
    expect(result.results).toEqual([
      { id: "one", version: 1 },
      { id: expect.any(String), version: 1 },
      { success: true },
    ]);
    const privateId = result.results[1].id;
    await expect(
      owner.batch([
        {
          type: "update",
          collection: "atomic",
          id: "one",
          data: { changed: true },
          ifVersion: 1,
        },
        { type: "delete", collection: "private", id: privateId, ifVersion: 9 },
      ]),
    ).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    expect(await owner.collection("atomic").get("one")).toMatchObject({
      version: 1,
      data: { original: true },
    });
    expect((await owner.collection("private").get(privateId)).data).toEqual({
      secret: true,
    });
  });

  test("read parsers validate stored schemaless data and identify failures", async () => {
    const raw = publicDb.collection("raw");
    await raw.set("a", { title: "valid" });
    await raw.set("b", { title: 42 });
    const parsed = publicDb.collection("raw", {
      parse(data) {
        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data) ||
          typeof data.title !== "string"
        )
          throw new Error("title must be a string");
        return { title: data.title.toUpperCase() };
      },
    });
    expect((await parsed.get("a")).data).toEqual({ title: "VALID" });
    const failure = {
      code: "DOCUMENT_VALIDATION_FAILED",
      collection: "raw",
      documentId: "b",
    };
    await expect(parsed.get("b")).rejects.toMatchObject(failure);
    await expect(parsed.list()).rejects.toMatchObject(failure);
    const iterator = parsed.all({ limit: 1 });
    expect((await iterator.next()).value?.data).toEqual({ title: "VALID" });
    await expect(iterator.next()).rejects.toMatchObject(failure);
    expect((await raw.get("b")).data).toEqual({ title: 42 });
    expect(await parsed.count()).toBe(2);
  });

  test("SDK signout revokes the real owner token", async () => {
    await owner.signOut();
    expect(await publicDb.completeOwnerSignIn()).toBeNull();
    await expect(owner.collection("private").list()).rejects.toMatchObject({
      status: 401,
    });
    const copiedTokenResponse = await nativeFetch(
      `${origin}/api/data/alice/private`,
      {
        headers: { Origin: origin, Authorization: `Bearer ${accessToken}` },
      },
    );
    expect(copiedTokenResponse.status).toBe(401);
    await copiedTokenResponse.arrayBuffer();
    expect(
      (await db.selectFrom("site_data_access_tokens").selectAll().execute())
        .length,
    ).toBe(0);
  });
});
