/**
 * P0 Oracle-ID end-to-end pipeline tests (local, no live OpenAI).
 * Run: npm run test:p0-oracle-e2e
 */
import assert from "node:assert/strict";
import {
  buildAllowedCardRegistry,
  extractPotentialCardMentions,
  resolveMentionAgainstRegistry,
  validateFormattedReplyAgainstRegistry,
} from "../src/lib/store-inventory/allowed-card-registry";
import { renderDeterministicReply, buildAnswerPlan } from "../src/lib/store-inventory/clerk-answer-plan";
import {
  commanderOracleIdsMatch,
} from "../src/lib/store-inventory/commander-oracle-contract";
import { inferPolicyFromRoute, assertCommanderImmutable } from "../src/lib/store-inventory/resolved-clerk-request";
import { checkRequestConsistency } from "../src/lib/store-inventory/clerk-verifier/checks/request-consistency";
import type { ClerkDeckList, SpecialistResponse } from "../src/lib/store-inventory/clerk-types";

const ORACLE_SMAUG = "oracle-smaug-id";
const ORACLE_ANIMAR = "oracle-animar-id";
const ORACLE_SOL = "oracle-sol-id";

function pass(label: string) {
  console.log(`✓ ${label}`);
}

function deckFixture(overrides: Partial<ClerkDeckList>): ClerkDeckList {
  return {
    game: "magic",
    format: "Commander",
    archetype: "Smaug, the Golden",
    commanderOracleId: ORACLE_SMAUG,
    commanderCanonicalName: "Smaug, the Golden",
    commanderColorIdentity: ["R"],
    strategy: "Treasure strategy around Smaug.",
    totalCards: 10,
    targetCards: 100,
    inStockCards: 9,
    deckTotal: 50,
    withinBudget: true,
    lines: [
      {
        slot: "Commander",
        name: "Smaug, the Golden",
        oracleId: ORACLE_SMAUG,
        qty: 1,
        category: "commander",
        inStock: false,
        substituteNote: "Not in stock",
      },
    ],
    missingSlots: ["Commander: Smaug, the Golden"],
    ...overrides,
  };
}

async function main() {
  pass("formatter invents card not in answer plan");
  const registry = buildAllowedCardRegistry({
    commanderOracleId: ORACLE_SMAUG,
    commanderCanonicalName: "Smaug, the Golden",
    recommendations: [
      { card_name: "Sol Ring", oracleId: ORACLE_SOL, reason: "ramp", inventoryItemId: "i1" },
    ],
  });
  const bad = validateFormattedReplyAgainstRegistry({
    reply: "Try **Fake Card XYZ** in the deck.",
    registry,
    commanderOracleId: ORACLE_SMAUG,
    commanderSelectionPolicy: "exact_commander_required",
  });
  assert.equal(bad.valid, false);

  pass("formatter misspelling of valid card in registry");
  const registry2 = buildAllowedCardRegistry({
    commanderOracleId: ORACLE_SMAUG,
    commanderCanonicalName: "Smaug, the Golden",
    deckList: deckFixture({}),
  });
  const misspell = validateFormattedReplyAgainstRegistry({
    reply: "Built around **Smaug the Golden**.",
    registry: registry2,
    commanderOracleId: ORACLE_SMAUG,
    commanderSelectionPolicy: "exact_commander_required",
  });
  assert.equal(misspell.valid, true);

  pass("formatter substitutes Animar for Smaug");
  const animarSub = validateFormattedReplyAgainstRegistry({
    reply: "Your commander **Animar, Soul of Elements** leads this list.",
    registry: registry2,
    commanderOracleId: ORACLE_SMAUG,
    commanderSelectionPolicy: "exact_commander_required",
  });
  assert.equal(animarSub.valid, false);

  pass("deck title vs slot commander mismatch");
  const mismatchDeck = deckFixture({
    lines: [
      {
        slot: "Commander",
        name: "Animar, Soul of Elements",
        oracleId: ORACLE_ANIMAR,
        qty: 1,
        category: "commander",
        inStock: true,
      },
    ],
  });
  const slotCheck = await checkRequestConsistency({
    route: {
      game: "magic",
      format: "commander",
      intent: "build_deck",
      entities: { card_names: [], featured_card: "Smaug, the Golden" },
      constraints: { inventory_only: true },
      required_agents: ["mtg_commander"],
      required_tools: ["inventory_search"],
      clarification_needed: false,
      confidence: 0.9,
    },
    specialist: {
      direct_answer: "Deck",
      recommendations: [],
      inventory_queries: [],
      missing_information: [],
      warnings: [],
      confidence: 0.8,
      commanderOracleId: ORACLE_SMAUG,
      deckList: mismatchDeck,
    },
    ctx: {
      storeId: "t",
      storeSlug: "t",
      storeName: "T",
      user_question: "build smaug deck",
      conversation_summary: "",
    },
    lockedCommanderOracleId: ORACLE_SMAUG,
  });
  assert.equal(slotCheck.passed, false);
  assert.equal(slotCheck.failureCode, "commander_slot_oracle_id_mismatch");

  pass("commander name matches but oracle id differs");
  assert.equal(commanderOracleIdsMatch(ORACLE_SMAUG, ORACLE_ANIMAR), false);

  pass("out-of-stock but canonically resolved commander");
  const oosDeck = deckFixture({});
  assert.equal(oosDeck.commanderOracleId, ORACLE_SMAUG);
  assert.equal(oosDeck.lines[0]?.inStock, false);
  assert.equal(oosDeck.lines[0]?.name, "Smaug, the Golden");

  pass("deterministic fallback when formatter fails");
  const specialist: SpecialistResponse = {
    direct_answer: "Validated answer from specialist.",
    recommendations: [],
    inventory_queries: [],
    missing_information: [],
    warnings: ["Commander not in stock"],
    confidence: 0.7,
    deckList: oosDeck,
    commanderOracleId: ORACLE_SMAUG,
  };
  const plan = buildAnswerPlan({ specialist, registry: registry2 });
  const deterministic = renderDeterministicReply(plan);
  assert.ok(deterministic.includes("Validated answer"));

  pass("RAG bad example not in registry is rejected");
  const ragRegistry = buildAllowedCardRegistry({
    inventory: [
      {
        inventoryItemId: "i1",
        oracleId: ORACLE_SOL,
        name: "Sol Ring",
        qty: 1,
        colorIdentity: [],
        isCommander: false,
      },
    ],
  });
  const ragBad = validateFormattedReplyAgainstRegistry({
    reply: "Do not use **Chaos Warp** in mono-blue.",
    registry: ragRegistry,
  });
  assert.equal(ragBad.valid, false);

  pass("production policy infers exact commander from featured card");
  assert.equal(
    inferPolicyFromRoute({
      routeEntities: { featured_card: "Smaug, the Golden" },
      question: "build smaug deck",
    }),
    "exact_commander_required",
  );

  pass("commander immutable blocks substitution");
  assert.throws(() =>
    assertCommanderImmutable({
      sessionCommanderName: "Smaug, the Golden",
      candidateName: "Animar, Soul of Elements",
      policy: "exact_commander_required",
    }),
  );

  pass("extract mentions from bold and quoted text");
  const mentions = extractPotentialCardMentions('Try **Sol Ring** or "Cultivate"');
  assert.ok(mentions.includes("Sol Ring"));
  assert.ok(mentions.includes("Cultivate"));

  pass("resolve mention against registry accepts display names");
  const resolved = resolveMentionAgainstRegistry("Smaug the Golden", registry2);
  assert.equal(resolved?.oracleId, ORACLE_SMAUG);

  console.log("\nP0 Oracle E2E tests PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
