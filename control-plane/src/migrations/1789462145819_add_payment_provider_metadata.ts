import type { Kysely } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("payments")
    .addColumn("toss_flow", "text")
    .addColumn("toss_mid", "text")
    .addColumn("toss_payment_type", "text")
    .addColumn("toss_method", "text")
    .addColumn("toss_currency", "text")
    .addColumn("toss_approved_at", "timestamptz")
    .addColumn("toss_receipt_url", "text")
    .addColumn("toss_api_version", "text")
    .execute();

  // Existing rows have no MID snapshot. Their attempt key remains a reliable
  // record of which service created the transaction.
  await db
    .updateTable("payments")
    .set((eb) => ({
      toss_flow: eb
        .case()
        .when("attempt_key", "like", "one_time:%")
        .then("one-time")
        .else("billing")
        .end(),
    }))
    .execute();

  await db.schema
    .createIndex("payments_toss_mid_idx")
    .on("payments")
    .column("toss_mid")
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("payments_toss_mid_idx").execute();
  await db.schema
    .alterTable("payments")
    .dropColumn("toss_flow")
    .dropColumn("toss_mid")
    .dropColumn("toss_payment_type")
    .dropColumn("toss_method")
    .dropColumn("toss_currency")
    .dropColumn("toss_approved_at")
    .dropColumn("toss_receipt_url")
    .dropColumn("toss_api_version")
    .execute();
}
