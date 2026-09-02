import assert from "node:assert/strict";
import { repairArchitectRequirementCountsV111 } from "./professor-sol-directed-architect-count-repair-v1-1-1";
import type { RetrievalContractV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

const contract = {
  nonlandSlotsRequired: 4,
  landSlotsRequired: 0,
  cardRequirements: [
    { requirementId: "mono_white_interaction", requestedCount: 9, primaryRole: "Interaction" },
    { requirementId: "combat_finishers", requestedCount: 4, primaryRole: "Finisher" },
  ],
} as RetrievalContractV11;

const deck: SolDirectedConstructedDeckV11 = {
  commander: { name: "Gandalf the White", oracleId: "gandalf", colorIdentity: ["W"], typeLine: "Legendary Creature" },
  landCount: 0,
  lands: [],
  nonlands: [
    ...Array.from({ length: 10 }, (_, i) => ({
      oracleId: `interaction-${i}`,
      name: `Interaction ${i}`,
      primaryArchitectRequirement: "mono_white_interaction",
      primaryRole: "Interaction",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "test",
      structuralNecessity: "REQUIRED" as const,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      oracleId: `finisher-${i}`,
      name: `Finisher ${i}`,
      primaryArchitectRequirement: "combat_finishers",
      primaryRole: "Finisher",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "test",
      structuralNecessity: "REQUIRED" as const,
    })),
  ],
  primaryWinPaths: [],
  secondaryWinPaths: [],
  structuralNecessities: [],
  replaceableFlex: [],
};

const { deck: repaired, repairs } = repairArchitectRequirementCountsV111({
  deck,
  contract,
  candidateDictionary: {
    "finisher-new": {
      oracleId: "finisher-new",
      name: "Finisher New",
      manaValue: 4,
      typeLine: "Creature",
      colorIdentity: ["W"],
      oracleText: "",
      semanticFunctions: ["COMBAT"],
      semanticOracle: null,
      commanderLegal: true,
      isLand: false,
    },
  },
  requirementPools: [
    {
      requirementId: "combat_finishers",
      primaryRole: "Finisher",
      requestedCount: 4,
      targetPoolSize: 10,
      oracleIds: ["finisher-new"],
      seedOracleIds: [],
      semanticOracleIds: [],
    },
  ],
});

assert.ok(repairs.length > 0);
assert.equal(
  repaired.nonlands.filter((card) => card.primaryArchitectRequirement === "mono_white_interaction").length,
  9,
);
assert.equal(
  repaired.nonlands.filter((card) => card.primaryArchitectRequirement === "combat_finishers").length,
  4,
);
console.log("professor-sol-directed-architect-count-repair-v1-1-1.selftest: ok");
