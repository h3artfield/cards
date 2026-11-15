import {
  classifyInventoryFormat,
  classifyInventoryGame,
  classifyInventoryPriceTier,
  computeInventoryAnalytics,
} from "../src/lib/inventory/analytics";
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
    productLine: "Pokemon International",
    quantity: 2,
    listPrice: 5,
    acquiredAt: "2026-01-01",
    tcgplayerProductId: "1",
    tcgplayerListingKey: "1|nm",
  },
  {
    id: "2",
    storeId: "s",
    source: "tcgplayer_import",
    displayName: "Lightning Bolt",
    productLine: "Magic",
    quantity: 1,
    listPrice: 3,
    acquiredAt: "2026-01-01",
    tcgplayerProductId: "2",
    tcgplayerListingKey: "2|nm",
  },
  {
    id: "3",
    storeId: "s",
    source: "tcgplayer_import",
    displayName: "ETB",
    productLine: "Pokemon International",
    tcgplayerCondition: "Unopened",
    quantity: 0,
    listPrice: 50,
    acquiredAt: "2026-01-01",
    status: "withdrawn",
    tcgplayerProductId: "3",
    tcgplayerListingKey: "3|unopened",
  },
];

assert(classifyInventoryGame(items[0]!) === "Pokémon", "classifies pokemon");
assert(classifyInventoryGame(items[1]!) === "Magic", "classifies magic");
assert(classifyInventoryFormat(items[2]!) === "Sealed / boxed", "classifies sealed");
const tier = (price: number) => classifyInventoryPriceTier({ ...items[0]!, listPrice: price });
assert(tier(5.99) === "Under $6", "tier under 6");
assert(tier(6) === "$6 – $19", "tier 6-19");
assert(tier(19.99) === "$6 – $19", "tier 6-19 top");
assert(tier(20) === "$20 – $49", "tier 20-49");
assert(tier(75) === "$50 – $99", "tier 50-99");
assert(tier(150) === "$100 – $199", "tier 100-199");
assert(tier(200) === "$200+", "tier 200+");
assert(
  classifyInventoryPriceTier({ ...items[0]!, listPrice: 7, tcgMarketPrice: 5.5 }) === "Under $6",
  "tier follows TCG market like the shelf rules",
);

const now = Date.parse("2026-03-15T00:00:00Z");
const shelved: InventoryItem[] = [
  { ...items[0]!, shelfLocation: "Pokémon Binder", ingestedAt: "2026-03-01T00:00:00Z" },
  {
    ...items[1]!,
    shelfLocation: "1-1",
    suggestedLocation: "Binder W",
    saleLog: [
      { at: "2026-03-10T00:00:00Z", quantity: 2, unitPrice: 4, channel: "in_store" },
      { at: "2026-01-01T00:00:00Z", quantity: 5, unitPrice: 4, channel: "shopify" },
    ],
  },
  { ...items[1]!, id: "4", shelfLocation: "Bulk", quantity: 3 },
];
const soldOut: InventoryItem = {
  ...items[1]!,
  id: "5",
  shelfLocation: "1-1",
  quantity: 0,
  status: "sold",
  soldAt: "2026-03-12T00:00:00Z",
  soldPrice: 9,
};

const analytics = computeInventoryAnalytics(items);
assert(analytics.totalUnits === 3, "counts in-stock units only");
assert(analytics.totalRows === 3, "includes catalog rows");
assert(analytics.catalogRows === 1, "one catalog row");
assert(analytics.byGame.some((s) => s.label === "Pokémon"), "game breakdown has pokemon");
assert(analytics.byPriceTier.length >= 2, "price tier breakdown");

const shelf = computeInventoryAnalytics(shelved, { soldItems: [soldOut], now });
const cabinet11 = shelf.locations.find((l) => l.location === "1-1")!;
assert(shelf.locations.filter((l) => l.kind === "case").length === 10, "lists every cabinet shelf");
assert(cabinet11.units === 1 && cabinet11.sold30 === 3, "cabinet units and 30-day sales");
assert(cabinet11.needsMove === 1 && shelf.needsMoveRows === 1, "counts cards to move");
assert(shelf.locations.find((l) => l.location === "Pokémon Binder")!.units === 2, "binder units");
assert(shelf.bulkUnits === 3, "bulk units");
assert(shelf.sold30Units === 3 && shelf.sold30Revenue === 17, "30-day sales skip older log entries");
assert(shelf.aging[0]!.units === 2, "aging buckets by added date");
assert(shelf.byPlacement.some((s) => s.label === "Cases"), "placement split");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
