import { describe, expect, test } from "@jest/globals";
import { parseTossWebhook, webhookLedgerAction } from "@/lib/toss-webhooks";

describe("Toss webhook parsing", () => {
  test("accepts payment status events", () => {
    expect(
      parseTossWebhook({
        eventType: "PAYMENT_STATUS_CHANGED",
        data: { orderId: "order-1", status: "DONE" },
      }),
    ).toEqual({ type: "payment-status-changed", orderId: "order-1" });
  });

  test("accepts billing-key deletion events", () => {
    expect(
      parseTossWebhook({
        eventType: "BILLING_DELETED",
        billingKey: "billing-1",
        reason: "customer request",
      }),
    ).toEqual({ type: "billing-deleted", billingKey: "billing-1" });
  });

  test.each([
    null,
    {},
    { eventType: "BILLING_DELETED" },
    { eventType: "DEPOSIT_CALLBACK", orderId: "order-1" },
  ])("ignores unsupported or malformed payloads", (payload) => {
    expect(parseTossWebhook(payload)).toEqual({ type: "ignored" });
  });
});

describe("Toss webhook ledger updates", () => {
  test.each(["READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT", "DONE"])(
    "leaves a %s payment pending for confirm and reconciliation",
    (status) => {
      expect(webhookLedgerAction(status)).toEqual({ type: "record" });
    },
  );

  test.each(["ABORTED", "EXPIRED", "FAILED"])(
    "fails a pending payment on %s",
    (status) => {
      expect(webhookLedgerAction(status)).toEqual({
        type: "fail",
        status: status.toLowerCase(),
      });
    },
  );

  test.each(["CANCELED", "PARTIAL_CANCELED"])(
    "reconciles a %s payment",
    (status) => {
      expect(webhookLedgerAction(status)).toEqual({ type: "reconcile" });
    },
  );
});
