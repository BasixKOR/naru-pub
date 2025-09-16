import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { db } from "@/lib/database";
import { sendVerificationEmail, generateVerificationToken } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { user } = await validateRequest();
    if (!user) {
      return NextResponse.json(
        { success: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    if (user.email && user.emailVerifiedAt) {
      return NextResponse.json(
        { success: false, message: "이미 인증된 이메일입니다." },
        { status: 400 }
      );
    }

    // Check for pending verification token since email might not be set yet
    const existingToken = await db
      .selectFrom("email_verification_tokens")
      .selectAll()
      .where("user_id", "=", user.id)
      .executeTakeFirst();

    if (!existingToken) {
      return NextResponse.json(
        { success: false, message: "연결된 이메일이 없습니다." },
        { status: 400 }
      );
    }

    // Generate new verification token
    const token = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.transaction().execute(async (trx) => {
      // Delete any existing verification tokens for this user
      await trx
        .deleteFrom("email_verification_tokens")
        .where("user_id", "=", user.id)
        .execute();

      // Insert new verification token
      await trx
        .insertInto("email_verification_tokens")
        .values({
          id: token,
          user_id: user.id,
          email: existingToken.email,
          expires_at: expiresAt,
        })
        .execute();
    });

    // Send verification email
    await sendVerificationEmail(existingToken.email, token);

    return NextResponse.json({
      success: true,
      message: "인증 이메일이 다시 발송되었습니다.",
    });
  } catch (error) {
    console.error("Resend verification email error:", error);
    return NextResponse.json(
      { success: false, message: "이메일 발송 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}