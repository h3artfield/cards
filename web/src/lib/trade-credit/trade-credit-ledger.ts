import { dataStore } from "../storage/data-store";
import type {
  BuybackOrder,
  BuybackTransaction,
  TradeCreditBalance,
  TradeCreditEntry,
} from "../types";

function money(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function issuedEntryId(transactionId: string): string {
  return `tc-issued-${transactionId}`;
}

function reversalEntryId(transactionId: string): string {
  return `tc-reversal-${transactionId}`;
}

function spentEntryId(ticketId: string): string {
  return `tc-spent-${ticketId}`;
}

export function emptyTradeCreditBalance(
  storeId: string,
  customerId: string,
): TradeCreditBalance {
  return {
    storeId,
    customerId,
    balance: 0,
    issued: 0,
    spent: 0,
    entryCount: 0,
  };
}

export function computeTradeCreditBalance(
  storeId: string,
  customerId: string,
  entries: TradeCreditEntry[],
): TradeCreditBalance {
  let balance = 0;
  let issued = 0;
  let spent = 0;
  let lastEntryAt: string | undefined;

  for (const entry of entries) {
    // Round per entry so a ledger of fractional-cent rows can't drift.
    const amount = money(entry.amount);
    balance += amount;
    if (amount > 0) issued += amount;
    else spent += Math.abs(amount);
    if (!lastEntryAt || entry.createdAt > lastEntryAt) {
      lastEntryAt = entry.createdAt;
    }
  }

  return {
    storeId,
    customerId,
    balance: money(balance),
    issued: money(issued),
    spent: money(spent),
    entryCount: entries.length,
    lastEntryAt,
  };
}

export async function getTradeCreditBalance(
  storeId: string,
  customerId: string,
): Promise<TradeCreditBalance> {
  const entries = await dataStore.getTradeCreditEntries(storeId, customerId);
  return computeTradeCreditBalance(storeId, customerId, entries);
}

export async function getTradeCreditLedger(
  storeId: string,
  customerId: string,
): Promise<{ balance: TradeCreditBalance; entries: TradeCreditEntry[] }> {
  const entries = await dataStore.getTradeCreditEntries(storeId, customerId);
  return {
    balance: computeTradeCreditBalance(storeId, customerId, entries),
    entries,
  };
}

/**
 * Credit the customer for a buyback completed as trade. Keyed on the
 * transaction id so re-running a completion cannot double-issue.
 */
export async function issueTradeCreditForBuyback(args: {
  order: BuybackOrder;
  transaction: BuybackTransaction;
  storeId: string;
}): Promise<TradeCreditEntry | null> {
  const { order, transaction, storeId } = args;
  if (transaction.type !== "trade") return null;

  const amount = money(transaction.amount);
  if (amount <= 0) return null;

  const entry: TradeCreditEntry = {
    id: issuedEntryId(transaction.id),
    storeId,
    customerId: order.customerId,
    type: "issued",
    amount,
    orderId: order.id,
    orderNumber: order.orderNumber,
    transactionId: transaction.id,
    createdAt: transaction.createdAt,
  };

  await dataStore.saveTradeCreditEntry(entry);
  return entry;
}

/**
 * Spend credit on an in-store ticket. Keyed on the ticket id so retrying a
 * failed completion cannot charge the customer twice; the balance is checked
 * again here because it may have moved since the ticket was written.
 */
export async function spendTradeCreditOnTicket(args: {
  storeId: string;
  customerId: string;
  ticketId: string;
  ticketNumber?: string;
  amount: number;
}): Promise<
  | { ok: true; entry: TradeCreditEntry | null; applied: number }
  | { ok: false; error: string; balance: number }
> {
  const amount = money(args.amount);
  if (amount <= 0) return { ok: true, entry: null, applied: 0 };

  const id = spentEntryId(args.ticketId);
  const existing = await dataStore.getTradeCreditEntry(id);
  if (existing) {
    return { ok: true, entry: existing, applied: Math.abs(existing.amount) };
  }

  const { balance } = await getTradeCreditBalance(args.storeId, args.customerId);
  if (amount > balance) {
    return {
      ok: false,
      error: `Only $${balance.toFixed(2)} of trade credit is available.`,
      balance,
    };
  }

  const entry: TradeCreditEntry = {
    id,
    storeId: args.storeId,
    customerId: args.customerId,
    type: "spent",
    amount: money(-amount),
    ticketId: args.ticketId,
    note: args.ticketNumber ? `Ticket ${args.ticketNumber}` : undefined,
    createdAt: new Date().toISOString(),
  };

  await dataStore.saveTradeCreditEntry(entry);
  return { ok: true, entry, applied: amount };
}

/**
 * Back out credit when a completed trade order is reopened. Recorded as a
 * reversal rather than a delete, so the ledger still explains the balance —
 * including a negative balance when the customer already spent the credit.
 */
export async function reverseTradeCreditForOrder(args: {
  orderId: string;
  storeId: string;
  note?: string;
}): Promise<TradeCreditEntry[]> {
  const entries = await dataStore.getTradeCreditEntriesByOrder(args.orderId);
  const issued = entries.filter((e) => e.type === "issued");
  const alreadyReversed = new Set(
    entries
      .filter((e) => e.type === "reversal")
      .map((e) => e.transactionId)
      .filter((id): id is string => Boolean(id)),
  );

  const created: TradeCreditEntry[] = [];
  const now = new Date().toISOString();

  for (const entry of issued) {
    if (!entry.transactionId || alreadyReversed.has(entry.transactionId)) {
      continue;
    }
    const reversal: TradeCreditEntry = {
      id: reversalEntryId(entry.transactionId),
      storeId: args.storeId,
      customerId: entry.customerId,
      type: "reversal",
      amount: money(-entry.amount),
      orderId: entry.orderId,
      orderNumber: entry.orderNumber,
      transactionId: entry.transactionId,
      note: args.note ?? "Order reopened",
      createdAt: now,
    };
    await dataStore.saveTradeCreditEntry(reversal);
    created.push(reversal);
  }

  return created;
}
