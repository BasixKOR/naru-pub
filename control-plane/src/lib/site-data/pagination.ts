import { DataError, name, NAME } from "./validation";

export type Column = "id" | "createdAt" | "updatedAt";
export type Direction = "asc" | "desc";
export type Sort = {
  /** Cursor identity: the caller's orderBy verbatim. */
  orderBy: string;
  direction: Direction;
  /** The physical column an `orderBy` of `id`/`createdAt`/`updatedAt` reads. */
  column: string;
  /** Set when ordering by a document field rather than a column. */
  field?: string;
};
/** Server metadata is camelCase on the wire and snake_case in PostgreSQL. */
const COLUMNS: Record<Column, string> = {
  id: "id",
  createdAt: "created_at",
  updatedAt: "updated_at",
};
const DATA_ORDER = /^data\.([a-zA-Z0-9_-]{1,64})$/;
/** Distinguishes document cursors from media cursors so neither decodes the
 * other, even when a collection id and a user id happen to be the same number. */
export type CursorKind = "d" | "f";

export function sorting(orderBy = "id", direction = "asc"): Sort {
  if (!["asc", "desc"].includes(direction))
    throw new DataError(400, "Use direction=asc or desc.");
  const field = DATA_ORDER.exec(orderBy)?.[1];
  if (!field && !Object.hasOwn(COLUMNS, orderBy))
    throw new DataError(
      400,
      "Use orderBy=id, createdAt, updatedAt or data.<field>.",
    );
  return {
    orderBy,
    direction: direction as Direction,
    column: field ? "" : COLUMNS[orderBy as Column],
    field,
  };
}

export function encodeCursor(
  scope: number,
  sort: Sort,
  id: string,
  value: string | null,
  fingerprint?: string,
  kind: CursorKind = "d",
) {
  return (
    "v1." +
    Buffer.from(
      JSON.stringify({
        c: scope,
        s: sort.orderBy,
        d: sort.direction,
        i: id,
        t: value,
        f: fingerprint,
        ...(kind === "d" ? {} : { k: kind }),
      }),
    ).toString("base64url")
  );
}
export function decodeCursor(
  after: string | undefined,
  scope: number,
  sort: Sort,
  fingerprint?: string,
  kind: CursorKind = "d",
) {
  if (after === undefined) return null;
  // Retain compatibility with the original ID-ascending pagination API.
  if (
    kind === "d" &&
    !fingerprint &&
    NAME.test(after) &&
    sort.orderBy === "id" &&
    sort.direction === "asc"
  )
    return { id: after, value: null };
  try {
    if (after.length > 1024 || !/^v1\.[A-Za-z0-9_-]+$/.test(after))
      throw new Error();
    const cursor = JSON.parse(
      Buffer.from(after.slice(3), "base64url").toString("utf8"),
    );
    if (
      cursor.c !== scope ||
      cursor.s !== sort.orderBy ||
      cursor.d !== sort.direction ||
      cursor.f !== fingerprint ||
      (cursor.k ?? "d") !== kind
    )
      throw new Error();
    name(cursor.i);
    if (sort.field) {
      // The anchor is the field's JSONB text, compared as JSONB again on the
      // way in, so PostgreSQL's own rendering round-trips exactly.
      if (typeof cursor.t !== "string") throw new Error();
      JSON.parse(cursor.t);
    } else if (sort.orderBy === "id") {
      if (cursor.t !== null) throw new Error();
    } else {
      // Preserve PostgreSQL microseconds; Date alone would lose cursor precision.
      if (
        typeof cursor.t !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.t) ||
        new Date(cursor.t).toISOString() !== cursor.t.slice(0, 23) + "Z"
      )
        throw new Error();
    }
    return { id: cursor.i as string, value: cursor.t as string | null };
  } catch {
    throw new DataError(
      400,
      "Invalid cursor or cursor does not match this collection, sort order and filters.",
    );
  }
}
