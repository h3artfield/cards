/**
 * Entity resolution + deck-build routing regression tests.
 * Run: npx tsx scripts/test-entity-resolution-routing.ts
 */
import assert from "node:assert/strict";
import {
  inferCommanderSelectionPolicy,
  inferPolicyFromRoute,
} from "../src/lib/store-inventory/resolved-clerk-request";
import {
  deriveStructuralCommanderEligibility,
} from "../src/lib/store-inventory/commander-status";
import {
  extractCommanderResolutionPhrase,
  resolveCommanderEntity,
} from "../src/lib/store-inventory/entity-candidate-resolution";
import { assessMultiCommanderSupport } from "../src/lib/store-inventory/multi-commander";

function pass(label: string) {
  console.log(`✓ ${label}`);
}

async function main() {
  assert.equal(
    inferCommanderSelectionPolicy({
      parsedCommander: "Kangee, Aerie Keeper",
      themeKeywords: [],
    }),
    "exact_commander_required",
  );
  pass("Build around Kangee → exact_commander_required");

  assert.equal(
    inferCommanderSelectionPolicy({
      themeKeywords: ["birds"],
      question: "Build me a bird-themed Commander deck",
    }),
    "user_must_choose",
  );
  pass("Build a Bird deck → user_must_choose");

  assert.equal(
    inferCommanderSelectionPolicy({
      themeKeywords: ["birds"],
      question: "What commanders work with Birds?",
    }),
    "recommend_a_commander",
  );
  pass("What commanders work with Birds? → recommend_a_commander");

  assert.equal(
    inferCommanderSelectionPolicy({
      themeKeywords: ["birds"],
      question: "Use whichever Bird commander is best",
    }),
    "automatic_selection_allowed",
  );
  pass("Use whichever Bird commander is best → automatic_selection_allowed");

  assert.equal(
    inferPolicyFromRoute({
      question: "build a bird deck",
      themeKeywords: ["birds"],
    }),
    "user_must_choose",
  );
  pass("route theme infers user_must_choose");

  const phrase = extractCommanderResolutionPhrase({
    question:
      "Build a complete Commander deck around Smaug the Magnificent, the newly previewed card from the upcoming Hobbit set.",
  });
  assert.equal(phrase, "Smaug the Magnificent");
  pass("Smaug the Magnificent exact phrase extraction");

  const structural = deriveStructuralCommanderEligibility({
    typeLine: "Legendary Creature — Dragon",
    oracleText: "Flying",
  });
  assert.equal(structural.eligible, true);
  assert.equal(structural.basis, "legendary_creature");
  pass("legendary creature structurally eligible without format legality");

  const token = deriveStructuralCommanderEligibility({
    typeLine: "Token Creature — Dragon",
  });
  assert.equal(token.eligible, false);
  pass("token excluded from commander candidates");

  const partner = assessMultiCommanderSupport({
    commanderStatus: {
      structurallyEligible: true,
      eligibilityBasis: "partner_configuration",
      currentlyLegal: true,
      legalityStatus: "legal",
      oracleId: "test-oracle",
      canonicalName: "Partner Commander",
    },
    typeLine: "Legendary Creature — Human",
    oracleText: "Partner",
  });
  assert.equal(partner.supported, false);
  pass("partner configuration fails closed");

  if (process.env.RUN_LIVE_SCRYFALL === "1") {
    const magnificent = await resolveCommanderEntity({
      phrase: "Smaug the Magnificent",
      conversationContext:
        "Build a complete Commander deck around Smaug the Magnificent from the upcoming Hobbit set.",
    });
    assert.equal(magnificent.entityResolutionStatus, "resolved");
    assert.ok(magnificent.selected?.oracleId);
    assert.match(
      magnificent.selected?.canonicalName ?? "",
      /Smaug the Magnificent/i,
    );
    pass("live: Smaug the Magnificent resolves");

    const ambiguous = await resolveCommanderEntity({
      phrase: "Smaug",
      conversationContext: "build around Smaug",
    });
    assert.equal(ambiguous.entityResolutionStatus, "ambiguous");
    assert.ok(ambiguous.candidates.length >= 2);
    pass("live: bare Smaug is ambiguous");
  } else {
    console.log("ℹ Skipping live Scryfall tests (set RUN_LIVE_SCRYFALL=1 to enable)");
  }

  console.log("\nEntity resolution routing tests PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
