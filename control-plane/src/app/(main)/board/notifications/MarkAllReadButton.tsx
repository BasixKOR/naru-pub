"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { boardRequest } from "../_components/api";

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await boardRequest("/api/board/notifications/read", "POST");
          router.refresh();
        } catch (error: any) {
          toast.error(error.message);
        } finally {
          setBusy(false);
        }
      }}
      className="h-11 border border-border px-4 text-sm hover:bg-accent"
    >
      모두 읽음으로 표시
    </button>
  );
}
