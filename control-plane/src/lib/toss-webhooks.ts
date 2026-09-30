export type TossWebhookEvent =
  | { type: "payment-status-changed"; orderId: string }
  | { type: "billing-deleted"; billingKey: string }
  | { type: "ignored" };

export function parseTossWebhook(body: unknown): TossWebhookEvent {
  if (!body || typeof body !== "object") return { type: "ignored" };

  const event = body as Record<string, unknown>;
  // Toss nests every event's payload under data: BILLING_DELETED is
  // { eventType, createdAt, data: { billingKey, reason } }.
  if (event.eventType === "BILLING_DELETED") {
    const data = event.data;
    const billingKey =
      data && typeof data === "object"
        ? (data as Record<string, unknown>).billingKey
        : undefined;
    return typeof billingKey === "string" && billingKey
      ? { type: "billing-deleted", billingKey }
      : { type: "ignored" };
  }

  if (event.eventType !== "PAYMENT_STATUS_CHANGED") {
    return { type: "ignored" };
  }

  const data = event.data;
  if (!data || typeof data !== "object") return { type: "ignored" };
  const orderId = (data as Record<string, unknown>).orderId;
  return typeof orderId === "string"
    ? { type: "payment-status-changed", orderId }
    : { type: "ignored" };
}

// The ledger only knows pending, done and the terminal states, and every other
// path (confirm, the reconciler) acts only on pending rows. A webhook for an
// intermediate status — READY, IN_PROGRESS, WAITING_FOR_DEPOSIT — must leave the
// row pending, or the payment can never be confirmed or reconciled. DONE also
// leaves it pending: granting the paid period belongs to confirm, the renewal
// cron and the reconciler. Cancellations go through reconciliation instead.
const TERMINAL_FAILURE_STATUSES = new Set(["aborted", "expired", "failed"]);

export type WebhookLedgerAction =
  | { type: "reconcile" }
  | { type: "fail"; status: string }
  | { type: "record" };

export function webhookLedgerAction(tossStatus: string): WebhookLedgerAction {
  const status = tossStatus.toLowerCase();
  if (status === "canceled" || status === "partial_canceled") {
    return { type: "reconcile" };
  }
  if (TERMINAL_FAILURE_STATUSES.has(status)) {
    return { type: "fail", status };
  }
  return { type: "record" };
}
