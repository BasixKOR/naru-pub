import { db } from "@/lib/database";
import { deleteBillingKey, TossApiError } from "@/lib/toss";

const BATCH_SIZE = 100;
// A key Toss would not delete is retried at most this often.
const RETRY_AFTER_MS = 60 * 60 * 1000;

// Toss answers a key it no longer has with a not-found error. That key is as
// deleted as it will ever be.
function alreadyGone(error: unknown): boolean {
  return (
    error instanceof TossApiError &&
    (error.status === 404 || (error.code ?? "").startsWith("NOT_FOUND"))
  );
}

// Deletes the billing keys queued in retired_billing_keys (see the migration
// that adds it) at Toss. The row, which holds the key in plain text, is removed
// as soon as Toss confirms; a failure stays queued and is retried later.
export async function deleteRetiredBillingKeys(now = new Date()) {
  const retryBefore = new Date(now.getTime() - RETRY_AFTER_MS);
  const queued = await db
    .selectFrom("retired_billing_keys")
    .select(["id", "billing_key"])
    .where((eb) =>
      eb.or([
        eb("last_attempted_at", "is", null),
        eb("last_attempted_at", "<", retryBefore),
      ]),
    )
    .orderBy("id", "asc")
    .limit(BATCH_SIZE)
    .execute();

  let deleted = 0;
  let failed = 0;
  for (const row of queued) {
    try {
      await deleteBillingKey(row.billing_key);
    } catch (error) {
      if (!alreadyGone(error)) {
        failed += 1;
        await db
          .updateTable("retired_billing_keys")
          .set((eb) => ({
            attempts: eb("attempts", "+", 1),
            last_attempted_at: now,
            last_error: (error instanceof Error
              ? error.message
              : String(error)
            ).slice(0, 2000),
          }))
          .where("id", "=", row.id)
          .execute();
        console.error(
          `[delete-retired-billing-keys] key ${row.id}: deletion failed`,
          error,
        );
        continue;
      }
    }
    deleted += 1;
    await db
      .deleteFrom("retired_billing_keys")
      .where("id", "=", row.id)
      .execute();
  }
  return { deleted, failed };
}
