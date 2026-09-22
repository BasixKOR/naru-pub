import { Kysely, sql } from "kysely";

// An owner token's lifetime becomes an idle timeout: using it pushes its expiry
// forward. Sliding needs the two facts the row did not keep — when the token was
// issued, which bounds the slide, and the lifetime the owner consented to, which
// the registration may since have changed.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("site_data_access_tokens")
    .addColumn("issued_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();
  // Defaulted, not just not-null: a traffic rollback leaves this column in
  // place under code that knows nothing about it, and an owner signing in
  // through that older code must still get a token row it can insert.
  await db.schema
    .alterTable("site_data_access_tokens")
    .addColumn("lifetime_seconds", "integer", (c) => c.defaultTo(86400))
    .execute();
  // Tokens issued before this migration expire within a day, so what remains of
  // their original window is the closest stand-in for the lifetime they carried.
  await sql`update site_data_access_tokens set lifetime_seconds = greatest(60, ceil(extract(epoch from (expires_at - now())) / 60) * 60)`.execute(
    db,
  );
  await sql`update site_data_access_tokens set lifetime_seconds = 86400 where lifetime_seconds is null or lifetime_seconds > 86400`.execute(
    db,
  );
  await db.schema
    .alterTable("site_data_access_tokens")
    .alterColumn("lifetime_seconds", (c) => c.setNotNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const column of ["issued_at", "lifetime_seconds"]) {
    await db.schema
      .alterTable("site_data_access_tokens")
      .dropColumn(column)
      .execute();
  }
}
