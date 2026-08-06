/**
 * Priority 0 unit tests — resolved request + verifier consistency.
 * Run: npx tsx scripts/test-resolved-clerk-request.ts
 */
import {
  commanderNamesMatch,
  inferCommanderSelectionPolicy,
  inferPolicyFromRoute,
} from "../src/lib/store-inventory/resolved-clerk-request";
import { checkRequestConsistency } from "../src/lib/store-inventory/clerk-verifier/checks/request-consistency";
import { isVerifiedCommander } from "../src/lib/store-inventory/clerk-tools/magic-commander-inventory";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}

async function main() {
  assert(
    "featured card implies exact commander policy",
    inferCommanderSelectionPolicy({
      featuredCard: "Smaug, the Golden",
      themeKeywords: ["treasure"],
    }) === "exact_commander_required",
  );

  assert(
    "theme-only requires user choice",
    inferCommanderSelectionPolicy({
      themeKeywords: ["birds"],
      question: "Build me a bird deck",
    }) === "user_must_choose",
  );

  assert(
    "commander names match fuzzy",
    commanderNamesMatch("Smaug, the Golden", "Smaug the Golden"),
  );

  assert(
    "legendary non-commander fails isVerifiedCommander",
    !isVerifiedCommander("Legendary Enchantment", false),
  );

  assert(
    "legal commander passes isVerifiedCommander",
    isVerifiedCommander("Legendary Creature", true),
  );

  const smaugMismatch = await checkRequestConsistency({
    route: {
      game: "magic",
      format: "commander",
      intent: "build_deck",
      entities: {
        card_names: [],
        featured_card: "Smaug, the Golden",
      },
      constraints: { inventory_only: true },
      required_agents: ["mtg_commander"],
      required_tools: ["inventory_search"],
      clarification_needed: false,
      confidence: 0.9,
    },
    specialist: {
      direct_answer: "Built around Smaug treasure strategy.",
      recommendations: [],
      inventory_queries: [],
      missing_information: [],
      warnings: [],
      confidence: 0.8,
      commanderOracleId: "oracle-animar",
      deckList: {
        game: "magic",
        format: "Commander",
        archetype: "Animar, Soul of Elements",
        commanderOracleId: "oracle-animar",
        commanderCanonicalName: "Animar, Soul of Elements",
        commanderColorIdentity: ["G", "U", "R"],
        strategy: "Smaug treasure deck",
        totalCards: 12,
        targetCards: 100,
        inStockCards: 11,
        deckTotal: 116,
        withinBudget: true,
        lines: [
          {
            slot: "Commander",
            name: "Animar, Soul of Elements",
            oracleId: "oracle-animar",
            qty: 1,
            category: "commander",
            inStock: true,
            listPrice: 33,
          },
        ],
        missingSlots: ["88 main-deck card(s)"],
        mainDeckCount: 11,
      },
    },
    ctx: {
      storeId: "test",
      storeSlug: "test",
      storeName: "Test",
      user_question: "build a commander deck built on the new smaug",
      conversation_summary: "",
    },
    lockedCommanderOracleId: "oracle-smaug",
  });

  assert(
    "verifier catches Smaug request with Animar oracle id",
    !smaugMismatch.passed &&
      smaugMismatch.failureCode === "commander_oracle_id_changed",
  );

  assert(
    "route featured card infers exact policy",
    inferPolicyFromRoute({
      routeEntities: { featured_card: "Smaug, the Golden" },
      question: "build smaug deck",
    }) === "exact_commander_required",
  );

  console.log("\nResolved clerk request tests PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
