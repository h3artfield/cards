import type { InventoryItem } from "../types";

/**
 * What the register charges for one copy: the store's own price, else the
 * Shopify export price, else market. 0 when the row has no price at all.
 */
export function sellPrice(
  item: Pick<InventoryItem, "listPrice" | "shopifyListing" | "tcgMarketPrice" | "marketPrice">,
): number {
  return (
    item.listPrice ??
    item.shopifyListing?.exportPrice ??
    item.tcgMarketPrice ??
    item.marketPrice ??
    0
  );
}
