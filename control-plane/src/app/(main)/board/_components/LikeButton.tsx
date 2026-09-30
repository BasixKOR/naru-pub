"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { boardRequest } from "./api";

export function LikeButton({
  url,
  initialLiked,
  initialCount,
  signedIn,
  compact = false,
}: {
  url: string;
  initialLiked: boolean;
  initialCount: number;
  signedIn: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    setBusy(true);
    try {
      const result = await boardRequest<{ likeCount: number }>(
        url,
        liked ? "DELETE" : "PUT",
      );
      setLiked(!liked);
      setCount(result.likeCount);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
      className={
        compact
          ? `text-xs hover:text-foreground ${liked ? "font-bold text-primary" : "text-muted-foreground"}`
          : `h-11 border px-4 text-sm ${liked ? "border-primary text-primary" : "border-border text-foreground hover:bg-accent"}`
      }
    >
      반가워요 {count}
    </button>
  );
}
