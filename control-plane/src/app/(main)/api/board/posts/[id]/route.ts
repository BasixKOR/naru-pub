import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireVerifiedUser } from "@/lib/board/access";
import { boardErrorResponse, parseId, readJson } from "@/lib/board/errors";
import { deletePost, editPost } from "@/lib/board/posts";
import { deleteTemplateObjects } from "@/lib/board/templates";
import { dispatchNoteDelete } from "@/lib/federation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = parseId((await params).id);
    const body = await readJson(request);
    const user = await requireVerifiedUser();
    await editPost(user, id, { title: body.title, body: body.body });
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
    const deleted = await deletePost(user, id);
    if (deleted.templateId) {
      try {
        await deleteTemplateObjects(deleted.templateId);
      } catch (error) {
        console.error("[board] deleting template files failed", error);
      }
    }
    if (deleted.federatedNoteIri) {
      try {
        await dispatchNoteDelete(deleted.authorId, deleted.federatedNoteIri);
      } catch (error) {
        console.error("[board] retracting template note failed", error);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
