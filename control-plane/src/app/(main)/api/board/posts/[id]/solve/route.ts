import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/board/access";
import {
  boardErrorResponse,
  parseId,
  parsePostId,
  readJson,
} from "@/lib/board/errors";
import { setSolvedReply } from "@/lib/board/posts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const postId = parsePostId((await params).id);
    const body = await readJson(request);
    const user = await requireUser();
    await setSolvedReply(
      user,
      postId,
      body.replyId == null ? null : parseId(body.replyId),
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
