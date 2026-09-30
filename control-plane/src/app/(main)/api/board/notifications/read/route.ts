import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/board/access";
import {
  BoardError,
  boardErrorResponse,
  parseId,
  readJson,
} from "@/lib/board/errors";
import { markNotificationsRead } from "@/lib/board/replies";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const user = await requireUser();
    let ids: string[] | null = null;
    if (body.ids != null) {
      if (!Array.isArray(body.ids) || body.ids.length > 200) {
        throw new BoardError(400, "잘못된 요청입니다.");
      }
      ids = body.ids.map(parseId);
    }
    await markNotificationsRead(user.id, ids);
    return NextResponse.json({ success: true });
  } catch (error) {
    return boardErrorResponse(error);
  }
}
