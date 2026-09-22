import type { Kysely } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  // Sign-in no longer uses a per-site client ID: the site name and exact
  // callback identify a registration. Deploy only once the running slot no
  // longer reads this table (504490d or later), since migrations run while
  // the previous slot still serves.
  await db.schema.dropTable("site_data_site_clients").execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  // Empty is enough: code that read this table created an owner's row on
  // first use. The IDs it held were public and nothing needs them back.
  await db.schema
    .createTable("site_data_site_clients")
    .addColumn("user_id", "integer", (c) =>
      c.primaryKey().references("users.id").onDelete("cascade"),
    )
    .addColumn("id", "text", (c) => c.notNull().unique())
    .execute();
}
