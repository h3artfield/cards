import type { InventoryItem } from "../types";

/** True when row is Magic singles (category or TCGplayer product line). */
export function isMagicInventoryItem(item: InventoryItem): boolean {
  if (item.category === "magic") return true;
  const line = (item.productLine ?? "").toLowerCase();
  return line.includes("magic") || line.includes("mtg");
}

const NON_CARD_HINTS = [
  "deck box",
  "deckbox",
  "sleeve",
  "supplies",
  "supply",
  "playmat",
  "binder",
  "portfolio",
  "dice",
  "life counter",
  "booster box",
  "bundle",
  "commander deck",
  "preconstructed",
  "precon",
  "fat pack",
  "gift box",
  "deck display",
  "storage",
  "toploader",
  "deck case",
];

/** Magic inventory that should map to a Scryfall card (not accessories/sealed). */
export function isEnrichableMagicSingle(item: InventoryItem): boolean {
  if (!isMagicInventoryItem(item)) return false;

  const line = (item.productLine ?? "").toLowerCase();
  const name = `${item.productName ?? ""} ${item.displayName ?? ""}`.toLowerCase();
  const blob = `${line} ${name}`;

  if (NON_CARD_HINTS.some((hint) => blob.includes(hint))) return false;
  if (line.includes("sealed") || line.includes("unopened")) return false;

  /** Singles exports include a collector number; sealed/accessories usually do not. */
  if (!item.cardNumber?.trim()) return false;

  return true;
}

export function isInventoryCatalogEnriched(item: InventoryItem): boolean {
  return Boolean(item.catalogSyncedAt);
}

export function isInventoryCatalogLinked(item: InventoryItem): boolean {
  return Boolean(item.catalogSyncedAt && item.catalogScryfallId);
}

export function isInventoryCatalogSkipped(item: InventoryItem): boolean {
  return item.catalogMatchMethod === "skipped" && Boolean(item.catalogSyncedAt);
}

export function isInventoryCatalogUnresolved(item: InventoryItem): boolean {
  return item.catalogMatchMethod === "unresolved" && Boolean(item.catalogSyncedAt);
}

/** Linked rows missing expanded golden-table fields (oracle text, tags, etc.). */
export function needsGoldenTableBackfill(item: InventoryItem): boolean {
  if (!item.catalogScryfallId || !item.catalogSyncedAt) return false;
  // Keywords array is always set (possibly empty) once golden-table enrichment ran.
  return item.catalogKeywords == null;
}

export function markInventoryCatalogSkipped(item: InventoryItem): InventoryItem {
  return {
    ...item,
    catalogSyncedAt: new Date().toISOString(),
    catalogMatchMethod: "skipped",
  };
}

export function markInventoryCatalogUnresolved(item: InventoryItem): InventoryItem {
  return {
    ...item,
    catalogSyncedAt: new Date().toISOString(),
    catalogMatchMethod: "unresolved",
  };
}
