import { inventoryEffectiveQuantity, isInventorySold } from "../inventory/status";
import { applySaleToQuantities } from "../shopify/sold-detection";
import { sendShopTicketReceipt } from "../receipts/send-receipts";
import { pushShopifyLevelsAfterImport } from "../shopify/sync-inventory-levels";
import { dataStore } from "../storage/data-store";
import { getTradeCreditBalance, spendTradeCreditOnTicket } from "../trade-credit/trade-credit-ledger";
import type { InventoryItem, ShopTicket, ShopTicketLine, StoreSettings } from "../types";
import { computeTicketTotals, money } from "./ticket-math";

export type TicketLineProblem = {
  inventoryItemId: string;
  displayName: string;
  reason: "not_found" | "sold" | "short_stock";
  available: number;
};

export type CompleteTicketResult =
  | {
      ok: true;
      ticket: ShopTicket;
      creditApplied: number;
      creditRemaining: number;
      soldItemIds: string[];
    }
  | { ok: false; error: string; problems?: TicketLineProblem[] };

const MAX_TRACKED_TICKET_REFS = 50;

function ticketRef(ticketId: string): string {
  return `ticket:${ticketId}`;
}

function alreadyRungUp(item: InventoryItem, ticketId: string): boolean {
  return Boolean(item.ticketSaleRefs?.includes(ticketRef(ticketId)));
}

function withTicketRef(item: InventoryItem, ticketId: string): string[] {
  return [...(item.ticketSaleRefs ?? []), ticketRef(ticketId)].slice(
    -MAX_TRACKED_TICKET_REFS,
  );
}

/** Check every line can still be sold before any money or stock moves. */
export function findTicketLineProblems(
  lines: ShopTicketLine[],
  inventory: Map<string, InventoryItem>,
  ticketId: string,
): TicketLineProblem[] {
  const problems: TicketLineProblem[] = [];

  for (const line of lines) {
    const item = inventory.get(line.inventoryItemId);
    if (!item) {
      problems.push({
        inventoryItemId: line.inventoryItemId,
        displayName: line.displayName,
        reason: "not_found",
        available: 0,
      });
      continue;
    }

    if (alreadyRungUp(item, ticketId)) continue;

    if (isInventorySold(item)) {
      problems.push({
        inventoryItemId: line.inventoryItemId,
        displayName: line.displayName,
        reason: "sold",
        available: 0,
      });
      continue;
    }

    const available = inventoryEffectiveQuantity(item);
    if (available < line.quantity) {
      problems.push({
        inventoryItemId: line.inventoryItemId,
        displayName: line.displayName,
        reason: available <= 0 ? "sold" : "short_stock",
        available,
      });
    }
  }

  return problems;
}

/**
 * Ring up an in-store sale: take the trade credit first (idempotent on the
 * ticket id), then move the stock, then close the ticket. Shopify quantities
 * are pushed afterwards so the online shop stops selling what just walked out.
 */
export async function completeShopTicket(args: {
  ticket: ShopTicket;
  store: StoreSettings;
  creditRequested?: number;
  adminId?: string;
  adminName?: string;
}): Promise<CompleteTicketResult> {
  const { ticket, store } = args;

  if (ticket.status === "completed") {
    return {
      ok: false,
      error: `Ticket ${ticket.ticketNumber} is already completed.`,
    };
  }
  if (ticket.status === "voided") {
    return { ok: false, error: `Ticket ${ticket.ticketNumber} was voided.` };
  }
  if (!ticket.lines.length) {
    return { ok: false, error: "Add at least one card to the ticket." };
  }

  const creditRequested = Math.max(0, money(args.creditRequested ?? 0));
  if (creditRequested > 0 && !ticket.customerId) {
    return {
      ok: false,
      error: "Trade credit needs a signed-up customer on the ticket.",
    };
  }

  const inventory = new Map(
    (await dataStore.getInventory(store.id)).map((i) => [i.id, i]),
  );
  const problems = findTicketLineProblems(ticket.lines, inventory, ticket.id);
  if (problems.length) {
    return {
      ok: false,
      error: "Some cards on this ticket are no longer available.",
      problems,
    };
  }

  const balance = ticket.customerId
    ? (await getTradeCreditBalance(store.id, ticket.customerId)).balance
    : 0;
  const totals = computeTicketTotals({
    lines: ticket.lines,
    creditRequested,
    creditBalance: balance,
  });

  if (creditRequested > totals.tradeCreditApplied) {
    return {
      ok: false,
      error:
        creditRequested > balance
          ? `Only $${balance.toFixed(2)} of trade credit is available.`
          : "Trade credit cannot exceed the ticket total.",
    };
  }

  if (totals.tradeCreditApplied > 0 && ticket.customerId) {
    const spend = await spendTradeCreditOnTicket({
      storeId: store.id,
      customerId: ticket.customerId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      amount: totals.tradeCreditApplied,
    });
    if (!spend.ok) return { ok: false, error: spend.error };
  }

  const now = new Date().toISOString();
  const soldItemIds: string[] = [];
  const touched: InventoryItem[] = [];

  for (const line of ticket.lines) {
    const item = inventory.get(line.inventoryItemId);
    if (!item || alreadyRungUp(item, ticket.id)) continue;

    const { item: decremented, remaining } = applySaleToQuantities(
      item,
      line.quantity,
    );

    // syncedQuantity is left alone on purpose: the Shopify push below diffs
    // against it, so writing it here would silently skip the update.
    const updated: InventoryItem =
      remaining > 0
        ? {
            ...decremented,
            ticketSaleRefs: withTicketRef(item, ticket.id),
          }
        : {
            ...decremented,
            status: "sold",
            soldAt: now,
            soldChannel: "in_store",
            soldPrice: line.unitPrice,
            soldOrderId: ticket.id,
            ticketSaleRefs: withTicketRef(item, ticket.id),
          };

    await dataStore.saveInventoryItem(updated);
    soldItemIds.push(item.id);
    touched.push(updated);
  }

  const completed: ShopTicket = {
    ...ticket,
    status: "completed",
    subtotal: totals.subtotal,
    tradeCreditApplied: totals.tradeCreditApplied,
    cashDue: totals.cashDue,
    completedAt: now,
    updatedAt: now,
  };
  await dataStore.saveShopTicket(completed);

  await dataStore.logAdminAction({
    action: "shop_ticket_completed",
    adminId: args.adminId,
    metadata: {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerId: ticket.customerId,
      lines: ticket.lines.length,
      subtotal: totals.subtotal,
      tradeCreditApplied: totals.tradeCreditApplied,
      cashDue: totals.cashDue,
      soldItemIds,
    },
  });

  // Best effort: a Shopify hiccup must not undo a completed in-store sale.
  const listed = touched.filter((i) => i.shopifyListing?.inventoryItemId);
  if (listed.length && store.shopifyIntegration?.enabled) {
    await pushShopifyLevelsAfterImport(store.id, listed);
  }

  const creditRemaining = ticket.customerId
    ? (await getTradeCreditBalance(store.id, ticket.customerId)).balance
    : 0;

  await sendShopTicketReceipt({ store, ticket: completed, creditRemaining });

  return {
    ok: true,
    ticket: completed,
    creditApplied: totals.tradeCreditApplied,
    creditRemaining,
    soldItemIds,
  };
}
