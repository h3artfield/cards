import type { InventoryItem, InventorySaleLogEntry, InventorySalesChannel } from "../types";

const MAX_SALE_LOG_ENTRIES = 50;

export function withSaleLog(
  item: InventoryItem,
  sale: { at: string; quantity: number; unitPrice: number; channel: InventorySalesChannel },
): InventorySaleLogEntry[] | undefined {
  const quantity = Math.trunc(sale.quantity);
  if (!(quantity > 0)) return item.saleLog;
  const entry: InventorySaleLogEntry = {
    at: sale.at,
    quantity,
    unitPrice: Number.isFinite(sale.unitPrice) ? sale.unitPrice : 0,
    channel: sale.channel,
  };
  return [...(item.saleLog ?? []), entry].slice(-MAX_SALE_LOG_ENTRIES);
}

/**
 * Sales against `item` since `sinceMs`. Rows sold out before the log existed
 * fall back to their `soldAt` / `soldPrice`.
 */
export function salesSince(
  item: InventoryItem,
  sinceMs: number,
): { quantity: number; revenue: number } {
  if (item.saleLog?.length) {
    let quantity = 0;
    let revenue = 0;
    for (const sale of item.saleLog) {
      if (Date.parse(sale.at) < sinceMs) continue;
      quantity += sale.quantity;
      revenue += sale.quantity * sale.unitPrice;
    }
    return { quantity, revenue };
  }
  if (item.soldAt && Date.parse(item.soldAt) >= sinceMs) {
    return { quantity: 1, revenue: item.soldPrice ?? 0 };
  }
  return { quantity: 0, revenue: 0 };
}
