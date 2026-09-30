import { sql, type Kysely } from "kysely";

// Templates can no longer be remixed, so the columns that recorded it go.
// Deploy only after a release that no longer reads them is live: migrations
// run while the previous release is still serving.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table board_templates
      drop column remixed_from_version_id,
      drop column remix_allowed,
      drop column remix_count
  `.execute(db);
}

// Brings the columns back empty: which templates were remixes is not
// recoverable.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    alter table board_templates
      add column remix_allowed boolean not null default true,
      add column remixed_from_version_id bigint,
      add column remix_count integer not null default 0,
      add constraint board_templates_remixed_from
        foreign key (remixed_from_version_id)
        references board_template_versions (id) on delete set null
  `.execute(db);
}
