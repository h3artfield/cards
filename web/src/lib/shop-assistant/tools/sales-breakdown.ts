import { placementKind } from "../../inventory/analytics";
import { inventoryEffectiveQuantity } from "../../inventory/status";
import { buildDailySales, storeDay, type DailySaleLine } from "../../reports/daily-reports";
import type { InventoryItem } from "../../types";
import { formatMoney, formatPercent, plural, shelfName } from "../format";
import { periodWords, resolvePeriod } from "../period";
import type { ShopAnswer, ShopPeriodArgs, ShopToolArgs } from "../types";

/**
 * Sales over a period, broken down by card and by shelf. Both are sums of the
 * Daily report's own sale lines, so their totals equal `sales_summary` for
 * the same days.
 */

export const SALES_BY_SHELF_MAX_ROWS = 30;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PeriodSales =
  | { ok: false; message: string }
  | { ok: true; from: string; to: string; label: string; words: string; lines: DailySaleLine[]; units: number; revenue: number };

/** Every sale line in the period, with the period's totals. */
export function salesInPeriod(inventory: InventoryItem[], args: ShopPeriodArgs, now: Date): PeriodSales {
  const period = resolvePeriod(args, storeDay(now));
  if (!period.ok) return period;
  const days = buildDailySales(inventory).filter((d) => d.date >= period.from && d.date <= period.to);
  const lines = days.flatMap((d) => d.sales.lines);
  return {
    ok: true,
    from: period.from,
    to: period.to,
    label: period.label,
    words: periodWords(args, period),
    lines,
    units: lines.reduce((sum, line) => sum + line.quantity, 0),
    revenue: round2(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)),
  };
}

export type TopSeller = {
  inventoryItemId: string;
  name: string;
  setName: string;
  condition: string;
  units: number;
  revenue: number;
  /** Sellable copies on hand now. Null when the row is no longer in inventory. */
  inStock: number | null;
};

/** Sales grouped by inventory row, so each printing and condition stands alone. */
export function topSellers(
  inventory: InventoryItem[],
  lines: DailySaleLine[],
  by: "units" | "revenue",
): TopSeller[] {
  const byId = new Map(inventory.map((item) => [item.id, item]));
  const groups = new Map<string, TopSeller>();
  for (const line of lines) {
    let group = groups.get(line.inventoryItemId);
    if (!group) {
      const item = byId.get(line.inventoryItemId);
      group = {
        inventoryItemId: line.inventoryItemId,
        name: line.name,
        setName: line.setName,
        condition: line.condition,
        units: 0,
        revenue: 0,
        inStock: item ? inventoryEffectiveQuantity(item) : null,
      };
      groups.set(line.inventoryItemId, group);
    }
    group.units += line.quantity;
    group.revenue += line.quantity * line.unitPrice;
  }
  const rows = [...groups.values()].map((g) => ({ ...g, revenue: round2(g.revenue) }));
  rows.sort((a, b) =>
    by === "units"
      ? b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name) || a.inventoryItemId.localeCompare(b.inventoryItemId)
      : b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name) || a.inventoryItemId.localeCompare(b.inventoryItemId),
  );
  return rows;
}

/** "What sold best last week?" */
export function topSellersAnswer(inventory: InventoryItem[], args: ShopToolArgs["top_sellers"], now: Date): ShopAnswer {
  const sales = salesInPeriod(inventory, args, now);
  const base = {
    title: "Top sellers",
    href: "/admin/reports?section=daily",
    hrefLabel: "Open Daily report",
    asOf: now.toISOString(),
  };
  if (!sales.ok) return { ...base, lines: [sales.message] };
  const titled = { ...base, title: `Top sellers: ${sales.label}`, href: `/admin/reports?section=daily&day=${sales.to}` };
  if (!sales.lines.length) return { ...titled, lines: [`No sales ${sales.from === sales.to ? "on" : "from"} ${sales.label}.`] };

  const ranked = topSellers(inventory, sales.lines, args.by);
  const shown = ranked.slice(0, args.limit);
  const top = shown[0]!;
  return {
    ...titled,
    lines: [
      `${sales.label}: ${plural(sales.units, "card", "cards")} sold for ${formatMoney(sales.revenue)}, across ${plural(ranked.length, "listing", "listings")}.`,
      args.by === "units"
        ? `Most copies sold: ${top.name}, ${top.units}.`
        : `Most money in: ${top.name}, ${formatMoney(top.revenue)}.`,
    ],
    columns: ["Card", "Set · condition", "Sold", "Sales", "In stock now"],
    rows: shown.map((row) => [
      row.name,
      [row.setName, row.condition].filter(Boolean).join(" · "),
      String(row.units),
      formatMoney(row.revenue),
      row.inStock == null ? "—" : String(row.inStock),
    ]),
    note:
      `Ranked by ${args.by === "units" ? "copies sold" : "sales"}. Each printing and condition is its own line. ` +
      `In stock now is today's count, not the count on those days.` +
      (ranked.length > shown.length ? ` Showing the top ${shown.length} of ${ranked.length}.` : ""),
  };
}

export type ShelfSales = { location: string; units: number; revenue: number; share: number };

/** Sales grouped by where each card sits now. Cards with no shelf share one row. */
export function salesByShelf(lines: DailySaleLine[], kind: "case" | "binder" | "any"): ShelfSales[] {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const groups = new Map<string, { location: string; units: number; revenue: number }>();
  for (const line of lines) {
    const location = line.location.trim();
    if (kind !== "any" && placementKind(location) !== kind) continue;
    let group = groups.get(location);
    if (!group) {
      group = { location, units: 0, revenue: 0 };
      groups.set(location, group);
    }
    group.units += line.quantity;
    group.revenue += line.quantity * line.unitPrice;
  }
  return [...groups.values()]
    .map((g) => ({ ...g, revenue: round2(g.revenue), share: total ? g.revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.location.localeCompare(b.location));
}

/** "Which shelves did last week's sales come from?" */
export function salesByShelfAnswer(inventory: InventoryItem[], args: ShopToolArgs["sales_by_shelf"], now: Date): ShopAnswer {
  const sales = salesInPeriod(inventory, args, now);
  const base = {
    title: "Sales by shelf",
    href: "/admin/reports?section=inventory",
    hrefLabel: "Open Inventory report",
    asOf: now.toISOString(),
  };
  if (!sales.ok) return { ...base, lines: [sales.message] };
  const titled = { ...base, title: `Sales by shelf: ${sales.label}` };
  const kindWords = args.kind === "case" ? "case shelves" : args.kind === "binder" ? "binders" : "shelves";
  const ranked = salesByShelf(sales.lines, args.kind);
  if (!ranked.length) {
    return {
      ...titled,
      lines: [
        sales.lines.length
          ? `No sales from ${kindWords} ${sales.from === sales.to ? "on" : "from"} ${sales.label}.`
          : `No sales ${sales.from === sales.to ? "on" : "from"} ${sales.label}.`,
      ],
    };
  }
  const shown = ranked.slice(0, SALES_BY_SHELF_MAX_ROWS);
  const top = ranked[0]!;
  return {
    ...titled,
    lines: [
      `${sales.label}: ${plural(sales.units, "card", "cards")} sold for ${formatMoney(sales.revenue)}.`,
      `Most came from ${top.location ? shelfName(top.location) : "cards with no location"}: ${formatMoney(top.revenue)}, ${formatPercent(top.share)} of sales.`,
    ],
    columns: ["Shelf", "Sold", "Sales", "Share of sales"],
    rows: shown.map((row) => [
      row.location ? shelfName(row.location) : "No location",
      String(row.units),
      formatMoney(row.revenue),
      formatPercent(row.share),
    ]),
    note:
      "By each card's current shelf: a card moved after it sold counts for where it sits now. " +
      "Share is of all sales in the period." +
      (args.kind !== "any" ? ` Only ${kindWords} are listed.` : ""),
  };
}
