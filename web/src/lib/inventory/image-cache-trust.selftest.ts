import assert from "node:assert/strict";
import {
  inventoryItemCanRetryImageCache,
  inventoryItemNeedsImageCache,
} from "./image-backfill";
import {
  isPokemonInventoryItem,
  isPokemonJapanInventoryItem,
  MAGIC_IMAGE_CACHE_VERSION,
  POKEMON_JAPAN_IMAGE_CACHE_VERSION,
  trustedFirebaseImageUrl,
} from "./image-cache-trust";
import type { InventoryItem } from "../types";

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: "test",
    storeId: "store",
    displayName: "Test",
    status: "on_hand",
    quantity: 1,
    ...overrides,
  } as InventoryItem;
}

const japan = item({
  productLine: "Pokemon Japan",
  frontImageUrl:
    "https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media",
  imageCachedAt: "2026-01-01T00:00:00.000Z",
});

assert.equal(isPokemonJapanInventoryItem(japan), true);
assert.equal(isPokemonInventoryItem(japan), false);
assert.equal(
  trustedFirebaseImageUrl(japan),
  undefined,
  "Japan cache without v2 must not be trusted",
);

assert.equal(
  trustedFirebaseImageUrl({
    ...japan,
    imageCacheVersion: POKEMON_JAPAN_IMAGE_CACHE_VERSION,
  }),
  japan.frontImageUrl,
);

const staleJapan = {
  ...japan,
  imageCacheVersion: 2,
  imageCacheFailedAt: "2026-01-01T00:00:00.000Z",
};
assert.equal(inventoryItemNeedsImageCache(staleJapan), true);
assert.equal(inventoryItemCanRetryImageCache(staleJapan), true);

const magicPoisoned = item({
  productLine: "Magic: The Gathering",
  category: "magic",
  productName: "Bag End - Horizon Canopy (Borderless) (Surge Foil)",
  frontImageUrl:
    "https://firebasestorage.googleapis.com/v0/b/x/o/adventure-bag?alt=media",
  imageCachedAt: "2026-01-01T00:00:00.000Z",
  imageCacheVersion: 2,
});
assert.equal(
  trustedFirebaseImageUrl(magicPoisoned),
  undefined,
  "stale Magic cache must not be trusted",
);
assert.equal(inventoryItemNeedsImageCache(magicPoisoned), true);
assert.equal(
  trustedFirebaseImageUrl({
    ...magicPoisoned,
    imageCacheVersion: MAGIC_IMAGE_CACHE_VERSION,
  }),
  magicPoisoned.frontImageUrl,
);

console.log("image-cache-trust: all assertions passed");
