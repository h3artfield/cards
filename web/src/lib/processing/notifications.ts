import type { BuybackOrder, Customer } from "../types";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

function defaultFromAddress(): string {
  if (process.env.EMAIL_FROM?.trim()) return process.env.EMAIL_FROM.trim();
  const fromEmail = process.env.PRICECHARTING_IMPORT_EMAIL_FROM?.trim();
  const fromName =
    process.env.PRICECHARTING_IMPORT_EMAIL_FROM_NAME?.trim() || "Card Scanner Reports";
  if (fromEmail) return `${fromName} <${fromEmail}>`;
  return "Card Scanner Reports <reports@cardscanner9000.com>";
}

async function sendViaResend(
  apiKey: string,
  from: string,
  payload: EmailPayload,
): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    console.error("[resend]", res.status, (await res.text()).slice(0, 200));
  }
  return res.ok;
}

/** Email via Resend (verified domain). Falls back to mock log when unconfigured. */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = defaultFromAddress();

  if (resendKey) {
    return sendViaResend(resendKey, from, payload);
  }

  console.log("[email mock]", payload.subject, "->", payload.to);
  return true;
}

export async function notifyOrderSubmitted(
  customer: Customer,
  order: BuybackOrder,
  storeName: string,
): Promise<void> {
  await sendEmail({
    to: customer.email,
    subject: `Order ${order.orderNumber} submitted — ${storeName}`,
    html: `<p>Hi ${customer.firstName},</p>
<p>Your buyback order <strong>${order.orderNumber}</strong> has been submitted.</p>
<p>We'll review your cards and notify you when your offer is ready.</p>
<p>— ${storeName}</p>`,
  });
}

export async function notifyOfferReady(
  customer: Customer,
  order: BuybackOrder,
  storeName: string,
  appUrl: string,
): Promise<void> {
  await sendEmail({
    to: customer.email,
    subject: `Your offer is ready — ${order.orderNumber}`,
    html: `<p>Hi ${customer.firstName},</p>
<p>Your buyback offer for order <strong>${order.orderNumber}</strong> is ready.</p>
<p>Cash offer: $${(order.totalCashOffer ?? 0).toFixed(2)}<br/>
Trade offer: $${(order.totalTradeOffer ?? 0).toFixed(2)}</p>
<p><a href="${appUrl}/order/${order.id}">View your order</a></p>
<p>— ${storeName}</p>`,
  });
}

export async function notifyOwner(
  ownerEmail: string,
  order: BuybackOrder,
  customer: Customer,
): Promise<void> {
  await sendEmail({
    to: ownerEmail,
    subject: `New buyback order ${order.orderNumber}`,
    html: `<p>New order from ${customer.firstName} ${customer.lastName}</p>
<p>Order: ${order.orderNumber}<br/>Cards need review: ${order.manualReviewCount ?? 0}</p>`,
  });
}
