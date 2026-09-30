import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/board/access";
import { boardErrorResponse, parseId, readJson } from "@/lib/board/errors";
import { setPostLike } from "@/lib/board/posts";

async function handle(
  request: NextRequest,
  params: Promise<{ id: string }>,
  liked: boolean,
) {
  try {
    const id = parseId((await params).id);
    await readJson(request);
    const user = await requireUser();
    const likeCount = await setPostLike(user, id, liked);
    return NextResponse.json({ success: true, likeCount });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(request, params, true);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(request, params, false);
}
