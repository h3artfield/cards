/**
 * Verifier checks for tool-only clerk routes (inventory lookup, price check).
 */
import assert from "node:assert/strict";
import { checkIntentFulfillment } from "../src/lib/store-inventory/clerk-verifier/checks/intent-fulfillment";
import type { ClerkRouterResult } from "../src/lib/store-inventory/clerk-types";

function baseRoute(overrides: Partial<ClerkRouterResult>): ClerkRouterResult {
  return {
    game: "magic",
    format: "unknown",
    intent: "inventory_lookup",
    entities: { card_names: ["sol ring"] },
    constraints: { inventory_only: true },
    required_agents: [],
    required_tools: ["inventory_search"],
    clarification_needed: false,
    confidence: 0.9,
    ...overrides,
  };
}

function testInventoryLookupWithoutSpecialistPasses() {
  const result = checkIntentFulfillment({
    route: baseRoute({ intent: "inventory_lookup", required_agents: [] }),
    specialist: null,
    rulePack: null,
  });
  assert.equal(result.passed, true);
  assert.equal(result.reason, undefined);
}

function testPriceCheckWithoutSpecialistPasses() {
  const result = checkIntentFulfillment({
    route: baseRoute({ intent: "price_check", required_agents: [] }),
    specialist: null,
    rulePack: null,
  });
  assert.equal(result.passed, true);
}

function testRecommendationWithoutSpecialistFails() {
  const result = checkIntentFulfillment({
    route: baseRoute({
      intent: "recommendation",
      required_agents: ["mtg_commander"],
    }),
    specialist: null,
    rulePack: null,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason ?? "", /No specialist response/);
}

let failed = 0;
for (const [name, fn] of [
  ["inventory lookup without specialist", testInventoryLookupWithoutSpecialistPasses],
  ["price check without specialist", testPriceCheckWithoutSpecialistPasses],
  ["recommendation without specialist", testRecommendationWithoutSpecialistFails],
] as const) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}:`, err);
  }
}

console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed > 0 ? 1 : 0);
