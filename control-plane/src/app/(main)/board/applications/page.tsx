import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth";
import { listApplications } from "@/lib/board/templates";
import { formatRelative } from "../_components/format";
import { UndoButton } from "./UndoButton";

export const metadata: Metadata = { title: "적용한 템플릿 · 나루 게시판" };

export default async function ApplicationsPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  const applications = await listApplications(user.id);

  return (
    <div className="bg-background min-h-screen p-4 sm:p-6">
      <main className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-1">
          <Link href="/board" className="text-xs text-primary hover:underline">
            ← 게시판
          </Link>
          <h1 className="text-2xl font-bold">내가 적용한 템플릿</h1>
          <p className="text-sm text-muted-foreground">
            되돌리면 템플릿이 새로 만든 파일은 지우고, 덮어쓴 파일은 보관해 둔
            원래 파일로 돌려놓아요.
          </p>
        </div>
        {applications.length === 0 ? (
          <p className="border-2 border-border p-8 text-center text-sm text-muted-foreground">
            아직 적용한 템플릿이 없어요.{" "}
            <Link
              href="/board?kind=template"
              className="text-primary hover:underline"
            >
              템플릿 둘러보기 →
            </Link>
          </p>
        ) : (
          <ul className="border-2 border-border bg-card">
            {applications.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 last:border-b-0"
              >
                <div className="min-w-0 space-y-1 text-sm">
                  <div className="font-bold">
                    {a.postId && a.title ? (
                      <Link
                        href={`/board/${a.postId}`}
                        className="hover:text-primary"
                      >
                        {a.title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        지워진 템플릿
                      </span>
                    )}
                    {a.version !== null && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        v{a.version}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    /{a.targetPath} · 파일 {a.fileCount}개 ·{" "}
                    {formatRelative(a.createdAt)}
                    {a.backupPath && <> · 보관: /{a.backupPath}</>}
                  </div>
                </div>
                {a.undoneAt ? (
                  <span className="text-xs text-muted-foreground">되돌림</span>
                ) : (
                  <UndoButton applicationId={a.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
