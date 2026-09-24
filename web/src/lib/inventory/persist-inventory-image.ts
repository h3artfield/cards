import { cacheInventoryImageFromBuffer } from "../storage/inventory-image";
import { dataStore } from "../storage/data-store";
import { inventoryImageCacheVersionForItem } from "./image-cache-trust";
import type { ImageResolveSource } from "./resolve-display-image";
import type { InventoryItem } from "../types";

/**
 * Record that no source could produce art for this row. Sealed product rows have
 * no reachable image anywhere — TCGplayer's CDN refuses datacenter IPs and the
 * game catalogs only carry singles — so without this marker every request walks
 * the entire source chain again and pins a request slot for minutes.
 */
export async function markInventoryImageUnavailable(
  item: InventoryItem,
): Promise<void> {
  await dataStore.saveInventoryItem({
    ...item,
    imageCacheFailedAt: new Date().toISOString(),
  });
}

/** Save a proxy-resolved image to Firebase Storage and update the inventory row. */
export async function persistResolvedInventoryImage(input: {
  item: InventoryItem;
  buffer: Buffer;
  contentType: string;
  source: ImageResolveSource;
  tcgLowPrice?: number;
}): Promise<void> {
  if (input.source === "firebase") return;

  const now = new Date().toISOString();
  try {
    const storedUrl = await cacheInventoryImageFromBuffer({
      storeId: input.item.storeId,
      inventoryItemId: input.item.id,
      buffer: input.buffer,
      contentType: input.contentType,
    });
    await dataStore.saveInventoryItem({
      ...input.item,
      frontImageUrl: storedUrl,
      imageCachedAt: now,
      imageCacheVersion: inventoryImageCacheVersionForItem(input.item),
      imageCacheFailedAt: undefined,
      ...(input.tcgLowPrice != null && input.tcgLowPrice > 0
        ? { tcgLowPrice: input.tcgLowPrice, tcgLowPriceAt: now }
        : {}),
    });
  } catch {
    /* non-fatal — proxy still served the image */
  }
}
