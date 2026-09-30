import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/board/access";
import { boardErrorResponse, parseId, readJson } from "@/lib/board/errors";
import { publishTemplateVersion } from "@/lib/board/templates";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const templateId = parseId((await params).id);
    const body = await readJson(request);
    const user = await requireVerifiedUser();
    const version = await publishTemplateVersion(user, templateId, {
      files: body.files,
      changelog: body.changelog,
      collections: body.collections,
    });
    return NextResponse.json({ success: true, version });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
