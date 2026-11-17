import { sellPrice } from "../../inventory/sell-price";
import { shelfConditionLabel, shelfConditionShort, shelfCustomerName } from "../../inventory/shelf-row-edit";
import { inventoryEffectiveQuantity, isCatalogImportItem } from "../../inventory/status";
import { saleEvents } from "../../reports/daily-reports";
import type { InventoryItem } from "../../types";
import { formatMoney, plural, shelfName } from "../format";
import type { ShopAnswer, ShopToolArgs } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SlowStockRow = {
  item: InventoryItem;
  name: string;
  quantity: number;
  price: number;
  /** Price times copies on hand. */
  value: number;
  days: number;
};

/**
 * Cards that have sat: in stock, on file for at least `olderThanDays`, priced
 * at or above `minPrice`, with no sale in that many days. Highest value first.
 *
 * Age is `ingestedAt ?? acquiredAt`, the Inventory report's own measure.
 */
export function slowStock(inventory: InventoryItem[], args: ShopToolArgs["slow_stock"], now: Date): SlowStockRow[] {
  const cutoff = now.getTime() - args.olderThanDays * DAY_MS;
  const rows: SlowStockRow[] = [];
  for (const item of inventory) {
    if (!isCatalogImportItem(item)) continue;
    const quantity = inventoryEffectiveQuantity(item);
    if (quantity <= 0) continue;
    const price = sellPrice(item);
    if (price < args.minPrice) continue;
    const added = Date.parse(item.ingestedAt ?? item.acquiredAt ?? "");
    if (!Number.isFinite(added) || added > cutoff) continue;
    if (saleEvents(item).some((sale) => Date.parse(sale.at) >= cutoff)) continue;
    rows.push({
      item,
      name: shelfCustomerName(item),
      quantity,
      price,
      value: Math.round(price * quantity * 100) / 100,
      days: Math.floor((now.getTime() - added) / DAY_MS),
    });
  }
  return rows.sort(
    (a, b) => b.value - a.value || b.days - a.days || a.name.localeCompare(b.name) || a.item.id.localeCompare(b.item.id),
  );
}

/** "What's been sitting?" It lists cards. It does not suggest prices. */
export function slowStockAnswer(inventory: InventoryItem[], args: ShopToolArgs["slow_stock"], now: Date): ShopAnswer {
  const rows = slowStock(inventory, args, now);
  const base = {
    title: "Slow stock",
    href: "/admin/reports?section=inventory",
    hrefLabel: "Open Inventory",
    asOf: now.toISOString(),
  };
  const rule = `in stock ${args.olderThanDays} days or more, priced ${formatMoney(args.minPrice)} or more, with no sale in the last ${args.olderThanDays} days`;
  if (!rows.length) return { ...base, lines: [`Nothing has sat that long: no cards ${rule}.`] };

  const shown = rows.slice(0, args.limit);
  const copies = rows.reduce((sum, row) => sum + row.quantity, 0);
  const value = Math.round(rows.reduce((sum, row) => sum + row.value, 0) * 100) / 100;
  return {
    ...base,
    lines: [
      `${plural(rows.length, "listing", "listings")} (${plural(copies, "copy", "copies")}, ${formatMoney(value)} at shelf price) ${rows.length === 1 ? "has" : "have"} sat: ${rule}.`,
    ],
    columns: ["Card", "Set · condition", "Qty", "Price", "Market", "Days in stock", "Shelf"],
    rows: shown.map(({ item, name, quantity, price, days }) => [
      name,
      [item.setName?.trim(), shelfConditionShort(shelfConditionLabel(item))].filter(Boolean).join(" · "),
      String(quantity),
      formatMoney(price),
      formatMoney(item.tcgMarketPrice ?? item.marketPrice ?? null),
      String(days),
      item.shelfLocation?.trim() ? shelfName(item.shelfLocation.trim()) : "No location",
    ]),
    note:
      (rows.length > shown.length ? `Showing the ${shown.length} with the most money tied up, of ${rows.length}. ` : "") +
      "Days in stock counts from a listing's first copy, so copies added later look as old as the first; " +
      "a listing imported without a date counts from its import, so it can be older than shown. " +
      "This is a list to review. It does not suggest prices.",
  };
}
