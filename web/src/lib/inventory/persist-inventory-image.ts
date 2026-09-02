import { classifyInventoryGame } from "./analytics";
import { cacheInventoryImageFromBuffer } from "../storage/inventory-image";
import { dataStore } from "../storage/data-store";
import { isFirebaseStorageUrl } from "./image-url";
import type { ImageResolveSource } from "./resolve-display-image";
import type { InventoryItem } from "../types";

/** Save a proxy-resolved image to Firebase Storage and update the inventory row. */
export async function persistResolvedInventoryImage(input: {
  item: InventoryItem;
  buffer: Buffer;
  contentType: string;
  source: ImageResolveSource;
  tcgLowPrice?: number;
}): Promise<void> {
  if (input.source === "firebase") return;
  const game = classifyInventoryGame(input.item);
  if (isFirebaseStorageUrl(input.item.frontImageUrl) && game !== "Magic") return;

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
      imageCacheFailedAt: undefined,
      ...(input.tcgLowPrice != null && input.tcgLowPrice > 0
        ? { tcgLowPrice: input.tcgLowPrice, tcgLowPriceAt: now }
        : {}),
    });
  } catch {
    /* non-fatal — proxy still served the image */
  }
}
