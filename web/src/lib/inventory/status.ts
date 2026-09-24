import type { InventoryItem } from "../types";

export function isTcgplayerImportItem(item: InventoryItem): boolean {
  return item.source === "tcgplayer_import" || Boolean(item.tcgplayerListingKey);
}

export function isShopifyImportItem(item: InventoryItem): boolean {
  return item.source === "shopify_import" || Boolean(item.shopifyVariantKey);
}

export function isManualInventoryItem(item: InventoryItem): boolean {
  return item.source === "manual";
}

/**
 * Quantity-tracked catalog stock, as opposed to a legacy one-off buyback
 * single. This gates the deck builder, storefront browsing, image and price
 * backfills, and Shopify export, so clerk-entered rows belong here too.
 */
export function isCatalogImportItem(item: InventoryItem): boolean {
  return (
    isTcgplayerImportItem(item) ||
    isShopifyImportItem(item) ||
    isManualInventoryItem(item)
  );
}

export function isBuybackInventoryItem(item: InventoryItem): boolean {
  return !isCatalogImportItem(item);
}

/**
 * Compute sellable units from component fields.
 * Application holds (quantityReserved, quantityCommitted, quantityDamaged) reduce availability.
 * tcgplayerReportedReserve is NOT subtracted — it is a TCGplayer CSV reporting field only.
 */
export function computeQuantityAvailable(item: InventoryItem): number {
  const onHand = Math.max(0, item.quantityOnHand ?? item.quantity ?? 0);
  const reserved = Math.max(0, item.quantityReserved ?? 0);
  const committed = Math.max(0, item.quantityCommitted ?? 0);
  const damaged = Math.max(0, item.quantityDamaged ?? 0);
  return Math.max(0, onHand - reserved - committed - damaged);
}

/** Sellable units — derives from components when holds exist, else explicit quantityAvailable. */
export function inventoryQuantityAvailable(item: InventoryItem): number {
  if (
    item.quantityReserved != null ||
    item.quantityCommitted != null ||
    item.quantityDamaged != null
  ) {
    return computeQuantityAvailable(item);
  }
  if (item.quantityAvailable != null) {
    return Math.max(0, item.quantityAvailable);
  }
  return Math.max(0, item.quantityOnHand ?? item.quantity ?? 0);
}

/** Effective units available (buyback singles = 1). */
export function inventoryEffectiveQuantity(item: InventoryItem): number {
  if (inventoryEffectiveStatus(item) === "sold") return 0;
  if (isCatalogImportItem(item)) {
    return inventoryQuantityAvailable(item);
  }
  return 1;
}

/** Effective inventory status — legacy records without status are on hand. */
export function inventoryEffectiveStatus(item: InventoryItem) {
  return item.status ?? "on_hand";
}

export function isInventorySold(item: InventoryItem): boolean {
  return inventoryEffectiveStatus(item) === "sold";
}

export function isInventoryAvailable(item: InventoryItem): boolean {
  if (isInventorySold(item)) return false;
  const status = inventoryEffectiveStatus(item);
  if (status === "withdrawn") return false;
  if (isCatalogImportItem(item)) {
    return inventoryEffectiveQuantity(item) > 0;
  }
  return status === "on_hand" || status === "listed";
}

export function isInventoryListed(item: InventoryItem): boolean {
  return inventoryEffectiveStatus(item) === "listed" || Boolean(item.shopifyListing);
}
