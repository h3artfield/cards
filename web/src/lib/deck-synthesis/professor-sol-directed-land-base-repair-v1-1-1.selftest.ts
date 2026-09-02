import assert from "node:assert/strict";
import {
  isLandBaseProfessorDefectV111,
  repairSolDirectedLandBaseV111,
} from "./professor-sol-directed-land-base-repair-v1-1-1";
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "./professor-sol-directed-head-professor-v1-1-1";
import type { LandPoolV11, RetrievalContractV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";

const landPool: LandPoolV11 = {
  targetCount: 35,
  basicForestSlots: 0,
  basicSwampSlots: 20,
  entries: [
    {
      name: "Swamp",
      oracleId: "basic:swamp",
      isBasic: true,
      basicKind: "swamp",
      maxCopies: 20,
      category: "basic",
      resolved: true,
    },
  ],
  nonBasicOracleIds: [],
};

const contract = {
  nonlandSlotsRequired: 64,
  landSlotsRequired: 35,
  landPlan: { architecture: [{ role: "basic swamp", count: 18 }] },
} as RetrievalContractV11;

const catalog = {
  byOracleId: new Map(),
} as unknown as DeckResolutionCatalog;

const deck: SolDirectedConstructedDeckV11 = {
  commander: { name: "Nashi, Searcher in the Dark", oracleId: "nashi", colorIdentity: ["B"], typeLine: "Legendary Creature" },
  landCount: 35,
  nonlands: [],
  lands: [
    { name: "Lotus Vale", copies: 1 },
    { name: "Ancient Ziggurat", copies: 1 },
    { name: "Swamp", copies: 10 },
    { name: "Command Tower", copies: 1 },
  ],
  primaryWinPaths: [],
  secondaryWinPaths: [],
  structuralNecessities: [],
  replaceableFlex: [],
};

const verdict: SolDirectedHeadProfessorWholeDeckVerdictV111 = {
  classification: "CONSTRUCTION_DEFECT",
  bracketFit: "",
  strategyCoherence: "",
  manaAssessment: "",
  earlyMidLateGameAssessment: "",
  winConditionAssessment: "",
  interactionAssessment: "",
  resilienceAssessment: "",
  offPlanCards: ["Lotus Vale", "Ancient Ziggurat"],
  requiredChanges: ["Remove Lotus Vale from the primary mana base."],
  optionalChanges: [],
  grade: "C-",
  reasoningSummary: "",
  selfBuildQuestionAnswer: "",
};

const { deck: repaired, repairs } = repairSolDirectedLandBaseV111({
  deck,
  landPool,
  contract,
  catalog,
  professorVerdict: verdict,
});

assert.ok(repairs.length > 0);
assert.equal(repaired.lands.find((land) => land.name === "Lotus Vale"), undefined);
assert.ok((repaired.lands.find((land) => land.name === "Swamp")?.copies ?? 0) > 10);
assert.equal(isLandBaseProfessorDefectV111(verdict), true);

console.log("professor-sol-directed-land-base-repair-v1-1-1.selftest: ok");
