import type { BuybackOrder, Customer, OrderNotifications } from "../types";
import { clerkOrderPhase, isOrderReadyForReview } from "./order-phase";
import type { OrderStatus } from "../types";

export type ReadyForReviewEmailStatus = "sent" | "failed" | "skipped";

export interface ReadyForReviewEmailNotification {
  attemptedAt: string;
  sentAt?: string;
  status: ReadyForReviewEmailStatus;
  provider: "resend";
  to?: string;
  messageId?: string;
  error?: string;
}

export function isReadyForReviewCustomerEmailEnabled(): boolean {
  return (
    process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED?.trim().toLowerCase() === "true"
  );
}

export function getReadyForReviewEmailStartAt(): Date | null {
  const raw = process.env.ORDER_READY_CUSTOMER_EMAIL_START_AT?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readyEmailFromAddress(): string {
  const fromEmail =
    process.env.ORDER_READY_CUSTOMER_EMAIL_FROM?.trim() ||
    process.env.PRICECHARTING_IMPORT_EMAIL_FROM?.trim() ||
    "reports@cardscanner9000.com";
  const fromName =
    process.env.ORDER_READY_CUSTOMER_EMAIL_FROM_NAME?.trim() ||
    process.env.PRICECHARTING_IMPORT_EMAIL_FROM_NAME?.trim() ||
    "Card Scanner Reports";
  return `${fromName} <${fromEmail}>`;
}

export function shouldTransitionTriggerReadyEmail(
  previousStatus: OrderStatus,
  newStatus: OrderStatus,
): boolean {
  return (
    clerkOrderPhase(previousStatus) === "building" &&
    clerkOrderPhase(newStatus) === "ready_for_review"
  );
}

export function isOrderEligibleForReadyEmail(order: BuybackOrder): boolean {
  if (!isReadyForReviewCustomerEmailEnabled()) return false;

  const startAt = getReadyForReviewEmailStartAt();
  if (startAt && new Date(order.createdAt) < startAt) return false;

  if (order.orderNotifications?.readyForReviewEmail?.status === "sent") {
    return false;
  }

  return true;
}

export function buildReadyForReviewEmailHtml(input: {
  orderNumber: string;
  storeName?: string;
  cardCount?: number;
}): string {
  const intro = input.storeName?.trim()
    ? `<p>Your card order at <strong>${escapeHtml(input.storeName.trim())}</strong> has finished processing.</p>`
    : `<p>Your card order has finished processing.</p>`;

  const cardLine =
    input.cardCount != null && input.cardCount > 0
      ? `<p>Cards scanned: ${input.cardCount}</p>`
      : "";

  return `${intro}
<p>Order number: <strong>${escapeHtml(input.orderNumber)}</strong></p>
${cardLine}
<p>Please bring your cards to a store associate for final review.</p>
<p>Your offer is not final until an associate verifies the cards, condition, and pricing.</p>
<p>Thank you.</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ResendSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendReadyForReviewEmailViaResend(input: {
  to: string;
  subject: string;
  html: string;
  fetchImpl?: typeof fetch;
}): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const fetchFn = input.fetchImpl ?? fetch;
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: readyEmailFromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });

    const bodyText = await res.text();
    if (!res.ok) {
      console.error("[order ready email]", res.status, bodyText.slice(0, 200));
      let errMsg = `Resend HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(bodyText) as { message?: string };
        if (parsed.message) errMsg = parsed.message;
      } catch {
        /* use default */
      }
      return { ok: false, error: errMsg };
    }

    let messageId = "";
    try {
      const parsed = JSON.parse(bodyText) as { id?: string };
      messageId = parsed.id?.trim() ?? "";
    } catch {
      /* empty id ok */
    }
    return { ok: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[order ready email]", msg);
    return { ok: false, error: msg };
  }
}

function mergeReadyNotification(
  order: BuybackOrder,
  notification: ReadyForReviewEmailNotification,
): BuybackOrder {
  const orderNotifications: OrderNotifications = {
    ...order.orderNotifications,
    readyForReviewEmail: notification,
  };
  return { ...order, orderNotifications };
}

export async function handleOrderReadyForReviewTransition(input: {
  previousStatus: OrderStatus;
  order: BuybackOrder;
  customer?: Customer | null;
  storeName?: string;
  cardCount?: number;
  fetchImpl?: typeof fetch;
}): Promise<BuybackOrder> {
  const { previousStatus, order } = input;

  if (!shouldTransitionTriggerReadyEmail(previousStatus, order.status)) {
    return order;
  }

  if (!isOrderEligibleForReadyEmail(order)) {
    return order;
  }

  const attemptedAt = new Date().toISOString();
  const email = input.customer?.email?.trim();

  if (!email) {
    return mergeReadyNotification(order, {
      attemptedAt,
      status: "skipped",
      provider: "resend",
      error: "no customer email",
    });
  }

  const result = await sendReadyForReviewEmailViaResend({
    to: email,
    subject: "Your card order is ready for review",
    html: buildReadyForReviewEmailHtml({
      orderNumber: order.orderNumber,
      storeName: input.storeName,
      cardCount: input.cardCount,
    }),
    fetchImpl: input.fetchImpl,
  });

  if (result.ok) {
    return mergeReadyNotification(order, {
      attemptedAt,
      sentAt: attemptedAt,
      status: "sent",
      provider: "resend",
      to: email,
      messageId: result.messageId || undefined,
    });
  }

  return mergeReadyNotification(order, {
    attemptedAt,
    status: "failed",
    provider: "resend",
    to: email,
    error: result.error,
  });
}

export function orderReadyEmailStatusLabel(
  order: BuybackOrder,
  hasCustomerEmail: boolean,
): string {
  const n = order.orderNotifications?.readyForReviewEmail;
  if (n?.status === "sent") return "Customer email: Sent";
  if (n?.status === "failed") return "Customer email: Failed";
  if (n?.status === "skipped") {
    if (n.error === "no customer email") {
      return "Customer email: Skipped — no customer email";
    }
    return "Customer email: Skipped";
  }
  if (isOrderReadyForReview(order.status) && !hasCustomerEmail) {
    return "Customer email: Skipped — no customer email";
  }
  return "Customer email: Not sent yet";
}
