"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { boardRequest } from "./api";

export function PostActions({
  postId,
  canEdit,
  canDelete,
  isTemplate,
}: {
  postId: string;
  canEdit: boolean;
  canDelete: boolean;
  isTemplate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const warning = isTemplate
      ? "이 글과 템플릿 파일을 지울까요? 이미 적용한 사이트의 파일은 그대로 남아요."
      : "이 글을 지울까요?";
    if (!window.confirm(warning)) return;
    setBusy(true);
    try {
      await boardRequest(`/api/board/posts/${postId}`, "DELETE");
      toast.success("글을 지웠어요.");
      router.push("/board");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("링크를 복사했어요.");
    } catch {
      toast.error("링크를 복사하지 못했어요.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copyLink}
        className="h-11 border border-border px-4 text-sm hover:bg-accent"
      >
        링크 복사
      </button>
      {canEdit && (
        <Link
          href={`/board/${postId}/edit`}
          className="flex h-11 items-center border border-border px-4 text-sm hover:bg-accent"
        >
          고치기
        </Link>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="h-11 border border-destructive px-4 text-sm text-destructive hover:bg-destructive/10"
        >
          지우기
        </button>
      )}
    </div>
  );
}
