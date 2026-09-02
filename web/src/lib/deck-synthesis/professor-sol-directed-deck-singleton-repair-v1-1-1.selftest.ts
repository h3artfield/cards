import assert from "node:assert/strict";
import { repairSolDirectedDeckSingletonViolationsV111 } from "./professor-sol-directed-deck-singleton-repair-v1-1-1";
import { evaluateSingletonPool } from "./professor-commander-legality-v4-9-v1";
import type { LandPoolV11, RetrievalContractV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

const landPool: LandPoolV11 = {
  targetCount: 35,
  basicForestSlots: 14,
  basicSwampSlots: 0,
  entries: [
    {
      name: "Forest",
      oracleId: "basic:forest",
      isBasic: true,
      basicKind: "forest",
      maxCopies: 14,
      category: "basic",
      resolved: true,
    },
  ],
  nonBasicOracleIds: [],
};

const contract = {
  nonlandSlotsRequired: 64,
  landSlotsRequired: 35,
} as RetrievalContractV11;

const candidateDictionary = {
  "replacement-1": {
    oracleId: "replacement-1",
    name: "Cultivate",
    manaValue: 2,
    typeLine: "Sorcery",
    colorIdentity: ["G"],
    oracleText: "Search",
    semanticFunctions: [],
    semanticOracle: null,
    commanderLegal: true,
    isLand: false,
  },
  "replacement-2": {
    oracleId: "replacement-2",
    name: "Farseek",
    manaValue: 2,
    typeLine: "Sorcery",
    colorIdentity: ["G"],
    oracleText: "Search",
    semanticFunctions: [],
    semanticOracle: null,
    commanderLegal: true,
    isLand: false,
  },
};

const deck: SolDirectedConstructedDeckV11 = {
  commander: { name: "Test", oracleId: "test", colorIdentity: ["G"], typeLine: "Legendary Creature" },
  landCount: 35,
  nonlands: Array.from({ length: 63 }, (_, index) => ({
    oracleId: `card-${index}`,
    name: `Card ${index}`,
    primaryArchitectRequirement: "req",
    primaryRole: "Role",
    secondaryRoles: [],
    packageMembership: [],
    whyInThisDeck: "test",
    structuralNecessity: "FLEX" as const,
  })).concat([
    {
      oracleId: "wild-1",
      name: "Return of the Wildspeaker",
      primaryArchitectRequirement: "draw",
      primaryRole: "Draw",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "test",
      structuralNecessity: "FLEX" as const,
    },
    {
      oracleId: "wild-2",
      name: "Return of the Wildspeaker",
      primaryArchitectRequirement: "draw",
      primaryRole: "Draw",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "duplicate",
      structuralNecessity: "FLEX" as const,
    },
  ]),
  lands: [{ name: "Forest", copies: 35 }],
  primaryWinPaths: [],
  secondaryWinPaths: [],
  structuralNecessities: [],
  replaceableFlex: [],
};

const before = evaluateSingletonPool([
  ...deck.nonlands.map((card) => card.name),
  ...deck.lands.flatMap((land) => Array.from({ length: land.copies }, () => land.name)),
]);
assert.equal(before.pass, false);

const { deck: repaired, repairs } = repairSolDirectedDeckSingletonViolationsV111({
  deck,
  contract,
  landPool,
  candidateDictionary,
});

assert.ok(repairs.some((repair) => repair.includes("Return of the Wildspeaker")));
assert.equal(repaired.nonlands.length, 64);
const wildspeakers = repaired.nonlands.filter((card) => card.name === "Return of the Wildspeaker");
assert.equal(wildspeakers.length, 1);

const after = evaluateSingletonPool([
  ...repaired.nonlands.map((card) => card.name),
  ...repaired.lands.flatMap((land) => Array.from({ length: land.copies }, () => land.name)),
]);
assert.equal(after.pass, true);

console.log("professor-sol-directed-deck-singleton-repair-v1-1-1.selftest: ok");
