import { POST_KIND_LABELS, type PostKind } from "@/lib/board/constants";

const KIND_CLASSES: Record<PostKind, string> = {
  template: "border-primary text-primary",
  site: "border-teal-600 text-teal-700 dark:border-teal-300 dark:text-teal-300",
  question:
    "border-blue-600 text-blue-700 dark:border-blue-300 dark:text-blue-300",
  chat: "border-border text-muted-foreground",
};

export function KindBadge({ kind }: { kind: PostKind }) {
  return (
    <span
      className={`inline-block shrink-0 border px-2 py-0.5 text-xs ${KIND_CLASSES[kind]}`}
    >
      {POST_KIND_LABELS[kind]}
    </span>
  );
}
