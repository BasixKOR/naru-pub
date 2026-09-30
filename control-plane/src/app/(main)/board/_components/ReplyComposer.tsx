"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MAX_REPLY_BODY_LENGTH } from "@/lib/board/constants";
import { boardRequest } from "./api";

export function ReplyComposer({
  postId,
  parentId,
  label,
  autoFocus = false,
  onDone,
}: {
  postId: string;
  parentId: string | null;
  label: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const { replyId } = await boardRequest<{ replyId: string }>(
        `/api/board/posts/${postId}/replies`,
        "POST",
        { parentId, body },
      );
      setBody("");
      onDone?.();
      router.refresh();
      // Let the refreshed tree render before jumping to the new reply.
      setTimeout(() => {
        document
          .getElementById(`reply-${replyId}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 400);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={`flex flex-col border ${parentId ? "border-primary" : "border-border"}`}
    >
      <label
        htmlFor={id}
        className={`border-b border-border px-3 py-2 text-xs ${parentId ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </label>
      <textarea
        id={id}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={MAX_REPLY_BODY_LENGTH}
        autoFocus={autoFocus}
        rows={3}
        placeholder="답글을 남겨 주세요."
        className="resize-y bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
      />
      <div className="flex justify-end gap-2 border-t border-border p-2">
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="h-10 border border-border px-3 text-sm text-muted-foreground hover:bg-accent"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="h-10 bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          답글 달기
        </button>
      </div>
    </form>
  );
}
