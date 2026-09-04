import assert from "node:assert/strict";
import {
  isLandBaseProfessorDefectV111,
  repairSolDirectedLandBaseV111,
} from "./professor-sol-directed-land-base-repair-v1-1-1";
import { basicLandColorIdentity, isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "./professor-sol-directed-head-professor-v1-1-1";
import type {
  LandPoolEntryV11,
  LandPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

const catalog = {
  byOracleId: new Map(),
} as unknown as DeckResolutionCatalog;

function basicEntry(name: string, maxCopies: number): LandPoolEntryV11 {
  const lower = name.toLowerCase();
  return {
    name,
    oracleId: `basic:${lower}`,
    isBasic: true,
    basicKind: lower === "forest" ? "forest" : lower === "swamp" ? "swamp" : null,
    maxCopies,
    category: "basic",
    resolved: true,
  };
}

function deckWithLands(args: {
  commanderName: string;
  colorIdentity: string[];
  lands: Array<{ name: string; copies: number }>;
}): SolDirectedConstructedDeckV11 {
  return {
    commander: {
      name: args.commanderName,
      oracleId: args.commanderName.toLowerCase().replace(/[^a-z]+/g, "-"),
      colorIdentity: args.colorIdentity,
      typeLine: "Legendary Creature",
    },
    landCount: args.lands.reduce((sum, land) => sum + land.copies, 0),
    lands: args.lands,
    nonlands: [],
    primaryWinPaths: [],
    secondaryWinPaths: [],
    structuralNecessities: [],
    replaceableFlex: [],
  } as unknown as SolDirectedConstructedDeckV11;
}

function offIdentityBasics(deck: SolDirectedConstructedDeckV11, colorIdentity: string[]): string[] {
  return deck.lands
    .filter(
      (land) =>
        land.copies > 0 &&
        isBasicLandName(land.name) &&
        !commanderLegalInIdentity(basicLandColorIdentity(land.name), colorIdentity),
    )
    .map((land) => `${land.name}x${land.copies}`);
}

console.log("professor-sol-directed-land-base-repair-v1-1-1 selftest");

const monoBlackLandPool: LandPoolV11 = {
  targetCount: 35,
  basicForestSlots: 0,
  basicSwampSlots: 20,
  entries: [basicEntry("Swamp", 20)],
  nonBasicOracleIds: [],
};

const monoBlackContract = {
  nonlandSlotsRequired: 64,
  landSlotsRequired: 35,
  landPlan: { architecture: [{ role: "basic swamp", count: 18 }] },
} as unknown as RetrievalContractV11;

const monoBlackDeck = deckWithLands({
  commanderName: "Nashi, Searcher in the Dark",
  colorIdentity: ["B"],
  lands: [
    { name: "Lotus Vale", copies: 1 },
    { name: "Ancient Ziggurat", copies: 1 },
    { name: "Swamp", copies: 10 },
    { name: "Command Tower", copies: 1 },
  ],
});

const monoBlackVerdict: SolDirectedHeadProfessorWholeDeckVerdictV111 = {
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

const monoBlackRepair = repairSolDirectedLandBaseV111({
  deck: monoBlackDeck,
  landPool: monoBlackLandPool,
  contract: monoBlackContract,
  catalog,
  professorVerdict: monoBlackVerdict,
});

check("professor-flagged high-risk lands are cut and replaced with in-identity basics", () => {
  assert.ok(monoBlackRepair.repairs.length > 0);
  assert.equal(monoBlackRepair.deck.lands.find((land) => land.name === "Lotus Vale"), undefined);
  assert.ok((monoBlackRepair.deck.lands.find((land) => land.name === "Swamp")?.copies ?? 0) > 10);
});

check("land-base wording in a professor verdict is recognised as a land-base defect", () => {
  assert.equal(isLandBaseProfessorDefectV111(monoBlackVerdict), true);
});

const GRUUL_IDENTITY = ["G", "R"];

const gruulContract = {
  nonlandSlotsRequired: 63,
  landSlotsRequired: 36,
  landPlan: { architecture: [{ role: "basic forest", count: 13 }] },
} as unknown as RetrievalContractV11;

check("a land pool carrying an off-identity basic never reaches the repaired deck", () => {
  const repaired = repairSolDirectedLandBaseV111({
    deck: deckWithLands({
      commanderName: "Omnath, Locus of Rage",
      colorIdentity: GRUUL_IDENTITY,
      lands: [
        { name: "Forest", copies: 24 },
        { name: "Stomping Ground", copies: 1 },
        { name: "Cinder Glade", copies: 1 },
      ],
    }),
    landPool: {
      targetCount: 36,
      basicForestSlots: 13,
      basicSwampSlots: 20,
      entries: [basicEntry("Forest", 20), basicEntry("Swamp", 20)],
      nonBasicOracleIds: [],
    },
    contract: gruulContract,
    catalog,
  });
  assert.deepEqual(offIdentityBasics(repaired.deck, GRUUL_IDENTITY), []);
});

check("off-identity basics already in the deck are converted to in-identity basics", () => {
  const repaired = repairSolDirectedLandBaseV111({
    deck: deckWithLands({
      commanderName: "Omnath, Locus of Rage",
      colorIdentity: GRUUL_IDENTITY,
      lands: [
        { name: "Forest", copies: 13 },
        { name: "Swamp", copies: 4 },
        { name: "Stomping Ground", copies: 1 },
        { name: "Cinder Glade", copies: 1 },
      ],
    }),
    landPool: {
      targetCount: 36,
      basicForestSlots: 13,
      basicSwampSlots: 0,
      entries: [basicEntry("Forest", 20)],
      nonBasicOracleIds: [],
    },
    contract: gruulContract,
    catalog,
  });
  assert.deepEqual(offIdentityBasics(repaired.deck, GRUUL_IDENTITY), []);
  assert.equal(repaired.deck.lands.find((land) => land.name === "Forest")?.copies, 17);
  assert.equal(repaired.deck.landCount, 19);
});

check("colorless basics stay legal under every color identity", () => {
  const repaired = repairSolDirectedLandBaseV111({
    deck: deckWithLands({
      commanderName: "Omnath, Locus of Rage",
      colorIdentity: GRUUL_IDENTITY,
      lands: [
        { name: "Forest", copies: 13 },
        { name: "Wastes", copies: 2 },
        { name: "Stomping Ground", copies: 1 },
      ],
    }),
    landPool: {
      targetCount: 36,
      basicForestSlots: 13,
      basicSwampSlots: 0,
      entries: [basicEntry("Forest", 20)],
      nonBasicOracleIds: [],
    },
    contract: gruulContract,
    catalog,
  });
  assert.equal(repaired.deck.lands.find((land) => land.name === "Wastes")?.copies, 2);
});

console.log(`\nprofessor-sol-directed-land-base-repair-v1-1-1 selftest passed (${n} checks)`);
