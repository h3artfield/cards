import assert from "node:assert/strict";
import {
  extractCardNamesFromProfessorFeedback,
  normalizeOffPlanCardLabel,
  repairOffPlanNonlandsV111,
} from "./professor-sol-directed-off-plan-repair-v1-1-1";
import type { SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

assert.equal(normalizeOffPlanCardLabel("The Gaffer, when counted as a sacrifice outlet"), "The Gaffer");
assert.equal(
  normalizeOffPlanCardLabel("Gandalf, White Rider — assigned as a token producer, but its Oracle text creates no tokens"),
  "Gandalf, White Rider",
);

const extracted = extractCardNamesFromProfessorFeedback({
  offPlanCards: ["Unexpectedly Absent — assigned to protection, but it is an interaction spell"],
  requiredChanges: ["Gandalf, White Rider must be replaced or reassigned because it produces no tokens."],
});
assert.ok(extracted.some((name) => name.includes("Gandalf, White Rider")));
assert.ok(extracted.some((name) => name.includes("Unexpectedly Absent")));

const deck: SolDirectedConstructedDeckV11 = {
  commander: { name: "Gandalf the White", oracleId: "gandalf", colorIdentity: ["W"], typeLine: "Legendary Creature" },
  landCount: 36,
  lands: [{ name: "Plains", copies: 36 }],
  nonlands: [
    {
      oracleId: "bad-1",
      name: "The Gaffer",
      primaryArchitectRequirement: "sacrifice_outlets",
      primaryRole: "Sacrifice",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "test",
      structuralNecessity: "REQUIRED",
    },
  ],
  primaryWinPaths: [],
  secondaryWinPaths: [],
  structuralNecessities: [],
  replaceableFlex: [],
};

const { deck: repaired, repairs } = repairOffPlanNonlandsV111({
  deck,
  offPlanCards: ["The Gaffer, when counted as a sacrifice outlet"],
  candidateDictionary: {
    "good-1": {
      oracleId: "good-1",
      name: "Ashnod's Altar",
      manaValue: 3,
      typeLine: "Artifact",
      colorIdentity: [],
      oracleText: "{T}, Sacrifice a creature: Add {C}{C}.",
      semanticFunctions: ["SACRIFICE", "MANA"],
      semanticOracle: null,
      commanderLegal: true,
      isLand: false,
    },
  },
  requirementPools: [{ requirementId: "sacrifice_outlets", primaryRole: "Sacrifice", requestedCount: 1, targetPoolSize: 10, oracleIds: ["good-1"], seedOracleIds: [], semanticOracleIds: [] }],
});

assert.equal(repairs.length, 1);
assert.equal(repaired.nonlands[0]?.name, "Ashnod's Altar");

const gandalfDeck: SolDirectedConstructedDeckV11 = {
  ...deck,
  nonlands: [
    {
      oracleId: "gwr",
      name: "Gandalf, White Rider",
      primaryArchitectRequirement: "token_producers",
      primaryRole: "Token",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "test",
      structuralNecessity: "REQUIRED",
    },
  ],
};

const gandalfRepair = repairOffPlanNonlandsV111({
  deck: gandalfDeck,
  offPlanCards: [
    "Gandalf, White Rider — assigned as a token producer, but its Oracle text creates no tokens",
  ],
  candidateDictionary: {
    "horn": {
      oracleId: "horn",
      name: "Horn of Gondor",
      manaValue: 3,
      typeLine: "Artifact",
      colorIdentity: ["W"],
      oracleText: "Create a 1/1 Human Soldier creature token.",
      semanticFunctions: ["TOKEN_GENERATION"],
      semanticOracle: null,
      commanderLegal: true,
      isLand: false,
    },
  },
  requirementPools: [
    {
      requirementId: "token_producers",
      primaryRole: "Token",
      requestedCount: 1,
      targetPoolSize: 10,
      oracleIds: ["horn"],
      seedOracleIds: [],
      semanticOracleIds: [],
    },
  ],
});
assert.equal(gandalfRepair.repairs.length, 1);
assert.equal(gandalfRepair.deck.nonlands[0]?.name, "Horn of Gondor");

console.log("professor-sol-directed-off-plan-repair-v1-1-1.selftest: ok");
