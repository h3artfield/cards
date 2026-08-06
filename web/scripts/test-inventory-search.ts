import { browseInventoryItems, countItemsNeedingImageCache } from "../src/lib/inventory/search";
import type { InventoryItem } from "../src/lib/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const items: InventoryItem[] = [
  {
    id: "1",
    storeId: "s",
    source: "tcgplayer_import",
    displayName: "Pikachu",
    setName: "Base Set",
    productLine: "Pokemon",
    quantity: 2,
    listPrice: 5,
    acquiredAt: "2026-01-01",
    tcgplayerProductId: "12345",
    tcgplayerListingKey: "12345|nm",
    frontImageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/12345_in_1000x1000.jpg",
  },
  {
    id: "2",
    storeId: "s",
    source: "tcgplayer_import",
    displayName: "Charizard",
    setName: "Base Set",
    productLine: "Pokemon",
    quantity: 0,
    listPrice: 500,
    acquiredAt: "2026-01-01",
    tcgplayerProductId: "99999",
    tcgplayerListingKey: "99999|nm",
  },
  {
    id: "3",
    storeId: "s",
    source: "tcgplayer_import",
    displayName: "Lightning Bolt",
    productLine: "Magic",
    quantity: 1,
    listPrice: 3,
    acquiredAt: "2026-01-01",
    status: "listed",
    shopifyListing: { productId: "p1", variantId: "v1", listedAt: "2026-01-02" },
    tcgplayerProductId: "2",
    tcgplayerListingKey: "2|nm",
  },
  {
    id: "4",
    storeId: "s",
    source: "buyback",
    displayName: "Sold card",
    quantity: 1,
    acquiredAt: "2026-01-01",
    status: "sold",
  },
];

const all = browseInventoryItems(items, {});
assert(all.total === 3, "excludes sold rows");
assert(all.items.length === 3, "returns active rows");

const search = browseInventoryItems(items, { q: "pikachu" });
assert(search.total === 1, "search by name");
assert(search.items[0]?.id === "1", "search finds pikachu");

const inStock = browseInventoryItems(items, { stock: "in_stock" });
assert(inStock.total === 2, "in_stock filter");

const catalog = browseInventoryItems(items, { stock: "catalog" });
assert(catalog.total === 1 && catalog.items[0]?.id === "2", "catalog filter");

const listed = browseInventoryItems(items, { listed: "listed" });
assert(listed.total === 1 && listed.items[0]?.id === "3", "listed filter");

const unlisted = browseInventoryItems(items, { listed: "unlisted" });
assert(unlisted.total === 2, "unlisted filter");

const page2 = browseInventoryItems(items, { limit: 1, page: 2 });
assert(page2.page === 2 && page2.items.length === 1, "pagination");

assert(countItemsNeedingImageCache(items) === 1, "counts tcgplayer cdn pending");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
