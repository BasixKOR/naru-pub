"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MAX_POST_BODY_LENGTH, MAX_TITLE_LENGTH } from "@/lib/board/constants";
import { boardRequest } from "../../_components/api";

export function EditPostForm({
  postId,
  title: initialTitle,
  body: initialBody,
}: {
  postId: string;
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await boardRequest(`/api/board/posts/${postId}`, "PATCH", {
        title,
        body,
      });
      toast.success("고쳤어요.");
      router.push(`/board/${postId}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="edit-title" className="text-sm font-bold">
          제목
        </label>
        <input
          id="edit-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          required
          className="h-12 w-full border border-border bg-background px-3 text-base"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="edit-body" className="text-sm font-bold">
          본문
        </label>
        <textarea
          id="edit-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_POST_BODY_LENGTH}
          rows={10}
          className="w-full resize-y border border-border bg-background px-3 py-2 text-sm leading-relaxed"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="h-12 bg-primary px-6 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          저장
        </button>
      </div>
    </form>
  );
}
