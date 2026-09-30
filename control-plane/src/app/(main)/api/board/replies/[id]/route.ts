import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireVerifiedUser } from "@/lib/board/access";
import { boardErrorResponse, parseId, readJson } from "@/lib/board/errors";
import { deleteReply, editReply } from "@/lib/board/replies";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = parseId((await params).id);
    const body = await readJson(request);
    const user = await requireVerifiedUser();
    await editReply(user, id, body.body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = parseId((await params).id);
    await readJson(request);
    const user = await requireUser();
    await deleteReply(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
