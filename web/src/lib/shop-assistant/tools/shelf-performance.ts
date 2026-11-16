import {
  computeInventoryAnalytics,
  sellThrough,
  type LocationStats,
} from "../../inventory/analytics";
import {
  isCatalogImportItem,
  isInventoryAvailable,
  isInventorySold,
} from "../../inventory/status";
import type { InventoryItem } from "../../types";
import { formatPercent, plural, shelfName } from "../format";
import type { ShopAnswer, ShopToolArgs } from "../types";

/** Ties can push the list past `limit`; never past this. */
export const SHELF_PERFORMANCE_MAX_ROWS = 10;

export type RankedShelf = LocationStats & {
  /** Sold ÷ (sold + still in stock) over the last 30 days. */
  share: number;
};

export type ShelfRanking = {
  /** Every stocked or recently-sold shelf of the asked kind, best match first. */
  ranked: RankedShelf[];
  /** The rows to show: `limit`, plus any shelves tied with the last one. */
  shown: RankedShelf[];
};

/**
 * Rank cases and binders by the Inventory report's own sell-through, computed
 * from the same input the report uses (see the analytics route). Shelves that
 * hold nothing and sold nothing are left out.
 */
export function rankShelves(
  inventory: InventoryItem[],
  args: ShopToolArgs["shelf_performance"],
  now: Date,
): ShelfRanking {
  const catalog = inventory.filter(isCatalogImportItem);
  const analytics = computeInventoryAnalytics(catalog.filter(isInventoryAvailable), {
    soldItems: catalog.filter(isInventorySold),
    now: now.getTime(),
  });

  const ranked: RankedShelf[] = [];
  for (const location of analytics.locations) {
    if (args.kind !== "any" && location.kind !== args.kind) continue;
    const share = sellThrough(location);
    if (share == null) continue;
    ranked.push({ ...location, share });
  }

  ranked.sort((a, b) =>
    args.rank === "slowest"
      ? a.share - b.share || b.units - a.units || a.location.localeCompare(b.location)
      : b.share - a.share || b.sold30 - a.sold30 || a.location.localeCompare(b.location),
  );

  const shown = ranked.slice(0, args.limit);
  const last = shown[shown.length - 1];
  if (last) {
    for (const next of ranked.slice(shown.length)) {
      if (next.share !== last.share || shown.length >= SHELF_PERFORMANCE_MAX_ROWS) break;
      shown.push(next);
    }
  }
  return { ranked, shown };
}

function kindWords(kind: ShopToolArgs["shelf_performance"]["kind"]): { one: string; many: string } {
  if (kind === "case") return { one: "case shelf", many: "case shelves" };
  if (kind === "binder") return { one: "binder", many: "binders" };
  return { one: "shelf", many: "shelves" };
}

/** "Which case or binder is slowest / fastest?" */
export function shelfPerformanceAnswer(
  inventory: InventoryItem[],
  args: ShopToolArgs["shelf_performance"],
  now: Date,
): ShopAnswer {
  const { ranked, shown } = rankShelves(inventory, args, now);
  const words = kindWords(args.kind);
  const base = {
    title: `${args.rank === "slowest" ? "Slowest" : "Fastest"} ${words.many}`,
    href: "/admin/reports?section=inventory",
    hrefLabel: "Open Inventory report",
    asOf: now.toISOString(),
  };
  const note =
    "Ranked by the share of cards sold in the last 30 days: sold ÷ (sold + still in stock), " +
    "the Inventory report's sell-through. Empty shelves are left out.";

  const top = shown[0];
  if (!top) {
    return { ...base, lines: [`No stocked ${words.many} to rank yet.`], note };
  }

  const lines: string[] = [];
  const tiedAtTop = ranked.filter((row) => row.share === top.share);
  if (args.rank === "slowest" && top.sold30 === 0) {
    lines.push(
      tiedAtTop.length === 1
        ? `${shelfName(top.location)} sold nothing in the last 30 days.`
        : `${plural(tiedAtTop.length, words.one, words.many)} sold nothing in the last 30 days.`,
    );
  } else if (tiedAtTop.length > 1) {
    lines.push(
      `${plural(tiedAtTop.length, words.one, words.many)} tied at ${formatPercent(top.share)} ` +
        `sold in the last 30 days.`,
    );
  } else {
    lines.push(
      `${shelfName(top.location)}: ${formatPercent(top.share)} sold in the last 30 days ` +
        `(${top.sold30} of ${top.sold30 + top.units}).`,
    );
  }

  return {
    ...base,
    lines,
    columns: ["Shelf", "In stock", "Sold 30d", "Sell-through"],
    rows: shown.map((row) => [
      shelfName(row.location),
      row.units.toLocaleString("en-US"),
      String(row.sold30),
      formatPercent(row.share),
    ]),
    note,
  };
}
