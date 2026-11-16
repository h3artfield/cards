import { inventoryTcgLowUnitPrice } from "./tcg-low-price";
import { inventoryEffectiveQuantity } from "./status";
import {
  isFirebaseStorageUrl,
  isTcgplayerCdnUrl,
} from "./image-url";
import { salesSince } from "./sale-log";
import { CABINET_MIN_V1, SHELF_BINDERS_V1, SHELF_CABINETS_V1 } from "./shelf-location";
import type { InventoryItem } from "../types";

export interface InventorySlice {
  label: string;
  units: number;
  rows: number;
  value: number;
  pct: number;
  valuePct: number;
}

export interface InventoryAnalytics {
  totalUnits: number;
  totalRows: number;
  inStockRows: number;
  catalogRows: number;
  totalListValue: number;
  totalMarketValue: number;
  /** Sum of qty × TCG lowest listing (stored or market fallback). */
  totalTcgLowValue: number;
  tcgLowPricedRows: number;
  listedShopifyRows: number;
  listedEbayRows: number;
  imagesCachedRows: number;
  imagesPendingRows: number;
  byGame: InventorySlice[];
  byFormat: InventorySlice[];
  byPriceTier: InventorySlice[];
  byPlacement: InventorySlice[];
  /** Every cabinet shelf and binder, including empty ones, in shop order. */
  locations: LocationStats[];
  needsMoveRows: number;
  bulkUnits: number;
  noLocationRows: number;
  sold30Units: number;
  sold30Revenue: number;
  salesByTier: SalesByTier[];
  aging: AgingBucket[];
}

const GAME_COLORS: Record<string, string> = {
  Pokémon: "#f59e0b",
  Magic: "#6366f1",
  "Yu-Gi-Oh!": "#7c3aed",
  Sports: "#059669",
  "Flesh & Blood": "#dc2626",
  Supplies: "#64748b",
  Other: "#94a3b8",
};

const FORMAT_COLORS: Record<string, string> = {
  "Raw singles": "#0ea5e9",
  Graded: "#8b5cf6",
  "Sealed / boxed": "#f97316",
  Supplies: "#64748b",
  Other: "#94a3b8",
};

export function gameColor(label: string): string {
  return GAME_COLORS[label] ?? "#94a3b8";
}

export function formatColor(label: string): string {
  return FORMAT_COLORS[label] ?? "#94a3b8";
}

/** Under $6 is the binder line, so the first tier matches binders vs cases. */
export const PRICE_TIER_ORDER = [
  "Under $6",
  "$6 – $19",
  "$20 – $49",
  "$50 – $99",
  "$100 – $199",
  "$200+",
] as const;

const PRICE_TIER_COLORS: Record<string, string> = {
  "Under $6": "#10b981",
  "$6 – $19": "#0ea5e9",
  "$20 – $49": "#6366f1",
  "$50 – $99": "#a855f7",
  "$100 – $199": "#f59e0b",
  "$200+": "#ef4444",
};

export function priceTierColor(label: string): string {
  return PRICE_TIER_COLORS[label] ?? "#94a3b8";
}

function unitValue(item: InventoryItem): number {
  return item.listPrice ?? item.marketPrice ?? item.tcgMarketPrice ?? 0;
}

/** Tiers use the same TCG market price the shelf-location rules file by. */
export function classifyInventoryPriceTier(item: InventoryItem): string {
  const price = item.tcgMarketPrice ?? unitValue(item);
  if (price < CABINET_MIN_V1) return "Under $6";
  if (price < 20) return "$6 – $19";
  if (price < 50) return "$20 – $49";
  if (price < 100) return "$50 – $99";
  if (price < 200) return "$100 – $199";
  return "$200+";
}

export type PlacementKind = "case" | "binder" | "bulk" | "none";

export const PLACEMENT_LABELS: Record<PlacementKind, string> = {
  case: "Cases",
  binder: "Binders",
  bulk: "Bulk",
  none: "No location",
};

const PLACEMENT_COLORS: Record<string, string> = {
  Cases: "#6366f1",
  Binders: "#0ea5e9",
  Bulk: "#94a3b8",
  "No location": "#ef4444",
};

export function placementColor(label: string): string {
  return PLACEMENT_COLORS[label] ?? "#94a3b8";
}

export function placementKind(location: string | undefined): PlacementKind {
  const loc = location?.trim();
  if (!loc) return "none";
  if (/^\d+-\d+$/.test(loc)) return "case";
  if (/binder/i.test(loc)) return "binder";
  if (/^bulk$/i.test(loc)) return "bulk";
  return "none";
}

export interface LocationStats {
  location: string;
  kind: "case" | "binder";
  units: number;
  rows: number;
  value: number;
  /** Units sold from this spot in the last 30 days. */
  sold30: number;
  needsMove: number;
}

/**
 * Share of a spot's cards sold in the last 30 days: sold ÷ (sold + still in
 * stock), as a fraction. Null for a spot that is empty and sold nothing.
 */
export function sellThrough(stats: Pick<LocationStats, "units" | "sold30">): number | null {
  const total = stats.sold30 + stats.units;
  return total ? stats.sold30 / total : null;
}

export interface SalesByTier {
  label: string;
  sold30: number;
  revenue30: number;
  inStock: number;
}

export interface AgingBucket {
  label: string;
  units: number;
  value: number;
}

const AGING_BUCKETS = [
  { label: "Under 30 days", maxDays: 30 },
  { label: "30–59 days", maxDays: 60 },
  { label: "60–89 days", maxDays: 90 },
  { label: "90+ days", maxDays: Infinity },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function sortPriceTierSlices(slices: InventorySlice[]): InventorySlice[] {
  const order = new Map(PRICE_TIER_ORDER.map((label, idx) => [label, idx]));
  return [...slices].sort(
    (a, b) => (order.get(a.label as (typeof PRICE_TIER_ORDER)[number]) ?? 99) -
      (order.get(b.label as (typeof PRICE_TIER_ORDER)[number]) ?? 99),
  );
}

export function classifyInventoryGame(item: InventoryItem): string {
  const category = (item.category ?? "").trim().toLowerCase();
  if (category === "pokemon") return "Pokémon";
  if (category === "magic") return "Magic";
  if (category === "yugioh") return "Yu-Gi-Oh!";

  const line = `${item.productLine ?? ""} ${item.category ?? ""}`.toLowerCase();
  if (line.includes("pokemon")) return "Pokémon";
  if (line.includes("magic")) return "Magic";
  if (line.includes("yugioh") || line.includes("yu-gi-oh")) return "Yu-Gi-Oh!";
  if (line.includes("sport")) return "Sports";
  if (line.includes("flesh") && line.includes("blood")) return "Flesh & Blood";
  if (line.includes("lorcana")) return "Lorcana";
  if (line.includes("one piece")) return "One Piece";
  if (line.includes("riftbound")) return "Riftbound";
  if (line.includes("star wars")) return "Star Wars";
  if (line.includes("gundam")) return "Gundam";
  if (line.includes("supply") || line.includes("deck box")) return "Supplies";
  return "Other";
}

export function classifyInventoryFormat(item: InventoryItem): string {
  if (item.itemType === "graded" || item.slabCompany) return "Graded";

  const blob = [
    item.tcgplayerCondition,
    item.condition,
    item.productLine,
    item.productName,
    item.title,
    item.displayName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /\b(psa|bgs|cgc|sgc|beckett|graded|gem mint)\b/.test(blob) ||
    /^\d+(\.\d+)?$/.test(String(item.slabGrade ?? "").trim())
  ) {
    return "Graded";
  }

  if (
    item.productLine?.toLowerCase().includes("supply") ||
    item.productLine?.toLowerCase().includes("deck box")
  ) {
    return "Supplies";
  }

  if (
    /\b(unopened|sealed|booster box|booster pack|elite trainer|etb|collection box|bundle|deck box|display box)\b/.test(
      blob,
    )
  ) {
    return "Sealed / boxed";
  }

  if (item.itemType === "raw") return "Raw singles";
  return "Other";
}

function buildSlices(
  items: InventoryItem[],
  classify: (item: InventoryItem) => string,
): InventorySlice[] {
  const buckets = new Map<string, { units: number; rows: number; value: number }>();
  let totalUnits = 0;
  let totalValue = 0;

  for (const item of items) {
    const label = classify(item);
    const qty = inventoryEffectiveQuantity(item);
    const rowCount = 1;
    const value =
      unitValue(item) * (qty > 0 ? qty : 0);
    const entry = buckets.get(label) ?? { units: 0, rows: 0, value: 0 };
    entry.units += qty;
    entry.rows += rowCount;
    entry.value += value;
    buckets.set(label, entry);
    totalUnits += qty;
    totalValue += value;
  }

  const slices = [...buckets.entries()]
    .map(([label, stats]) => ({
      label,
      units: stats.units,
      rows: stats.rows,
      value: stats.value,
      pct: totalUnits > 0 ? (stats.units / totalUnits) * 100 : 0,
      valuePct: totalValue > 0 ? (stats.value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return slices;
}

/** Owner dashboard stats — includes catalog (0 qty) rows. */
export function computeInventoryAnalytics(
  items: InventoryItem[],
  options: { soldItems?: InventoryItem[]; now?: number } = {},
): InventoryAnalytics {
  const totalUnits = items.reduce(
    (s, i) => s + inventoryEffectiveQuantity(i),
    0,
  );
  const inStockRows = items.filter((i) => inventoryEffectiveQuantity(i) > 0).length;
  const catalogRows = items.length - inStockRows;
  const totalListValue = items.reduce(
    (s, i) => s + unitValue(i) * Math.max(inventoryEffectiveQuantity(i), 0),
    0,
  );
  const totalMarketValue = items.reduce(
    (s, i) =>
      s +
      (i.marketPrice ?? i.tcgMarketPrice ?? unitValue(i)) *
        Math.max(inventoryEffectiveQuantity(i), 0),
    0,
  );
  const totalTcgLowValue = items.reduce(
    (s, i) =>
      s +
      inventoryTcgLowUnitPrice(i) * Math.max(inventoryEffectiveQuantity(i), 0),
    0,
  );
  const tcgLowPricedRows = items.filter(
    (i) => i.tcgLowPrice != null && i.tcgLowPrice > 0,
  ).length;

  let listedShopifyRows = 0;
  let listedEbayRows = 0;
  let imagesCachedRows = 0;
  let imagesPendingRows = 0;
  for (const item of items) {
    if (item.shopifyListing) listedShopifyRows += 1;
    if (item.status === "listed" && !item.shopifyListing) {
      /* ebay listing metadata coming */
    }
    if (isFirebaseStorageUrl(item.frontImageUrl)) imagesCachedRows += 1;
    else if (isTcgplayerCdnUrl(item.frontImageUrl)) imagesPendingRows += 1;
  }

  return {
    totalUnits,
    totalRows: items.length,
    inStockRows,
    catalogRows,
    totalListValue,
    totalMarketValue,
    totalTcgLowValue,
    tcgLowPricedRows,
    listedShopifyRows,
    listedEbayRows,
    imagesCachedRows,
    imagesPendingRows,
    byGame: buildSlices(items, classifyInventoryGame),
    byFormat: buildSlices(items, classifyInventoryFormat),
    byPriceTier: sortPriceTierSlices(
      buildSlices(items, classifyInventoryPriceTier),
    ),
    ...computeShelfAnalytics(items, options),
  };
}

function computeShelfAnalytics(
  items: InventoryItem[],
  options: { soldItems?: InventoryItem[]; now?: number },
) {
  const now = options.now ?? Date.now();
  const since30 = now - 30 * DAY_MS;

  const locations = new Map<string, LocationStats>();
  for (const location of SHELF_CABINETS_V1) {
    locations.set(location, { location, kind: "case", units: 0, rows: 0, value: 0, sold30: 0, needsMove: 0 });
  }
  for (const location of SHELF_BINDERS_V1) {
    locations.set(location, { location, kind: "binder", units: 0, rows: 0, value: 0, sold30: 0, needsMove: 0 });
  }
  const spot = (location: string | undefined): LocationStats | null => {
    const kind = placementKind(location);
    if (kind !== "case" && kind !== "binder") return null;
    const key = location!.trim();
    let stats = locations.get(key);
    if (!stats) {
      stats = { location: key, kind, units: 0, rows: 0, value: 0, sold30: 0, needsMove: 0 };
      locations.set(key, stats);
    }
    return stats;
  };

  const tiers = new Map<string, SalesByTier>(
    PRICE_TIER_ORDER.map((label) => [label, { label, sold30: 0, revenue30: 0, inStock: 0 }]),
  );
  const aging: AgingBucket[] = AGING_BUCKETS.map((b) => ({ label: b.label, units: 0, value: 0 }));

  let needsMoveRows = 0;
  let bulkUnits = 0;
  let noLocationRows = 0;
  let sold30Units = 0;
  let sold30Revenue = 0;

  const recordSales = (item: InventoryItem) => {
    const sales = salesSince(item, since30);
    if (!sales.quantity) return;
    sold30Units += sales.quantity;
    sold30Revenue += sales.revenue;
    const tier = tiers.get(classifyInventoryPriceTier(item));
    if (tier) {
      tier.sold30 += sales.quantity;
      tier.revenue30 += sales.revenue;
    }
    const stats = spot(item.shelfLocation);
    if (stats) stats.sold30 += sales.quantity;
  };

  for (const item of items) {
    const qty = Math.max(inventoryEffectiveQuantity(item), 0);
    const value = unitValue(item) * qty;
    recordSales(item);
    if (qty <= 0) continue;

    const kind = placementKind(item.shelfLocation);
    if (kind === "bulk") bulkUnits += qty;
    if (kind === "none") noLocationRows += 1;
    const moving = Boolean(item.suggestedLocation && item.suggestedLocation !== item.shelfLocation);
    if (moving) needsMoveRows += 1;
    const stats = spot(item.shelfLocation);
    if (stats) {
      stats.units += qty;
      stats.rows += 1;
      stats.value += value;
      if (moving) stats.needsMove += 1;
    }

    const tier = tiers.get(classifyInventoryPriceTier(item));
    if (tier) tier.inStock += qty;

    const added = Date.parse(item.ingestedAt ?? item.acquiredAt ?? "");
    if (Number.isFinite(added)) {
      const days = (now - added) / DAY_MS;
      const idx = AGING_BUCKETS.findIndex((b) => days < b.maxDays);
      const bucket = aging[idx < 0 ? aging.length - 1 : idx]!;
      bucket.units += qty;
      bucket.value += value;
    }
  }
  for (const item of options.soldItems ?? []) recordSales(item);

  return {
    byPlacement: buildSlices(
      items.filter((i) => inventoryEffectiveQuantity(i) > 0),
      (i) => PLACEMENT_LABELS[placementKind(i.shelfLocation)],
    ),
    locations: [...locations.values()],
    needsMoveRows,
    bulkUnits,
    noLocationRows,
    sold30Units,
    sold30Revenue,
    salesByTier: [...tiers.values()],
    aging,
  };
}

export function conicGradientFromSlices(
  slices: InventorySlice[],
  colorFor: (label: string) => string,
  metric: "units" | "value" = "units",
): string {
  if (!slices.length) return "#e2e8f0";
  let cursor = 0;
  const parts: string[] = [];
  for (const slice of slices) {
    const pct = metric === "value" ? slice.valuePct : slice.pct;
    if (pct <= 0) continue;
    const start = cursor;
    const end = cursor + pct;
    parts.push(`${colorFor(slice.label)} ${start}% ${end}%`);
    cursor = end;
  }
  return parts.length ? `conic-gradient(${parts.join(", ")})` : "#e2e8f0";
}
