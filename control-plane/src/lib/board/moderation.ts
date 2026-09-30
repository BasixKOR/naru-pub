import { sql } from "kysely";
import { db } from "@/lib/database";
import type { User } from "@/lib/auth";
import { isBoardAdmin } from "./access";
import type { PostKind } from "./constants";
import { BoardError } from "./errors";

// The board's moderation view: every post and reply, deleted ones included,
// newest first. Only board admins (isBoardAdmin) reach it.

export type ModerationStatus = "live" | "deleted" | "all";

export const MODERATION_PAGE_SIZE = 50;

export function assertBoardAdmin(user: User | null): asserts user is User {
  if (!user || !isBoardAdmin(user)) {
    throw new BoardError(403, "게시판 관리자만 할 수 있어요.");
  }
}

export interface ModerationPost {
  id: string;
  kind: PostKind;
  title: string;
  excerpt: string;
  authorLoginName: string;
  replyCount: number;
  createdAt: Date;
  deletedAt: Date | null;
  // A deleted template's files are gone, so it can't come back.
  restorable: boolean;
}

export interface ModerationReply {
  id: string;
  postId: string;
  postTitle: string;
  postDeleted: boolean;
  excerpt: string;
  authorLoginName: string;
  createdAt: Date;
  deletedAt: Date | null;
}

function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export async function listPostsForModeration(options: {
  status: ModerationStatus;
  author: string | null;
  page: number;
}): Promise<{ posts: ModerationPost[]; hasMore: boolean }> {
  let query = db
    .selectFrom("board_posts as p")
    .innerJoin("users as u", "u.id", "p.user_id")
    .select([
      "p.id",
      "p.kind",
      "p.title",
      sql<string>`left(p.body, 160)`.as("body"),
      "u.login_name",
      "p.reply_count",
      "p.created_at",
      "p.deleted_at",
    ]);
  if (options.status === "live")
    query = query.where("p.deleted_at", "is", null);
  if (options.status === "deleted") {
    query = query.where("p.deleted_at", "is not", null);
  }
  if (options.author) query = query.where("u.login_name", "=", options.author);

  const rows = await query
    .orderBy("p.created_at", "desc")
    .limit(MODERATION_PAGE_SIZE + 1)
    .offset((options.page - 1) * MODERATION_PAGE_SIZE)
    .execute();
  return {
    posts: rows.slice(0, MODERATION_PAGE_SIZE).map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      excerpt: flat(row.body),
      authorLoginName: row.login_name,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      restorable: row.kind !== "template",
    })),
    hasMore: rows.length > MODERATION_PAGE_SIZE,
  };
}

export async function listRepliesForModeration(options: {
  status: ModerationStatus;
  author: string | null;
  page: number;
}): Promise<{ replies: ModerationReply[]; hasMore: boolean }> {
  let query = db
    .selectFrom("board_replies as r")
    .innerJoin("users as u", "u.id", "r.user_id")
    .innerJoin("board_posts as p", "p.id", "r.post_id")
    .select([
      "r.id",
      "r.post_id",
      "p.title",
      "p.deleted_at as post_deleted_at",
      sql<string>`left(r.body, 200)`.as("body"),
      "u.login_name",
      "r.created_at",
      "r.deleted_at",
    ]);
  if (options.status === "live")
    query = query.where("r.deleted_at", "is", null);
  if (options.status === "deleted") {
    query = query.where("r.deleted_at", "is not", null);
  }
  if (options.author) query = query.where("u.login_name", "=", options.author);

  const rows = await query
    .orderBy("r.created_at", "desc")
    .orderBy("r.id", "desc")
    .limit(MODERATION_PAGE_SIZE + 1)
    .offset((options.page - 1) * MODERATION_PAGE_SIZE)
    .execute();
  return {
    replies: rows.slice(0, MODERATION_PAGE_SIZE).map((row) => ({
      id: row.id,
      postId: row.post_id,
      postTitle: row.title,
      postDeleted: row.post_deleted_at !== null,
      excerpt: flat(row.body),
      authorLoginName: row.login_name,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
    })),
    hasMore: rows.length > MODERATION_PAGE_SIZE,
  };
}

// Brings back a post that was deleted by its author or an admin. A template
// can't be restored: deleting it removed its files and previews.
export async function restorePost(user: User, postId: string): Promise<void> {
  assertBoardAdmin(user);
  const post = await db
    .selectFrom("board_posts")
    .select(["kind", "deleted_at"])
    .where("id", "=", postId)
    .executeTakeFirst();
  if (!post) throw new BoardError(404, "글을 찾을 수 없습니다.");
  if (!post.deleted_at) throw new BoardError(409, "지워지지 않은 글이에요.");
  if (post.kind === "template") {
    throw new BoardError(
      409,
      "템플릿 글은 되살릴 수 없어요. 지울 때 템플릿 파일도 함께 지워졌어요.",
    );
  }
  await db
    .updateTable("board_posts")
    .set({ deleted_at: null })
    .where("id", "=", postId)
    .execute();
}

// Brings back a deleted reply, and counts it on its post again.
export async function restoreReply(user: User, replyId: string): Promise<void> {
  assertBoardAdmin(user);
  await db.transaction().execute(async (tx) => {
    const restored = await tx
      .updateTable("board_replies")
      .set({ deleted_at: null })
      .where("id", "=", replyId)
      .where("deleted_at", "is not", null)
      .returning("post_id")
      .executeTakeFirst();
    if (!restored) {
      throw new BoardError(404, "지워진 답글을 찾을 수 없습니다.");
    }
    await tx
      .updateTable("board_posts")
      .set({ reply_count: sql`reply_count + 1` })
      .where("id", "=", restored.post_id)
      .execute();
  });
}
