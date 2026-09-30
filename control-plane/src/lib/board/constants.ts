// Shared by the board's server code and its client components, so nothing
// here may import server-only modules.

export const POST_KINDS = ["site", "template", "question", "chat"] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const POST_KIND_LABELS: Record<PostKind, string> = {
  site: "사이트 자랑",
  template: "템플릿",
  question: "질문",
  chat: "잡담",
};

export function isPostKind(value: unknown): value is PostKind {
  return (
    typeof value === "string" &&
    (POST_KINDS as readonly string[]).includes(value)
  );
}

export const POST_SORTS = ["activity", "new", "applied"] as const;
export type PostSort = (typeof POST_SORTS)[number];

export const MAX_TITLE_LENGTH = 200;
export const MAX_POST_BODY_LENGTH = 20000;
export const MAX_REPLY_BODY_LENGTH = 5000;
export const MAX_CHANGELOG_LENGTH = 2000;
// Depth 0 is a top-level reply, so replies nest five levels deep. A reply to
// one at the last level becomes its sibling instead.
export const MAX_REPLY_DEPTH = 4;
// A thread page loads at most this many replies; the rest are reached through
// a reply's own page.
export const MAX_THREAD_REPLIES = 500;
export const POSTS_PER_PAGE = 20;

export const LICENSES = {
  "cc-by-4.0": "CC BY 4.0",
  "cc-by-sa-4.0": "CC BY-SA 4.0",
  "cc0-1.0": "CC0 1.0",
} as const;
export type License = keyof typeof LICENSES;

export function isLicense(value: unknown): value is License {
  return typeof value === "string" && Object.hasOwn(LICENSES, value);
}

export const TEMPLATE_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_TEMPLATE_SLUG_LENGTH = 64;
// Small enough that publishing and applying stay one request of R2 copies.
export const TEMPLATE_MAX_FILES = 200;
export const TEMPLATE_MAX_BYTES = 20 * 1024 * 1024;

// Per user, per rolling hour.
export const POSTS_PER_HOUR = 10;
export const REPLIES_PER_HOUR = 60;
export const APPLICATIONS_PER_HOUR = 20;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
