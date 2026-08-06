import { fetchTcgplayerProductDetails } from "../card-flow-v2/tcgplayer-japan-catalog";
import { fetchTcgplayerLowestListingPrice } from "../card-flow-v2/market/tcgplayer-condition-lows";
import type { ConditionEstimate, InventoryItem } from "../types";

/** Map TCGplayer CSV / listing condition strings to offer grades. */
export function tcgplayerConditionToGrade(
  condition?: string,
): ConditionEstimate {
  const c = (condition ?? "").trim().toLowerCase();
  if (c.includes("lightly")) return "LP";
  if (c.includes("moderately")) return "MP";
  if (c.includes("heavily")) return "HP";
  if (c.includes("damaged")) return "DMG";
  return "NM";
}

/** Per-unit TCG low for dashboard totals — stored low, else market/list fallbacks. */
export function inventoryTcgLowUnitPrice(item: InventoryItem): number {
  if (item.tcgLowPrice != null && item.tcgLowPrice > 0) {
    return item.tcgLowPrice;
  }
  return item.tcgMarketPrice ?? item.marketPrice ?? item.listPrice ?? 0;
}

export function inventoryItemNeedsTcgLowPrice(item: InventoryItem): boolean {
  if (!item.tcgplayerProductId) return false;
  if (item.tcgLowPrice != null && item.tcgLowPrice > 0) return false;
  return true;
}

/** Fetch lowest listing for the item's condition; fall back to product-level low. */
export async function fetchTcgLowPriceForInventoryItem(
  item: InventoryItem,
): Promise<number | undefined> {
  if (!item.tcgplayerProductId) return undefined;

  const grade = tcgplayerConditionToGrade(item.tcgplayerCondition);
  const listingLow = await fetchTcgplayerLowestListingPrice({
    productId: item.tcgplayerProductId,
    condition: grade,
  });
  if (listingLow != null && listingLow > 0) return listingLow;

  const details = await fetchTcgplayerProductDetails(item.tcgplayerProductId);
  const productLow = details?.lowestPrice ?? details?.marketPrice;
  return productLow != null && productLow > 0 ? productLow : undefined;
}

export async function backfillInventoryTcgLowPricesBatch(input: {
  items: InventoryItem[];
  limit: number;
}): Promise<{
  processed: number;
  updated: number;
  remaining: number;
  updatedItems: InventoryItem[];
}> {
  const candidates = input.items.filter(inventoryItemNeedsTcgLowPrice);
  const batch = candidates.slice(0, Math.max(1, input.limit));
  const now = new Date().toISOString();
  const updatedItems: InventoryItem[] = [];

  for (const item of batch) {
    try {
      const price = await fetchTcgLowPriceForInventoryItem(item);
      if (price != null && price > 0) {
        updatedItems.push({
          ...item,
          tcgLowPrice: price,
          tcgLowPriceAt: now,
        });
      }
    } catch {
      /* skip — retry on next batch */
    }
  }

  const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
  const remaining = input.items.filter((item) => {
    const current = updatedById.get(item.id) ?? item;
    return inventoryItemNeedsTcgLowPrice(current);
  }).length;

  return {
    processed: batch.length,
    updated: updatedItems.length,
    remaining,
    updatedItems,
  };
}
