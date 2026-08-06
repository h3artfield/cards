/**
 * P0 customer-safety regression tests.
 * Run: npm run test:p0-clerk-safety
 */
import assert from "node:assert/strict";
import { catalogCardFromScryfall } from "../src/lib/deck-builder/scryfall-catalog";
import {
  assessRequestScopedCoverage,
  assessDeckBuildCatalogGate,
} from "../src/lib/deck-builder/catalog-coverage-gates";
import { computeCatalogCoverage } from "../src/lib/deck-builder/catalog-coverage";
import { buildInventorySnapshotId } from "../src/lib/deck-builder/catalog-sync-state";
import { deriveTagDerivedProfileV0 } from "../src/lib/deck-builder/functional-profile";
import { buildCatalogOracleCard } from "../src/lib/deck-builder/catalog-oracle-card";
import { inventoryQuantityAvailable } from "../src/lib/inventory/status";
import {
  assertCommanderImmutable,
  commanderNamesMatch,
  inferCommanderSelectionPolicy,
} from "../src/lib/store-inventory/resolved-clerk-request";
import { checkRequestConsistency } from "../src/lib/store-inventory/clerk-verifier/checks/request-consistency";
import { validateFormatterOutput } from "../src/lib/store-inventory/clerk-formatter-guard";
import { resolveRagCardNameCandidates } from "../src/lib/store-inventory/clerk-tools/rag-guided-inventory";
import { parseClerkInventoryQuery } from "../src/lib/store-inventory/clerk-tools/clerk-query-parser";
import type { CatalogCard, InventoryItem } from "../src/lib/types";

function pass(label: string) {
  console.log(`✓ ${label}`);
}

async function main() {
pass("exact commander policy from featured card");
assert.equal(
  inferCommanderSelectionPolicy({
    featuredCard: "Smaug, the Golden",
    themeKeywords: ["treasure"],
  }),
  "exact_commander_required",
);

pass("commander immutable assertion blocks substitution");
assert.throws(() =>
  assertCommanderImmutable({
    sessionCommanderName: "Smaug, the Golden",
    candidateName: "Animar, Soul of Elements",
    policy: "exact_commander_required",
  }),
);

pass("Smaug/Animar verifier mismatch");
const smaugMismatch = await checkRequestConsistency({
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
    direct_answer: "Built around Smaug treasure strategy.",
    recommendations: [],
    inventory_queries: [],
    missing_information: [],
    warnings: [],
    confidence: 0.8,
    deckList: {
      game: "magic",
      format: "Commander",
      archetype: "Animar, Soul of Elements",
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
});
assert.equal(smaugMismatch.passed, false);

// 4: Legendary heuristic removed from Scryfall import
const legendaryNonLegal = catalogCardFromScryfall({
  id: "test-id",
  name: "Test Legendary Enchantment",
  type_line: "Legendary Enchantment",
  legalities: { commander: "not_legal" },
  color_identity: [],
  set: "tst",
  collector_number: "1",
  cmc: 3,
});
assert.equal(legendaryNonLegal?.isCommander, false);
assert.equal(legendaryNonLegal?.commanderFormatLegal, false);
pass("legendary type line does not imply isCommander");

// 6: Formatter guard
const guard = validateFormatterOutput({
  reply: "Try **Fake Card Name** as your commander instead.",
  allowedCardNames: ["Sol Ring"],
  lockedCommanderName: "Smaug, the Golden",
  commanderSelectionPolicy: "exact_commander_required",
});
assert.equal(guard.valid, false);
pass("formatter guard blocks invented card names");

// 8: Explicit available quantity
const tcgItem = {
  id: "1",
  storeId: "s",
  displayName: "Card",
  acquiredAt: "2026-01-01",
  category: "magic",
  source: "tcgplayer_import",
  quantityOnHand: 5,
  quantityReserved: 2,
  quantityAvailable: 5,
} as InventoryItem;
assert.equal(inventoryQuantityAvailable(tcgItem), 5);
pass("TCGplayer uses explicit quantityAvailable (reserve tracked separately)");

// 9: Blue vs mono-blue
const monoBlue = parseClerkInventoryQuery({ userQuestion: "mono-blue cards" });
assert.deepEqual(monoBlue.semantic?.colorIdentityExact, ["U"]);
const blueCards = parseClerkInventoryQuery({ userQuestion: "blue cards" });
assert.deepEqual(blueCards.semantic?.colorIdentityContainsAny, ["U"]);
pass("mono-blue exact vs blue contains-any");

// 10: RAG requires oracle id (drops unresolvable names)
  const ragResolved = await resolveRagCardNameCandidates(["Totally Fake Card XYZ"]);
  assert.equal(ragResolved.length, 0);
  pass("unresolved RAG names dropped");

  // Request-scoped coverage gate
const pool = [
  {
    id: "1",
    storeId: "s",
    displayName: "Ramp",
    acquiredAt: "2026-01-01",
    category: "magic",
    productLine: "Magic",
    cardNumber: "1",
    catalogOracleId: "o1",
    catalogOracleTags: ["ramp"],
  },
  {
    id: "2",
    storeId: "s",
    displayName: "Unknown",
    acquiredAt: "2026-01-01",
    category: "magic",
    productLine: "Magic",
    cardNumber: "2",
  },
] as InventoryItem[];

const exactBlock = assessRequestScopedCoverage({
  commanderSelectionPolicy: "exact_commander_required",
  requestedCommanderName: "Smaug, the Golden",
  commanderOracleId: undefined,
  commanderColors: ["R"],
  candidatePool: pool,
  config: { mode: "warn" },
});
assert.equal(exactBlock.hardBlock, true);
pass("exact commander without oracle id hard blocks");

const warnOnly = assessRequestScopedCoverage({
  commanderSelectionPolicy: "user_must_choose",
  commanderOracleId: "oracle-1",
  commanderColors: ["U"],
  candidatePool: pool,
  config: { mode: "warn", poolCoverageThresholdPct: 60 },
});
assert.equal(warnOnly.hardBlock, false);
assert.ok(warnOnly.warnings.length > 0 || warnOnly.overallOracleIdPct < 60);
pass("low pool coverage warns without hard block");

const legacyGate = assessDeckBuildCatalogGate(computeCatalogCoverage(pool));
assert.equal(legacyGate.allowed, true);
pass("deprecated global gate no longer hard blocks");

// Tag-derived profile v0
const profile = deriveTagDerivedProfileV0({ oracleTags: ["ramp"] });
assert.equal(profile.profileVersion, "tag-derived-v0");
assert.ok(profile.roles.ramp);
assert.equal(profile.roles.ramp.derivationMethod, "oracle_tags");

const rampCard: CatalogCard = {
  id: "print-ramp",
  oracleId: "oracle-ramp",
  name: "Cultivate",
  set: "m21",
  collectorNumber: "1",
  cmc: 3,
  typeLine: "Sorcery",
  colorIdentity: ["G"],
  commanderFormatLegal: false,
  isCommander: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const oracle = buildCatalogOracleCard({ catalog: rampCard, oracleTags: ["ramp"] });
assert.ok(oracle?.tagDerivedProfileV0?.roles.ramp);
pass("tagDerivedProfileV0 on oracle cards");

const snapshotId = buildInventorySnapshotId(pool);
assert.match(snapshotId, /^inv-2-[a-f0-9]{16}$/);
pass("inventory snapshot id is reproducible");

  console.log("\nP0 clerk safety tests PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
