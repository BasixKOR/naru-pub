"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { boardRequest } from "../_components/api";

export function UndoButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("적용하기 전으로 되돌릴까요?")) return;
        setBusy(true);
        try {
          await boardRequest(
            `/api/board/template-applications/${applicationId}/undo`,
            "POST",
          );
          toast.success("되돌렸어요.");
          router.refresh();
        } catch (error: any) {
          toast.error(error.message);
        } finally {
          setBusy(false);
        }
      }}
      className="h-11 border border-border px-4 text-sm hover:bg-accent"
    >
      되돌리기
    </button>
  );
}
