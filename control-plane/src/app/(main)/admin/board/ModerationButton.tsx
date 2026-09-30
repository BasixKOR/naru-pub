"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { boardRequest } from "../../board/_components/api";

// Deleting uses the same routes an author does; admins may delete anyone's.
// Restoring has its own admin-only routes.
export function ModerationButton({
  target,
  id,
  action,
}: {
  target: "post" | "reply";
  id: string;
  action: "delete" | "restore";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const noun = target === "post" ? "글" : "답글";

  async function run() {
    if (action === "delete" && !window.confirm(`이 ${noun}을 지울까요?`)) {
      return;
    }
    setBusy(true);
    try {
      const base = target === "post" ? "posts" : "replies";
      if (action === "delete") {
        await boardRequest(`/api/board/${base}/${id}`, "DELETE");
      } else {
        await boardRequest(`/api/board/admin/${base}/${id}/restore`, "POST");
      }
      toast.success(action === "delete" ? "지웠어요." : "되살렸어요.");
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={
        action === "delete"
          ? "h-9 border border-destructive px-3 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          : "h-9 border border-border px-3 text-xs hover:bg-accent disabled:opacity-50"
      }
    >
      {action === "delete" ? "지우기" : "되살리기"}
    </button>
  );
}
