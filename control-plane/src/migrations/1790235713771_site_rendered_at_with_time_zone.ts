import { sql, type Kysely } from "kysely";

// site_rendered_at was the one `timestamp` compared with a `timestamptz`:
// update-screenshots renders a site when site_rendered_at < site_updated_at.
// The job writes it from a container on UTC, so the stored wall-clock time is
// UTC, but PostgreSQL compares by reading it in the session time zone, which
// on the production server is Asia/Seoul. Every render therefore looked nine
// hours older than it was, and any site updated in the last nine hours was
// rendered again every fifteen minutes. The values are UTC, so they are read
// as UTC here; readers get back the same instants they did before.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table users alter column site_rendered_at type timestamptz using site_rendered_at at time zone 'UTC'`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table users alter column site_rendered_at type timestamp using site_rendered_at at time zone 'UTC'`.execute(
    db,
  );
}
