import { placementKind } from "../../inventory/analytics";
import { sellPrice } from "../../inventory/sell-price";
import { shelfConditionLabel, shelfConditionShort, shelfCustomerName } from "../../inventory/shelf-row-edit";
import { inventoryEffectiveQuantity, isCatalogImportItem } from "../../inventory/status";
import type { InventoryItem } from "../../types";
import { formatMoney, plural, shelfName } from "../format";
import type { ShopAnswer, ShopToolArgs } from "../types";

export type ValuableStockRow = {
  item: InventoryItem;
  name: string;
  quantity: number;
  /** What the register charges for one copy. */
  price: number;
  /** Price times copies on hand. */
  value: number;
};

/**
 * The store's most valuable cards in stock, by the register's own price:
 * either the dearest single cards, or the listings with the most money in
 * them (price times copies).
 */
export function valuableStock(inventory: InventoryItem[], args: ShopToolArgs["valuable_stock"]): ValuableStockRow[] {
  const rows: ValuableStockRow[] = [];
  for (const item of inventory) {
    if (!isCatalogImportItem(item)) continue;
    const quantity = inventoryEffectiveQuantity(item);
    if (quantity <= 0) continue;
    if (args.kind !== "any" && placementKind(item.shelfLocation) !== args.kind) continue;
    const price = sellPrice(item);
    if (price <= 0) continue;
    rows.push({ item, name: shelfCustomerName(item), quantity, price, value: Math.round(price * quantity * 100) / 100 });
  }
  return rows.sort((a, b) =>
    args.by === "value"
      ? b.value - a.value || b.price - a.price || a.name.localeCompare(b.name) || a.item.id.localeCompare(b.item.id)
      : b.price - a.price || b.value - a.value || a.name.localeCompare(b.name) || a.item.id.localeCompare(b.item.id),
  );
}

/** "What are our most valuable cards?" */
export function valuableStockAnswer(inventory: InventoryItem[], args: ShopToolArgs["valuable_stock"], now: Date): ShopAnswer {
  const rows = valuableStock(inventory, args);
  const where = args.kind === "case" ? " in the cases" : args.kind === "binder" ? " in the binders" : "";
  const base = {
    title: args.by === "value" ? `Most money in stock${where}` : `Highest-priced cards in stock${where}`,
    href: "/admin/reports?section=inventory",
    hrefLabel: "Open Inventory",
    asOf: now.toISOString(),
  };
  if (!rows.length) return { ...base, lines: [`No priced cards in stock${where}.`] };

  const shown = rows.slice(0, args.limit);
  const top = shown[0]!;
  const copies = rows.reduce((sum, row) => sum + row.quantity, 0);
  const total = Math.round(rows.reduce((sum, row) => sum + row.value, 0) * 100) / 100;
  return {
    ...base,
    lines: [
      args.by === "value"
        ? `Most money in one listing: ${top.name}, ${formatMoney(top.value)} (${plural(top.quantity, "copy", "copies")} at ${formatMoney(top.price)}).`
        : `Highest price: ${top.name}, ${formatMoney(top.price)}.`,
      `All priced stock${where}: ${plural(rows.length, "listing", "listings")}, ${plural(copies, "copy", "copies")}, ${formatMoney(total)} at shelf price.`,
    ],
    columns: ["Card", "Set · condition", "Qty", "Price", "Market", "Value", "Shelf"],
    rows: shown.map(({ item, name, quantity, price, value }) => [
      name,
      [item.setName?.trim(), shelfConditionShort(shelfConditionLabel(item))].filter(Boolean).join(" · "),
      String(quantity),
      formatMoney(price),
      formatMoney(item.tcgMarketPrice ?? item.marketPrice ?? null),
      formatMoney(value),
      item.shelfLocation?.trim() ? shelfName(item.shelfLocation.trim()) : "No location",
    ]),
    note:
      `Price is what the register charges for one copy. Value is price times copies on hand. ` +
      `Market is the nightly market price. Each printing and condition is its own line.` +
      (rows.length > shown.length ? ` Showing the top ${shown.length} of ${rows.length}.` : ""),
  };
}
