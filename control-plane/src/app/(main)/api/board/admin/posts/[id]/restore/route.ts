import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/board/access";
import { boardErrorResponse, parsePostId, readJson } from "@/lib/board/errors";
import { restorePost } from "@/lib/board/moderation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = parsePostId((await params).id);
    await readJson(request);
    const user = await requireUser();
    await restorePost(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
