import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/board/access";
import { boardErrorResponse, parseId, readJson } from "@/lib/board/errors";
import { planApplication } from "@/lib/board/templates";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const versionId = parseId((await params).id);
    const body = await readJson(request);
    const user = await requireUser();
    const plan = await planApplication(user, versionId, body.targetPath);
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
