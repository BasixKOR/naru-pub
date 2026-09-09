import { sql } from "kysely";
import { db } from "@/lib/database";

// Authorization codes, access tokens and public-write rate-limit buckets were
// only ever swept opportunistically, by the next request that happened to touch
// the same owner. A site that is signed into once and then left alone keeps its
// expired rows forever, and the rate-limit table accumulates a bucket per
// (owner, client IP) that nothing revisits. None of that is load-bearing, so a
// periodic sweep is the whole fix.
async function main() {
  const expiredCodes = await db
    .deleteFrom("site_data_auth_codes")
    .where("expires_at", "<=", new Date())
    .executeTakeFirst();
  const expiredTokens = await db
    .deleteFrom("site_data_access_tokens")
    .where("expires_at", "<=", new Date())
    .executeTakeFirst();
  // Buckets are keyed to a wall-clock minute. Anything older than a couple of
  // minutes can no longer deny a request, so it is only taking up space.
  const staleBuckets = await db
    .deleteFrom("site_data_rate_limits")
    .where("window_start", "<", sql<Date>`now() - interval '5 minutes'`)
    .executeTakeFirst();
  const rows = (deleted: { numDeletedRows: bigint } | undefined) =>
    Number(deleted?.numDeletedRows ?? 0);
  console.log(
    `[site-data-cleanup] Removed ${rows(expiredCodes)} codes, ` +
      `${rows(expiredTokens)} tokens, ` +
      `${rows(staleBuckets)} rate-limit buckets`,
  );
}

main().finally(() => db.destroy());
