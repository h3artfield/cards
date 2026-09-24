import { inventoryTcgLowUnitPrice } from "./tcg-low-price";
import { inventoryEffectiveQuantity } from "./status";
import {
  isFirebaseStorageUrl,
  isTcgplayerCdnUrl,
} from "./image-url";
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

export const PRICE_TIER_ORDER = [
  "Under $10",
  "$10 – $50",
  "$50 – $100",
  "$100 – $500",
  "$500+",
] as const;

const PRICE_TIER_COLORS: Record<string, string> = {
  "Under $10": "#10b981",
  "$10 – $50": "#0ea5e9",
  "$50 – $100": "#6366f1",
  "$100 – $500": "#f59e0b",
  "$500+": "#ef4444",
};

export function priceTierColor(label: string): string {
  return PRICE_TIER_COLORS[label] ?? "#94a3b8";
}

function unitValue(item: InventoryItem): number {
  return item.listPrice ?? item.marketPrice ?? item.tcgMarketPrice ?? 0;
}

export function classifyInventoryPriceTier(item: InventoryItem): string {
  const price = unitValue(item);
  if (price < 10) return "Under $10";
  if (price < 50) return "$10 – $50";
  if (price < 100) return "$50 – $100";
  if (price < 500) return "$100 – $500";
  return "$500+";
}

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
