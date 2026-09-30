import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/board/access";
import { boardErrorResponse, parseId, readJson } from "@/lib/board/errors";
import { undoApplication } from "@/lib/board/templates";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = parseId((await params).id);
    await readJson(request);
    const user = await requireUser();
    await undoApplication(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
