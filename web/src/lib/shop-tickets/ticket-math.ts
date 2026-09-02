import type { ShopTicketLine } from "../types";

export function money(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function ticketSubtotal(lines: ShopTicketLine[]): number {
  return money(
    lines.reduce(
      (sum, line) => sum + line.unitPrice * Math.max(0, line.quantity),
      0,
    ),
  );
}

export type TicketTotals = {
  subtotal: number;
  tradeCreditApplied: number;
  cashDue: number;
};

/**
 * Credit can never exceed the balance on the account or the price of the
 * ticket — whatever is left over stays on the account for next time.
 */
export function computeTicketTotals(args: {
  lines: ShopTicketLine[];
  creditRequested?: number;
  creditBalance?: number;
}): TicketTotals {
  const subtotal = ticketSubtotal(args.lines);
  const requested = Math.max(0, money(args.creditRequested ?? 0));
  const balance = Math.max(0, money(args.creditBalance ?? 0));
  const tradeCreditApplied = money(Math.min(requested, balance, subtotal));
  return {
    subtotal,
    tradeCreditApplied,
    cashDue: money(subtotal - tradeCreditApplied),
  };
}

export function normalizeTicketLines(
  lines: Array<Partial<ShopTicketLine>>,
): ShopTicketLine[] {
  const merged = new Map<string, ShopTicketLine>();

  for (const line of lines) {
    const inventoryItemId = line.inventoryItemId?.trim();
    if (!inventoryItemId) continue;

    const quantity = Math.max(1, Math.trunc(Number(line.quantity ?? 1)) || 1);
    const unitPrice = Math.max(0, money(Number(line.unitPrice ?? 0)));
    const existing = merged.get(inventoryItemId);

    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    merged.set(inventoryItemId, {
      inventoryItemId,
      displayName: line.displayName?.trim() || "Card",
      setName: line.setName?.trim() || undefined,
      quantity,
      unitPrice,
    });
  }

  return [...merged.values()];
}
