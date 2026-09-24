import { sql, type Kysely } from "kysely";

// Document IDs are ASCII. A fixed collation keeps their order independent of
// the database locale, and makes the existing primary/time indexes usable by
// queries with the SDK's explicit C ordering. PostgreSQL rebuilds those indexes.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table site_data_documents alter column id type text collate "C"`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table site_data_documents alter column id type text collate "default"`.execute(
    db,
  );
}
