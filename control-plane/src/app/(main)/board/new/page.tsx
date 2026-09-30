import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth";
import { isPostKind } from "@/lib/board/constants";
import { db } from "@/lib/database";
import { NewPostForm } from "./NewPostForm";

export const metadata: Metadata = { title: "새 글 쓰기 · 나루 게시판" };

async function findRemixSource(versionId: string | undefined) {
  if (!versionId || !/^[1-9][0-9]{0,17}$/.test(versionId)) return null;
  const row = await db
    .selectFrom("board_template_versions as v")
    .innerJoin("board_templates as t", "t.id", "v.template_id")
    .innerJoin("board_posts as p", "p.id", "t.post_id")
    .innerJoin("users as u", "u.id", "p.user_id")
    .select(["v.id", "p.title", "u.login_name"])
    .where("v.id", "=", versionId)
    .where("t.remix_allowed", "=", true)
    .where("p.deleted_at", "is", null)
    .executeTakeFirst();
  return row
    ? { versionId: row.id, title: row.title, authorLoginName: row.login_name }
    : null;
}

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; remix?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  const params = await searchParams;

  if (!user.emailVerifiedAt) {
    return (
      <div className="bg-background min-h-screen p-4 sm:p-6">
        <main className="mx-auto max-w-3xl space-y-4 border-2 border-border p-6">
          <h1 className="text-2xl font-bold">새 글 쓰기</h1>
          <p className="text-sm text-muted-foreground">
            게시판에 글을 쓰려면{" "}
            <Link href="/account" className="text-primary hover:underline">
              계정 설정
            </Link>
            에서 이메일을 인증해 주세요.
          </p>
        </main>
      </div>
    );
  }

  const [collections, remix] = await Promise.all([
    db
      .selectFrom("site_data_collections")
      .select("name")
      .where("user_id", "=", user.id)
      .orderBy("name")
      .execute(),
    findRemixSource(params.remix),
  ]);

  return (
    <div className="bg-background min-h-screen p-4 sm:p-6">
      <main className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-1">
          <Link href="/board" className="text-xs text-primary hover:underline">
            ← 게시판
          </Link>
          <h1 className="text-2xl font-bold">새 글 쓰기</h1>
        </div>
        <NewPostForm
          initialKind={
            remix ? "template" : isPostKind(params.kind) ? params.kind : "site"
          }
          collections={collections.map((c) => c.name)}
          remix={remix}
        />
      </main>
    </div>
  );
}
