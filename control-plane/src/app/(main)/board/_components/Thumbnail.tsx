import Image from "next/image";
import { getRenderedSiteUrl } from "@/lib/site-urls";
import { getTemplatePreviewUrl } from "@/lib/board/preview";
import type { PostSummary } from "@/lib/board/posts";

// The picture beside a post: a template's preview, or the current screenshot
// of the author's site for a 사이트 자랑 post. Other kinds have none.
export function postThumbnailUrl(post: PostSummary): string | null {
  if (post.template) {
    return post.template.version
      ? getTemplatePreviewUrl(
          post.template.id,
          post.template.version,
          post.template.previewRenderedAt,
        )
      : null;
  }
  if (post.kind === "site" && post.authorSiteRenderedAt) {
    return getRenderedSiteUrl(post.authorLoginName, post.authorSiteRenderedAt);
  }
  return null;
}

export function Thumbnail({
  url,
  alt,
  className,
}: {
  url: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[4/3] overflow-hidden border border-border bg-muted ${className ?? ""}`}
    >
      {url ? (
        <Image
          src={url}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, 320px"
          className="object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          미리보기 준비 중
        </div>
      )}
    </div>
  );
}
