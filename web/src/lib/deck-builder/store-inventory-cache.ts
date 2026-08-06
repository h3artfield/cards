import { dataStore } from "../storage/data-store";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "../inventory/status";
import type { InventoryItem } from "../types";

const TTL_MS = Number(process.env.STORE_INVENTORY_CACHE_TTL_MS ?? 90_000);

type CacheEntry = {
  items: InventoryItem[];
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<InventoryItem[]>>();

function filterBrowseable(items: InventoryItem[]): InventoryItem[] {
  return items.filter(
    (i) =>
      isCatalogImportItem(i) &&
      isInventoryAvailable(i) &&
      inventoryEffectiveQuantity(i) > 0,
  );
}

/** In-memory store inventory — avoids repeated full Firestore reads per request. */
export async function getCachedStoreInventory(
  storeId: string,
): Promise<InventoryItem[]> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
    return hit.items;
  }

  let pending = inflight.get(storeId);
  if (!pending) {
    pending = dataStore.getInventory(storeId).then((raw) => {
      const items = filterBrowseable(raw);
      cache.set(storeId, { items, fetchedAt: Date.now() });
      inflight.delete(storeId);
      return items;
    });
    inflight.set(storeId, pending);
  }

  return pending;
}

export function invalidateStoreInventoryCache(storeId?: string): void {
  if (storeId) {
    cache.delete(storeId);
    inflight.delete(storeId);
    return;
  }
  cache.clear();
  inflight.clear();
}
