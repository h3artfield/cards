import { isMagicInventoryItem } from "./magic-items";
import { isFirebaseStorageUrl } from "./image-url";
import type { InventoryItem } from "../types";

/** Current persist pipeline — only v2+ Storage URLs are trusted for non-Magic/non-Pokémon. */
export const INVENTORY_IMAGE_CACHE_VERSION = 2;

/** Japanese Pokémon requires v3+ (v2 rows may contain incorrect English art). */
export const POKEMON_JAPAN_IMAGE_CACHE_VERSION = 3;

/** Magic v3+ — older caches may hold a different game's art (e.g. Pokémon). */
export const MAGIC_IMAGE_CACHE_VERSION = 3;

export function isPokemonJapanInventoryItem(item: InventoryItem): boolean {
  const line = `${item.productLine ?? ""} ${item.category ?? ""}`.toLowerCase();
  return line.includes("pokemon") && line.includes("japan");
}

/** English Pokémon singles/sealed — not Pokemon Japan. */
export function isPokemonInventoryItem(item: InventoryItem): boolean {
  if (isPokemonJapanInventoryItem(item)) return false;
  const line = `${item.productLine ?? ""} ${item.category ?? ""}`.toLowerCase();
  return line.includes("pokemon") || line.includes("pokémon");
}

export function isFleshAndBloodItem(item: InventoryItem): boolean {
  const line = `${item.productLine ?? ""} ${item.category ?? ""}`.toLowerCase();
  return line.includes("flesh") && line.includes("blood");
}

/** Storage URLs safe to serve without re-resolving through the proxy. */
export function trustedFirebaseImageUrl(item: InventoryItem): string | undefined {
  const url = item.frontImageUrl?.trim();
  if (!url || !isFirebaseStorageUrl(url)) return undefined;

  if (isMagicInventoryItem(item)) {
    if (
      (item.imageCacheVersion ?? 0) >= MAGIC_IMAGE_CACHE_VERSION &&
      item.imageCachedAt
    ) {
      return url;
    }
    return undefined;
  }

  if (isPokemonInventoryItem(item)) return url;

  if (isPokemonJapanInventoryItem(item)) {
    if (
      (item.imageCacheVersion ?? 0) >= POKEMON_JAPAN_IMAGE_CACHE_VERSION &&
      item.imageCachedAt
    ) {
      return url;
    }
    return undefined;
  }

  if (
    (item.imageCacheVersion ?? 0) >= INVENTORY_IMAGE_CACHE_VERSION &&
    item.imageCachedAt
  ) {
    return url;
  }

  return undefined;
}

export function inventoryImageCacheVersionForItem(item: InventoryItem): number {
  if (isPokemonJapanInventoryItem(item)) return POKEMON_JAPAN_IMAGE_CACHE_VERSION;
  if (isMagicInventoryItem(item)) return MAGIC_IMAGE_CACHE_VERSION;
  return INVENTORY_IMAGE_CACHE_VERSION;
}

export function hasTrustedFirebaseImageCache(item: InventoryItem): boolean {
  return Boolean(trustedFirebaseImageUrl(item));
}
