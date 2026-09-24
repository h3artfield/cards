import {
  cacheInventoryImageFromBuffer,
  isFirebaseStorageUrl,
} from "../storage/inventory-image";
import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import { resolveTcgplayerProductImageUrl } from "../tcgplayer-inventory/product-image";
import {
  hasTrustedFirebaseImageCache,
  inventoryImageCacheVersionForItem,
  isPokemonJapanInventoryItem,
  MAGIC_IMAGE_CACHE_VERSION,
  POKEMON_JAPAN_IMAGE_CACHE_VERSION,
} from "./image-cache-trust";
import { isMagicInventoryItem } from "./magic-items";
import { inventoryEffectiveQuantity } from "./status";
import { resolveInventoryImageBuffer } from "./resolve-display-image";
import type { CardCrosswalk, CatalogCard } from "../deck-builder/types";
import type { InventoryItem } from "../types";

function pokemonJapanNeedsRecache(item: InventoryItem): boolean {
  return (
    isPokemonJapanInventoryItem(item) &&
    (item.imageCacheVersion ?? 0) < POKEMON_JAPAN_IMAGE_CACHE_VERSION
  );
}

function magicNeedsRecache(item: InventoryItem): boolean {
  return (
    isMagicInventoryItem(item) &&
    (item.imageCacheVersion ?? 0) < MAGIC_IMAGE_CACHE_VERSION
  );
}

/** Rows that should be resolved to Firebase Storage before customers browse. */
export function inventoryItemNeedsImageCache(item: InventoryItem): boolean {
  if (item.status === "sold") return false;
  if (inventoryEffectiveQuantity(item) <= 0) return false;
  if (hasTrustedFirebaseImageCache(item)) return false;
  if (pokemonJapanNeedsRecache(item)) return true;
  if (magicNeedsRecache(item)) return true;
  if (item.imageCacheFailedAt) return false;
  return true;
}

export function inventoryItemCanRetryImageCache(item: InventoryItem): boolean {
  if (pokemonJapanNeedsRecache(item)) return true;
  if (magicNeedsRecache(item)) return true;
  if (isFirebaseStorageUrl(item.frontImageUrl)) return false;
  return Boolean(item.imageCacheFailedAt);
}

export function resolveInventoryImageSource(item: InventoryItem): string | null {
  if (item.frontImageUrl?.trim()) return item.frontImageUrl.trim();
  if (item.tcgplayerProductId) {
    return resolveTcgplayerProductImageUrl(item.tcgplayerProductId);
  }
  return null;
}

async function catalogForItem(
  item: InventoryItem,
  crosswalkByItemId: Map<string, CardCrosswalk>,
): Promise<CatalogCard | null> {
  const cw = crosswalkByItemId.get(item.id);
  if (!cw?.scryfallId) return null;
  return deckBuilderStore.getCatalogCard(cw.scryfallId);
}

async function cacheOneItem(input: {
  storeId: string;
  item: InventoryItem;
  crosswalkByItemId: Map<string, CardCrosswalk>;
}): Promise<{ item: InventoryItem; ok: boolean }> {
  const { item, storeId, crosswalkByItemId } = input;
  const now = new Date().toISOString();

  try {
    const catalog = await catalogForItem(item, crosswalkByItemId);
    const resolved = await resolveInventoryImageBuffer(item, catalog);
    const storedUrl = await cacheInventoryImageFromBuffer({
      storeId,
      inventoryItemId: item.id,
      buffer: resolved.buffer,
      contentType: resolved.contentType,
    });
    return {
      item: {
        ...item,
        frontImageUrl: storedUrl,
        imageCachedAt: now,
        imageCacheVersion: inventoryImageCacheVersionForItem(item),
        imageCacheFailedAt: undefined,
        ...(resolved.tcgLowPrice != null && resolved.tcgLowPrice > 0
          ? { tcgLowPrice: resolved.tcgLowPrice, tcgLowPriceAt: now }
          : {}),
      },
      ok: true,
    };
  } catch {
    return {
      item: { ...item, imageCacheFailedAt: now },
      ok: false,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Process sequentially — parallel Scryfall calls caused mass 429 failures. */
async function mapSequential<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  gapMs = 50,
): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await fn(item));
    if (gapMs > 0) await sleep(gapMs);
  }
  return results;
}

export async function backfillInventoryImagesBatch(input: {
  storeId: string;
  items: InventoryItem[];
  limit: number;
  crosswalkByItemId?: Map<string, CardCrosswalk>;
}): Promise<{
  processed: number;
  cached: number;
  failed: number;
  remaining: number;
  updatedItems: InventoryItem[];
}> {
  const crosswalkByItemId = input.crosswalkByItemId ?? new Map();
  const candidates = input.items.filter(inventoryItemNeedsImageCache);
  const batch = candidates.slice(0, Math.max(1, input.limit));

  const outcomes = await mapSequential(batch, (item) =>
    cacheOneItem({ storeId: input.storeId, item, crosswalkByItemId }),
  );

  const updatedItems = outcomes.map((o) => o.item);
  const cached = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - cached;

  const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
  const remaining = input.items.filter((item) => {
    const current = updatedById.get(item.id) ?? item;
    return inventoryItemNeedsImageCache(current);
  }).length;

  return {
    processed: batch.length,
    cached,
    failed,
    remaining,
    updatedItems,
  };
}

/** Run many mini-batches within a time budget (server-side loop). */
export async function backfillInventoryImagesRun(input: {
  storeId: string;
  items: InventoryItem[];
  crosswalkByItemId?: Map<string, CardCrosswalk>;
  batchSize: number;
  budgetMs: number;
}): Promise<{
  cached: number;
  failed: number;
  remaining: number;
  processed: number;
  updatedItems: InventoryItem[];
}> {
  const crosswalkByItemId = input.crosswalkByItemId ?? new Map();
  const itemsById = new Map(input.items.map((item) => [item.id, item]));
  const started = Date.now();
  let cached = 0;
  let failed = 0;
  let processed = 0;

  while (Date.now() - started < input.budgetMs) {
    const snapshot = [...itemsById.values()];
    const batch = await backfillInventoryImagesBatch({
      storeId: input.storeId,
      items: snapshot,
      limit: input.batchSize,
      crosswalkByItemId,
    });

    for (const item of batch.updatedItems) {
      itemsById.set(item.id, item);
    }
    cached += batch.cached;
    failed += batch.failed;
    processed += batch.processed;

    if (batch.processed === 0 || batch.remaining === 0) break;
  }

  const remaining = [...itemsById.values()].filter(inventoryItemNeedsImageCache)
    .length;
  const updatedItems = [...itemsById.values()].filter((item) => {
    const original = input.items.find((i) => i.id === item.id);
    return (
      original?.frontImageUrl !== item.frontImageUrl ||
      original?.imageCacheFailedAt !== item.imageCacheFailedAt ||
      original?.imageCachedAt !== item.imageCachedAt
    );
  });

  return { cached, failed, remaining, processed, updatedItems };
}
