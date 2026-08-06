/**
 * Store rules — under-$10 and category normalization.
 * Run: npx tsx scripts/test-store-rules-clerk.ts
 */
import { applyStoreRules } from "../src/lib/processing/rules-engine";
import type { StoreRule, VisionResult } from "../src/lib/types";

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

const underTenRule = {
  id: "under-10",
  storeId: "s1",
  title: "under 10 dollars",
  active: true,
  priority: 10,
  appliesToCategories: ["Pokémon"],
  ruleType: "do_not_buy",
  ruleText: "not accepting any card with a value under 10 dollars",
  createdAt: "",
  updatedAt: "",
} as unknown as StoreRule;

const vision: VisionResult = {
  category: "pokemon",
  itemType: "raw",
  cardName: "Cinderace VMAX",
  conditionEstimate: "NM",
  confidence: 0.9,
};

console.log("Store rules — clerk integration\n");

{
  const low = applyStoreRules([underTenRule], vision, 2.23);
  assert(low.doNotBuy === true, "blocks Cinderace at $2.23");
  assert(
    low.matchedRules.includes("under 10 dollars"),
    "matches under 10 rule title",
  );

  const mid = applyStoreRules([underTenRule], vision, 11.18);
  assert(mid.doNotBuy === false, "allows Flareon at $11.18");

  const high = applyStoreRules([underTenRule], vision, 55.91);
  assert(high.doNotBuy === false, "allows Charizard at $55.91");

  const unknown = applyStoreRules([underTenRule], vision, 0);
  assert(unknown.doNotBuy === false, "unknown/zero market does not match under-$10 rule");

  const magicVision = {
    category: "magic" as const,
    itemType: "raw" as const,
    cardName: "Sensational Spider-Man",
    conditionEstimate: "LP" as const,
    confidence: 0.9,
  };
  const magicLow = applyStoreRules([underTenRule], magicVision, 2.55);
  assert(
    magicLow.doNotBuy === true,
    "under-$10 any-card rule blocks Magic under $10",
  );
}

console.log(`\nstore rules clerk: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed > 0 ? 1 : 0);
