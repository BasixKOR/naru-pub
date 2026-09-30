import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/board/access";
import {
  boardErrorResponse,
  parseId,
  parsePostId,
  readJson,
} from "@/lib/board/errors";
import { createReply } from "@/lib/board/replies";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const postId = parsePostId((await params).id);
    const body = await readJson(request);
    const user = await requireVerifiedUser();
    const replyId = await createReply(user, postId, {
      parentId: body.parentId == null ? null : parseId(body.parentId),
      body: body.body,
    });
    return NextResponse.json({ success: true, replyId });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
