import { isShopifyImportItem } from "../inventory/status";
import type { InventoryItem } from "../types";
import {
  buildShopifyImportPreview,
  inventoryItemFromShopifyVariant,
  mergeShopifyIntoInventoryItem,
} from "./import-preview";
import type { ShopifyCatalogVariant, ShopifyImportApplyResult } from "./types";

export { buildShopifyImportPreview } from "./import-preview";

export function applyShopifyInventoryImport(input: {
  variants: ShopifyCatalogVariant[];
  storeId: string;
  shopDomain: string;
  existingInventory: InventoryItem[];
  skipConflicts?: boolean;
}): ShopifyImportApplyResult {
  const preview = buildShopifyImportPreview({
    variants: input.variants,
    existingInventory: input.existingInventory,
    shopDomain: input.shopDomain,
  });
  const now = new Date().toISOString();
  const byId = new Map(input.existingInventory.map((i) => [i.id, i]));
  const saved: InventoryItem[] = [];
  let created = 0;
  let updated = 0;
  let withdrawn = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const row of preview.rows) {
    if (row.action === "unchanged") {
      skipped += 1;
      continue;
    }
    if (row.action === "conflict") {
      conflicts += 1;
      if (input.skipConflicts) continue;
      continue;
    }

    if (row.action === "create") {
      const item = inventoryItemFromShopifyVariant({
        variant: row.variant,
        storeId: input.storeId,
        shopDomain: input.shopDomain,
        now,
      });
      saved.push(item);
      byId.set(item.id, item);
      created += 1;
      continue;
    }

    const existing = row.inventoryItemId
      ? byId.get(row.inventoryItemId)
      : undefined;
    if (!existing) {
      skipped += 1;
      continue;
    }

    const next = mergeShopifyIntoInventoryItem({
      existing,
      variant: row.variant,
      shopDomain: input.shopDomain,
      now,
    });
    saved.push(next);
    byId.set(next.id, next);
    updated += 1;
  }

  for (const missing of preview.missingFromShopify) {
    if (missing.action === "conflict") {
      conflicts += 1;
      if (input.skipConflicts) continue;
      continue;
    }
    const existing = byId.get(missing.inventoryItemId);
    if (!existing || !isShopifyImportItem(existing) || existing.status === "sold") {
      continue;
    }
    const next: InventoryItem = {
      ...existing,
      quantity: 0,
      status: "withdrawn",
      lastShopifyImportAt: now,
    };
    saved.push(next);
    byId.set(next.id, next);
    withdrawn += 1;
  }

  return {
    created,
    updated,
    withdrawn,
    skipped,
    conflicts,
    items: saved,
  };
}
