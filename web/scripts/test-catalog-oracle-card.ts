/**
 * Unit tests for catalogOracleCards derivation.
 * Run: npx --yes tsx scripts/test-catalog-oracle-card.ts
 */
import assert from "node:assert/strict";
import {
  buildCatalogOracleCard,
  deriveCommanderEligibility,
} from "../src/lib/deck-builder/catalog-oracle-card";
import type { CatalogCard } from "../src/lib/deck-builder/types";

const solRing: CatalogCard = {
  id: "print-a",
  oracleId: "oracle-sol-ring",
  name: "Sol Ring",
  set: "cmr",
  setName: "Commander Legends",
  collectorNumber: "472",
  cmc: 1,
  typeLine: "Artifact",
  colorIdentity: [],
  commanderFormatLegal: false,
  isCommander: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const atraxa: CatalogCard = {
  id: "print-b",
  oracleId: "oracle-atraxa",
  name: "Atraxa, Praetors' Voice",
  set: "mkm",
  collectorNumber: "1",
  cmc: 4,
  typeLine: "Legendary Creature — Phyrexian Angel Horror",
  colorIdentity: ["W", "U", "B", "G"],
  commanderFormatLegal: true,
  isCommander: true,
  updatedAt: "2026-01-02T00:00:00.000Z",
};

assert.equal(deriveCommanderEligibility(solRing).eligible, false);
assert.equal(deriveCommanderEligibility(solRing).basis, "not_eligible");

const atraxaEligibility = deriveCommanderEligibility(atraxa);
assert.equal(atraxaEligibility.eligible, true);
assert.equal(atraxaEligibility.basis, "legendary_creature");

const oracle = buildCatalogOracleCard({
  catalog: atraxa,
  oracleTags: ["proliferate"],
});
assert.ok(oracle);
assert.equal(oracle!.id, "oracle-atraxa");
assert.deepEqual(oracle!.printingIds, ["print-b"]);
assert.equal(oracle!.commanderEligibility.basis, "legendary_creature");

const merged = buildCatalogOracleCard({
  catalog: { ...atraxa, id: "print-c", set: "2xm", collectorNumber: "99" },
  existing: oracle,
});
assert.deepEqual(merged!.printingIds.sort(), ["print-b", "print-c"].sort());

console.log("catalog oracle card tests passed");
