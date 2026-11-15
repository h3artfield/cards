import assert from "node:assert/strict";
import {
  goldenOracleCardIsSoleCommanderPoolCandidate,
  isStructuralSoleCommanderCandidate,
  isSoleCommanderPoolCandidate,
} from "./commander-pool-eligibility";

const thorin = {
  oracleId: "6aabead3-3c81-40b8-8a8d-8f817094d84d",
  canonicalName: "Thorin, King of Durin's Folk",
  typeLine: "Legendary Creature — Dwarf Noble",
  oracleText: "Whenever a Dwarf you control enters, create a Treasure token.",
  colorIdentity: ["R", "W"],
  legalities: { commander: "not_legal" },
  commanderEligibility: {
    eligible: false,
    reason: "Legendary creature that is not currently legal as a commander in this format",
  },
};

assert.equal(
  isStructuralSoleCommanderCandidate({
    name: thorin.canonicalName,
    typeLine: thorin.typeLine,
    colorIdentity: thorin.colorIdentity,
  }),
  true,
);

assert.equal(
  isSoleCommanderPoolCandidate({
    oracleId: thorin.oracleId,
    name: thorin.canonicalName,
    typeLine: thorin.typeLine,
    colorIdentity: thorin.colorIdentity,
    legalities: thorin.legalities,
  }),
  true,
  "stale not_legal bulk metadata must not hide structural legendary commanders",
);

assert.equal(goldenOracleCardIsSoleCommanderPoolCandidate(thorin as never), true);

assert.equal(
  isStructuralSoleCommanderCandidate({
    name: "Swamp",
    typeLine: "Basic Land — Swamp",
    colorIdentity: ["B"],
  }),
  false,
);

console.log("commander-pool-eligibility: all assertions passed");
