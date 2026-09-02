import assert from "node:assert/strict";
import { repairSolDirectedConstructedDeckCountsV111 } from "./professor-sol-directed-deck-count-repair-v1-1-1";
import type { LandPoolV11, RetrievalContractV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

const commander = {
  oracleId: "cmd",
  name: "Test Commander",
  colorIdentity: ["G"],
  manaValue: 3,
  oracleText: "",
  semanticFunctions: [],
  mechanics: [],
  resourcesProduced: [],
  resourcesConsumed: [],
  triggeredEvents: [],
  zoneRelationships: [],
  exploitOpportunities: [],
  provenance: [],
};

const contract: RetrievalContractV11 = {
  version: "professor-sol-directed-types-v1-1",
  strategicThesis: "",
  earlyGamePlan: [],
  midGamePlan: [],
  lateGamePlan: [],
  winLines: [],
  failureRecoveryPlan: [],
  nonlandSlotsRequired: 64,
  landSlotsRequired: 35,
  cardRequirements: [],
  landPlan: { target: 35, minimum: 35, maximum: 35 },
  comboAndPowerGuardrails: { prohibitedCards: [] },
  retrievalRules: [],
};

const landPool: LandPoolV11 = {
  targetCount: 35,
  basicForestSlots: 20,
  basicSwampSlots: 0,
  entries: [
    {
      name: "Forest",
      oracleId: "basic:forest",
      isBasic: true,
      basicKind: "forest",
      maxCopies: 20,
      category: "basic",
      resolved: true,
    },
  ],
  nonBasicOracleIds: [],
};

const deck: SolDirectedConstructedDeckV11 = {
  commander,
  landCount: 34,
  lands: [{ name: "Forest", copies: 19 }, { name: "Command Tower", copies: 15 }],
  nonlands: Array.from({ length: 64 }, (_, i) => ({
    oracleId: `n${i}`,
    name: `Card ${i}`,
    primaryArchitectRequirement: "ramp",
    primaryRole: "ramp",
    secondaryRoles: [],
    packageMembership: [],
    whyInThisDeck: "",
    structuralNecessity: "FLEX" as const,
  })),
  primaryWinPaths: [],
  secondaryWinPaths: [],
  expectedPlayPattern: "",
  structuralNecessities: [],
  replaceableFlex: [],
};

const { deck: repaired, repairs } = repairSolDirectedConstructedDeckCountsV111({ deck, contract, landPool });
assert.equal(repaired.nonlands.length, 64);
assert.equal(repaired.lands.reduce((s, l) => s + l.copies, 0), 35);
assert.ok(repairs.some((r) => r.includes("basic land")));
console.log("PASS deck count repair — 64+34 normalized to 64+35");
