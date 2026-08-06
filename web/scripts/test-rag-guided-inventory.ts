/**
 * Unit tests for RAG-guided category inventory (no network).
 */
import assert from "node:assert/strict";
import {
  matchSuggestedCardsInInventory,
  shouldUseRagGuidedInventory,
} from "../src/lib/store-inventory/clerk-tools/rag-guided-inventory";
import type { ClerkRouterResult } from "../src/lib/store-inventory/clerk-types";
import type { StoreInventoryCard } from "../src/lib/deck-builder/store-inventory-browse";

function baseRoute(overrides: Partial<ClerkRouterResult> = {}): ClerkRouterResult {
  return {
    game: "magic",
    format: "commander",
    intent: "inventory_lookup",
    entities: { card_names: [] },
    constraints: { inventory_only: true },
    required_agents: [],
    required_tools: ["inventory_search"],
    clarification_needed: false,
    confidence: 0.9,
    ...overrides,
  };
}

function testShouldUseRagGuidedForRampCategory() {
  assert.equal(
    shouldUseRagGuidedInventory({
      route: baseRoute(),
      semanticActive: true,
      cardNames: [],
    }),
    process.env.MTG_RAG_ENABLED?.trim().toLowerCase() === "true",
  );
}

function testShouldNotUseRagForNamedCard() {
  assert.equal(
    shouldUseRagGuidedInventory({
      route: baseRoute(),
      semanticActive: true,
      cardNames: ["Sol Ring"],
    }),
    false,
  );
}

function testShouldNotUseRagWithoutSemanticFilter() {
  assert.equal(
    shouldUseRagGuidedInventory({
      route: baseRoute(),
      semanticActive: false,
      cardNames: [],
    }),
    false,
  );
}

function testMatchSuggestedCardsPreservesOrder() {
  const pool: StoreInventoryCard[] = [
    {
      inventoryItemId: "a",
      name: "Cultivate",
      qty: 2,
      colorIdentity: ["G"],
      imageProxyUrl: "",
      category: "magic",
      isCommander: false,
    },
    {
      inventoryItemId: "b",
      name: "Sol Ring",
      qty: 4,
      colorIdentity: [],
      imageProxyUrl: "",
      category: "magic",
      isCommander: false,
    },
  ];

  const matched = matchSuggestedCardsInInventory({
    suggestedNames: ["Sol Ring", "Mana Crypt", "Cultivate"],
    pool,
  });

  assert.deepEqual(
    matched.map((c) => c.name),
    ["Sol Ring", "Cultivate"],
  );
}

testShouldUseRagGuidedForRampCategory();
testShouldNotUseRagForNamedCard();
testShouldNotUseRagWithoutSemanticFilter();
testMatchSuggestedCardsPreservesOrder();

console.log("rag-guided inventory tests passed");
