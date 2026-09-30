import { sql, type Kysely } from "kysely";

// The board (게시판): posts, threaded replies, likes, reply notifications, and
// templates. A template is a snapshot of a folder from its author's home
// directory, copied to `_templates/<template_id>/v<version>/` in the site
// bucket, which no login name can shadow. docs/board.md has the design.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table board_posts (
      id bigserial primary key,
      user_id integer not null references users (id) on delete cascade,
      kind text not null check (kind in ('site', 'template', 'question', 'chat')),
      title text not null check (char_length(title) between 1 and 200),
      body text not null default '' check (char_length(body) <= 20000),
      reply_count integer not null default 0,
      like_count integer not null default 0,
      last_reply_at timestamptz,
      last_reply_user_id integer references users (id) on delete set null,
      activity_at timestamptz not null default now(),
      solved_reply_id bigint,
      federated_note_iri text,
      created_at timestamptz not null default now(),
      edited_at timestamptz,
      deleted_at timestamptz
    )
  `.execute(db);
  await sql`create index board_posts_activity on board_posts (activity_at desc) where deleted_at is null`.execute(
    db,
  );
  await sql`create index board_posts_kind_activity on board_posts (kind, activity_at desc) where deleted_at is null`.execute(
    db,
  );
  await sql`create index board_posts_kind_created on board_posts (kind, created_at desc) where deleted_at is null`.execute(
    db,
  );
  await sql`create index board_posts_user_created on board_posts (user_id, created_at desc)`.execute(
    db,
  );

  await sql`
    create table board_replies (
      id bigserial primary key,
      post_id bigint not null references board_posts (id) on delete cascade,
      parent_id bigint references board_replies (id) on delete cascade,
      user_id integer not null references users (id) on delete cascade,
      depth smallint not null check (depth between 0 and 4),
      path bigint[] not null,
      body text not null check (char_length(body) between 1 and 5000),
      like_count integer not null default 0,
      created_at timestamptz not null default now(),
      edited_at timestamptz,
      deleted_at timestamptz
    )
  `.execute(db);
  await sql`create index board_replies_post_path on board_replies (post_id, path)`.execute(
    db,
  );
  await sql`create index board_replies_user_created on board_replies (user_id, created_at desc)`.execute(
    db,
  );
  await sql`
    alter table board_posts add constraint board_posts_solved_reply
      foreign key (solved_reply_id) references board_replies (id) on delete set null
  `.execute(db);

  await sql`
    create table board_post_likes (
      post_id bigint not null references board_posts (id) on delete cascade,
      user_id integer not null references users (id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (post_id, user_id)
    )
  `.execute(db);
  await sql`
    create table board_reply_likes (
      reply_id bigint not null references board_replies (id) on delete cascade,
      user_id integer not null references users (id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (reply_id, user_id)
    )
  `.execute(db);

  await sql`
    create table board_notifications (
      id bigserial primary key,
      user_id integer not null references users (id) on delete cascade,
      reply_id bigint not null references board_replies (id) on delete cascade,
      reason text not null check (reason in ('reply_to_post', 'reply_to_reply')),
      read_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create index board_notifications_unread on board_notifications (user_id, created_at desc) where read_at is null`.execute(
    db,
  );
  await sql`create index board_notifications_user on board_notifications (user_id, created_at desc)`.execute(
    db,
  );

  await sql`
    create table board_templates (
      id bigserial primary key,
      post_id bigint not null unique references board_posts (id) on delete cascade,
      user_id integer not null references users (id) on delete cascade,
      slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64),
      license text not null check (license in ('cc-by-4.0', 'cc-by-sa-4.0', 'cc0-1.0')),
      remix_allowed boolean not null default true,
      remixed_from_version_id bigint,
      latest_version_id bigint,
      apply_count integer not null default 0,
      remix_count integer not null default 0,
      unique (user_id, slug)
    )
  `.execute(db);

  await sql`
    create table board_template_versions (
      id bigserial primary key,
      template_id bigint not null references board_templates (id) on delete cascade,
      version integer not null,
      source_path text not null,
      file_count integer not null,
      size_bytes bigint not null,
      data_collections jsonb not null default '[]',
      changelog text,
      preview_rendered_at timestamptz,
      created_at timestamptz not null default now(),
      unique (template_id, version)
    )
  `.execute(db);
  await sql`create index board_template_versions_unrendered on board_template_versions (created_at) where preview_rendered_at is null`.execute(
    db,
  );
  await sql`
    alter table board_templates
      add constraint board_templates_latest_version
        foreign key (latest_version_id) references board_template_versions (id) on delete set null,
      add constraint board_templates_remixed_from
        foreign key (remixed_from_version_id) references board_template_versions (id) on delete set null
  `.execute(db);

  await sql`
    create table board_template_files (
      version_id bigint not null references board_template_versions (id) on delete cascade,
      path text not null,
      size_bytes bigint not null,
      content_type text not null,
      primary key (version_id, path)
    )
  `.execute(db);

  await sql`
    create table board_template_applications (
      id bigserial primary key,
      -- Kept when the template goes away: undoing needs only this row.
      version_id bigint references board_template_versions (id) on delete set null,
      user_id integer not null references users (id) on delete cascade,
      target_path text not null,
      backup_path text,
      written_paths text[] not null,
      overwritten_paths text[] not null,
      created_collections text[] not null default '{}',
      created_at timestamptz not null default now(),
      undone_at timestamptz
    )
  `.execute(db);
  await sql`create index board_template_applications_user on board_template_applications (user_id, created_at desc)`.execute(
    db,
  );
  await sql`create index board_template_applications_version on board_template_applications (version_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table board_template_applications`.execute(db);
  await sql`alter table board_templates drop constraint board_templates_latest_version, drop constraint board_templates_remixed_from`.execute(
    db,
  );
  await sql`drop table board_template_files`.execute(db);
  await sql`drop table board_template_versions`.execute(db);
  await sql`drop table board_templates`.execute(db);
  await sql`drop table board_notifications`.execute(db);
  await sql`drop table board_reply_likes`.execute(db);
  await sql`drop table board_post_likes`.execute(db);
  await sql`alter table board_posts drop constraint board_posts_solved_reply`.execute(
    db,
  );
  await sql`drop table board_replies`.execute(db);
  await sql`drop table board_posts`.execute(db);
}
