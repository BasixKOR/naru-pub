import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { assertJsonContentType } from "@/lib/utils";
import type { NextRequest } from "next/server";

// A failure the person can act on. Its message is shown as is.
export class BoardError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function boardErrorResponse(error: unknown) {
  if (error instanceof BoardError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }
  console.error("[board]", error);
  Sentry.captureException(error);
  return NextResponse.json(
    { success: false, message: "요청을 처리하지 못했습니다." },
    { status: 500 },
  );
}

// Parses a mutating request's JSON body, refusing form posts and other
// origins the way the file routes do.
export async function readJson(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  try {
    assertJsonContentType(request);
  } catch {
    throw new BoardError(400, "잘못된 요청입니다.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BoardError(400, "잘못된 요청입니다.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BoardError(400, "잘못된 요청입니다.");
  }
  return body as Record<string, unknown>;
}

// Route params and body fields that name a row. Ids are bigserial, so they are
// kept as strings of digits rather than numbers.
export function parseId(value: unknown): string {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^[1-9][0-9]{0,17}$/.test(text)) {
    throw new BoardError(404, "찾을 수 없습니다.");
  }
  return text;
}

// A board post's id: a UUID, unlike the sequence numbers other board rows use.
export function parsePostId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BoardError(404, "찾을 수 없습니다.");
  }
  return value.toLowerCase();
}
