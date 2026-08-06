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
assert(classifyInventoryPriceTier({ ...items[0]!, listPrice: 5 }) === "Under $10", "tier under 10");
assert(classifyInventoryPriceTier({ ...items[0]!, listPrice: 25 }) === "$10 – $50", "tier 10-50");
assert(classifyInventoryPriceTier({ ...items[0]!, listPrice: 75 }) === "$50 – $100", "tier 50-100");
assert(classifyInventoryPriceTier({ ...items[0]!, listPrice: 250 }) === "$100 – $500", "tier 100-500");
assert(classifyInventoryPriceTier({ ...items[0]!, listPrice: 600 }) === "$500+", "tier 500+");

const analytics = computeInventoryAnalytics(items);
assert(analytics.totalUnits === 3, "counts in-stock units only");
assert(analytics.totalRows === 3, "includes catalog rows");
assert(analytics.catalogRows === 1, "one catalog row");
assert(analytics.byGame.some((s) => s.label === "Pokémon"), "game breakdown has pokemon");
assert(analytics.byPriceTier.length >= 2, "price tier breakdown");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
