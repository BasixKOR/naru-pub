import type { Kysely } from "kysely";
import { sql } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  // Metadata became mutable, so it needs the same conditional-write handle
  // documents have. Existing rows have been written exactly once.
  await db.schema
    .alterTable("site_data_files")
    .addColumn("version", "integer", (column) => column.notNull().defaultTo(1))
    .execute();
  // Listing a page walks (user_id, status) newest first and breaks ties on id,
  // which is also the shape the keyset cursor compares.
  await db.schema
    .createIndex("site_data_files_user_status_created_idx")
    .on("site_data_files")
    .columns(["user_id", "status", "created_at desc", "id desc"])
    .execute();
  // Metadata is filterable now; containment is what equality filters ask for.
  await sql`create index site_data_files_metadata_idx on site_data_files using gin (metadata jsonb_path_ops)`.execute(
    db,
  );
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index if exists site_data_files_metadata_idx`.execute(db);
  await db.schema
    .dropIndex("site_data_files_user_status_created_idx")
    .execute();
  await db.schema.alterTable("site_data_files").dropColumn("version").execute();
}
