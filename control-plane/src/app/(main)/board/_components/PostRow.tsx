import Link from "next/link";
import { Download, MessageSquare } from "lucide-react";
import type { PostSummary } from "@/lib/board/posts";
import { KindBadge } from "./KindBadge";
import { Thumbnail, postThumbnailUrl } from "./Thumbnail";
import { formatRelative } from "./format";

export function PostRow({ post }: { post: PostSummary }) {
  const hasThumbnail = post.kind === "template" || post.kind === "site";
  return (
    <article className="flex gap-4 border-b border-border p-4 last:border-b-0 sm:gap-5 sm:p-5">
      {hasThumbnail && (
        <Link
          href={`/board/${post.id}`}
          className="hidden w-36 shrink-0 sm:block"
          tabIndex={-1}
          aria-hidden="true"
        >
          <Thumbnail url={postThumbnailUrl(post)} alt="" />
        </Link>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={post.kind} />
          {post.solved && (
            <span className="bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-300">
              해결됨
            </span>
          )}
          <Link
            href={`/board/${post.id}`}
            className="min-w-0 break-words font-bold text-foreground hover:text-primary"
          >
            {post.title}
          </Link>
        </div>
        {post.excerpt && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="text-foreground">{post.authorLoginName}</span>
          <span>{formatRelative(post.createdAt)}</span>
          <span className="flex items-center gap-1">
            <MessageSquare size={13} aria-hidden="true" />
            <span className="sr-only">답글</span>
            {post.replyCount}
          </span>
          {post.template && (
            <span className="flex items-center gap-1 text-primary">
              <Download size={13} aria-hidden="true" />
              {post.template.applyCount}회 적용
            </span>
          )}
        </div>
      </div>
      {post.lastReplyAt && post.lastReplyLoginName && (
        <div className="hidden w-32 shrink-0 flex-col items-end gap-1 text-right text-xs text-muted-foreground md:flex">
          <span>최근 답글</span>
          <span className="text-foreground">{post.lastReplyLoginName}</span>
          <span>{formatRelative(post.lastReplyAt)}</span>
        </div>
      )}
    </article>
  );
}
