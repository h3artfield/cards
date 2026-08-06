/**
 * Unit tests for functional profiles and coverage gates.
 * Run: npx --yes tsx scripts/test-functional-profile.ts
 */
import assert from "node:assert/strict";
import { buildCatalogOracleCard } from "../src/lib/deck-builder/catalog-oracle-card";
import { computeCatalogCoverage } from "../src/lib/deck-builder/catalog-coverage";
import { assessDeckBuildCatalogGate, assessRequestScopedCoverage } from "../src/lib/deck-builder/catalog-coverage-gates";
import { deriveTagDerivedProfileV0 } from "../src/lib/deck-builder/functional-profile";
import type { CatalogCard, InventoryItem } from "../src/lib/types";

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

const profile = deriveTagDerivedProfileV0({
  oracleTags: ["ramp", "mana-acceleration"],
});
assert.ok(profile.roles.ramp);
assert.equal(profile.roles.ramp.derivationMethod, "oracle_tags");
assert.equal(profile.profileVersion, "tag-derived-v0");

const oracle = buildCatalogOracleCard({
  catalog: rampCard,
  oracleTags: ["ramp"],
});
assert.ok(oracle?.tagDerivedProfileV0?.roles.ramp);

const items = [
  {
    id: "1",
    storeId: "s",
    displayName: "Card",
    acquiredAt: "2026-01-01",
    category: "magic",
    productLine: "Magic",
    cardNumber: "1",
    catalogOracleId: "o1",
    catalogScryfallId: "s1",
    catalogSyncedAt: "2026-01-01",
    catalogMatchMethod: "tcgplayer_id",
  },
  {
    id: "2",
    storeId: "s",
    displayName: "Card 2",
    acquiredAt: "2026-01-01",
    category: "magic",
    productLine: "Magic",
    cardNumber: "2",
    catalogMatchMethod: "unresolved",
    catalogSyncedAt: "2026-01-01",
  },
] as InventoryItem[];

const coverage = computeCatalogCoverage(items);
const gate = assessDeckBuildCatalogGate(coverage);
assert.equal(gate.allowed, true);

const scoped = assessRequestScopedCoverage({
  commanderSelectionPolicy: "exact_commander_required",
  requestedCommanderName: "Missing Card",
  commanderColors: ["G"],
  candidatePool: items,
  config: { mode: "warn" },
});
assert.equal(scoped.hardBlock, true);

console.log("functional profile + coverage gate tests passed");
