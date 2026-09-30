import { sql, type Kysely } from "kysely";

// Board posts are keyed by a UUID instead of a sequence number, so post
// addresses (/board/<id>) don't reveal how many posts there are or let anyone
// walk them in order. uuidv7() (PostgreSQL 18) is time-ordered, so new rows
// still land at the end of the index. Existing posts get a new id, and every
// table that points at a post follows.
//
// Also drops the template application columns that only undo read, now that
// applications can't be undone. The backups applying makes are unchanged.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table board_posts add column uuid uuid not null default uuidv7()`.execute(
    db,
  );

  for (const table of [
    "board_replies",
    "board_post_likes",
    "board_templates",
  ]) {
    await sql`alter table ${sql.table(table)} add column post_uuid uuid`.execute(
      db,
    );
    await sql`
      update ${sql.table(table)} t set post_uuid = p.uuid
      from board_posts p where p.id = t.post_id
    `.execute(db);
    await sql`alter table ${sql.table(table)} alter column post_uuid set not null`.execute(
      db,
    );
  }

  await sql`drop index board_replies_post_path`.execute(db);
  await sql`alter table board_replies drop column post_id`.execute(db);
  await sql`alter table board_post_likes drop column post_id`.execute(db);
  await sql`alter table board_templates drop column post_id`.execute(db);

  await sql`alter table board_posts drop constraint board_posts_pkey`.execute(
    db,
  );
  await sql`alter table board_posts drop column id`.execute(db);
  await sql`alter table board_posts rename column uuid to id`.execute(db);
  await sql`alter table board_posts add primary key (id)`.execute(db);

  await sql`alter table board_replies rename column post_uuid to post_id`.execute(
    db,
  );
  await sql`
    alter table board_replies add constraint board_replies_post_id_fkey
      foreign key (post_id) references board_posts (id) on delete cascade
  `.execute(db);
  await sql`create index board_replies_post_path on board_replies (post_id, path)`.execute(
    db,
  );

  await sql`alter table board_post_likes rename column post_uuid to post_id`.execute(
    db,
  );
  await sql`alter table board_post_likes add primary key (post_id, user_id)`.execute(
    db,
  );
  await sql`
    alter table board_post_likes add constraint board_post_likes_post_id_fkey
      foreign key (post_id) references board_posts (id) on delete cascade
  `.execute(db);

  await sql`alter table board_templates rename column post_uuid to post_id`.execute(
    db,
  );
  await sql`
    alter table board_templates
      add constraint board_templates_post_id_key unique (post_id),
      add constraint board_templates_post_id_fkey
        foreign key (post_id) references board_posts (id) on delete cascade
  `.execute(db);

  await sql`
    alter table board_template_applications
      drop column target_path,
      drop column backup_path,
      drop column written_paths,
      drop column overwritten_paths,
      drop column created_collections,
      drop column undone_at
  `.execute(db);
}

// Posts get new sequence numbers, in creation order. The dropped application
// columns come back empty: what those applications wrote is not recoverable.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table board_template_applications
      add column target_path text not null default '',
      add column backup_path text,
      add column written_paths text[] not null default '{}',
      add column overwritten_paths text[] not null default '{}',
      add column created_collections text[] not null default '{}',
      add column undone_at timestamptz
  `.execute(db);

  await sql`alter table board_posts add column serial bigserial`.execute(db);
  await sql`
    with ordered as (
      select id, row_number() over (order by created_at, id) as n from board_posts
    )
    update board_posts p set serial = ordered.n from ordered where ordered.id = p.id
  `.execute(db);
  await sql`select setval(pg_get_serial_sequence('board_posts', 'serial'), coalesce((select max(serial) from board_posts), 0) + 1, false)`.execute(
    db,
  );

  for (const table of [
    "board_replies",
    "board_post_likes",
    "board_templates",
  ]) {
    await sql`alter table ${sql.table(table)} add column post_serial bigint`.execute(
      db,
    );
    await sql`
      update ${sql.table(table)} t set post_serial = p.serial
      from board_posts p where p.id = t.post_id
    `.execute(db);
    await sql`alter table ${sql.table(table)} alter column post_serial set not null`.execute(
      db,
    );
  }

  await sql`drop index board_replies_post_path`.execute(db);
  await sql`alter table board_replies drop column post_id`.execute(db);
  await sql`alter table board_post_likes drop column post_id`.execute(db);
  await sql`alter table board_templates drop column post_id`.execute(db);

  await sql`alter table board_posts drop constraint board_posts_pkey`.execute(
    db,
  );
  await sql`alter table board_posts drop column id`.execute(db);
  await sql`alter table board_posts rename column serial to id`.execute(db);
  await sql`alter sequence board_posts_serial_seq rename to board_posts_id_seq`.execute(
    db,
  );
  await sql`alter table board_posts add primary key (id)`.execute(db);

  await sql`alter table board_replies rename column post_serial to post_id`.execute(
    db,
  );
  await sql`
    alter table board_replies add constraint board_replies_post_id_fkey
      foreign key (post_id) references board_posts (id) on delete cascade
  `.execute(db);
  await sql`create index board_replies_post_path on board_replies (post_id, path)`.execute(
    db,
  );

  await sql`alter table board_post_likes rename column post_serial to post_id`.execute(
    db,
  );
  await sql`alter table board_post_likes add primary key (post_id, user_id)`.execute(
    db,
  );
  await sql`
    alter table board_post_likes add constraint board_post_likes_post_id_fkey
      foreign key (post_id) references board_posts (id) on delete cascade
  `.execute(db);

  await sql`alter table board_templates rename column post_serial to post_id`.execute(
    db,
  );
  await sql`
    alter table board_templates
      add constraint board_templates_post_id_key unique (post_id),
      add constraint board_templates_post_id_fkey
        foreign key (post_id) references board_posts (id) on delete cascade
  `.execute(db);
}
