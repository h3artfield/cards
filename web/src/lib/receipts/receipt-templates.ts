import type { ShopTicket } from "../types";

export type ReceiptEmail = {
  subject: string;
  html: string;
};

/** Card names come from scans and imports, so they are never trusted markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(amount: number): string {
  return `$${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

function greeting(firstName?: string): string {
  return firstName ? `<p>Hi ${escapeHtml(firstName)},</p>` : "<p>Hi,</p>";
}

function signOff(storeName: string): string {
  return `<p>— ${escapeHtml(storeName)}</p>`;
}

function lineRow(label: string, value: string, strong = false): string {
  const cell = strong ? `<strong>${value}</strong>` : value;
  return `<tr><td style="padding:2px 12px 2px 0">${escapeHtml(label)}</td><td style="padding:2px 0;text-align:right">${cell}</td></tr>`;
}

/** Receipt for an in-store sale rung up at the register. */
export function shopTicketReceipt(input: {
  storeName: string;
  ticket: ShopTicket;
  creditRemaining: number;
  customerFirstName?: string;
}): ReceiptEmail {
  const { ticket } = input;

  const items = ticket.lines
    .map(
      (line) =>
        `<tr><td style="padding:2px 12px 2px 0">${line.quantity}× ${escapeHtml(
          line.displayName,
        )}${line.setName ? ` <span style="color:#666">(${escapeHtml(line.setName)})</span>` : ""}</td>` +
        `<td style="padding:2px 0;text-align:right">${money(line.unitPrice * line.quantity)}</td></tr>`,
    )
    .join("\n");

  const totals = [
    lineRow("Subtotal", money(ticket.subtotal)),
    ticket.tradeCreditApplied > 0
      ? lineRow("Trade credit applied", `−${money(ticket.tradeCreditApplied)}`)
      : "",
    lineRow("Paid", money(ticket.cashDue), true),
  ]
    .filter(Boolean)
    .join("\n");

  const creditNote =
    ticket.tradeCreditApplied > 0 || input.creditRemaining > 0
      ? `<p>Trade credit remaining: <strong>${money(input.creditRemaining)}</strong></p>`
      : "";

  return {
    subject: `Receipt ${ticket.ticketNumber} — ${input.storeName}`,
    html: `${greeting(input.customerFirstName)}
<p>Thanks for shopping with us. Here's your receipt for ticket <strong>${escapeHtml(
      ticket.ticketNumber,
    )}</strong>.</p>
<table style="border-collapse:collapse;font-size:14px">
${items}
<tr><td colspan="2" style="border-top:1px solid #ddd;padding-top:6px"></td></tr>
${totals}
</table>
${creditNote}
${signOff(input.storeName)}`,
  };
}

/** Receipt for a completed buyback — cash paid out, or credit added. */
export function buybackCompletionReceipt(input: {
  storeName: string;
  orderNumber: string;
  orderId: string;
  offerType: "cash" | "trade";
  amount: number;
  cardCount: number;
  creditBalance?: number;
  customerFirstName?: string;
  appUrl?: string;
}): ReceiptEmail {
  const isTrade = input.offerType === "trade";
  const payoutLine = isTrade
    ? `<p>We added <strong>${money(input.amount)}</strong> in trade credit to your account.</p>`
    : `<p>We paid you <strong>${money(input.amount)}</strong> in cash.</p>`;

  const balanceLine =
    isTrade && input.creditBalance != null
      ? `<p>Your trade credit balance is now <strong>${money(
          input.creditBalance,
        )}</strong>. Spend it in store any time — staff apply it at the register, and anything left over stays on your account.</p>`
      : "";

  const link = input.appUrl
    ? `<p><a href="${input.appUrl}/order/${encodeURIComponent(input.orderId)}">View this order</a></p>`
    : "";

  return {
    subject: `Order ${input.orderNumber} complete — ${input.storeName}`,
    html: `${greeting(input.customerFirstName)}
<p>Your buyback order <strong>${escapeHtml(input.orderNumber)}</strong> is complete — ${
      input.cardCount
    } card${input.cardCount === 1 ? "" : "s"} purchased.</p>
${payoutLine}
${balanceLine}
${link}
${signOff(input.storeName)}`,
  };
}
