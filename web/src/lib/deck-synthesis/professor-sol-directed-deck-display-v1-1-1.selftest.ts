import assert from "node:assert/strict";
import {
  collectDeckCardNames,
  resolveCustomerGamePlanV111,
} from "./professor-sol-directed-deck-display-v1-1-1";
import type { SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

const deck = {
  commander: {
    name: "Gandalf the White",
    oracleId: "g",
    colorIdentity: ["W"],
    manaValue: null,
    oracleText: "",
    semanticFunctions: [],
    mechanics: [],
    resourcesProduced: [],
    resourcesConsumed: [],
    triggeredEvents: [],
    zoneRelationships: [],
    exploitOpportunities: [],
    provenance: [],
  },
  landCount: 30,
  lands: [{ name: "Plains", copies: 29 }, { name: "Wayfarer's Bauble", copies: 1 }],
  nonlands: [
    {
      name: "Horn of Gondor",
      oracleId: "1",
      primaryArchitectRequirement: "r",
      primaryRole: "",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "",
      structuralNecessity: "FLEX" as const,
    },
    {
      name: "Frodo, Determined Hero",
      oracleId: "2",
      primaryArchitectRequirement: "r",
      primaryRole: "",
      secondaryRoles: [],
      packageMembership: [],
      whyInThisDeck: "",
      structuralNecessity: "FLEX" as const,
    },
  ],
  primaryWinPaths: [],
  secondaryWinPaths: [],
  structuralNecessities: [],
  replaceableFlex: [],
  expectedPlayPattern:
    "Develop Plains and Wayfarer's Bauble, deploy Frodo and Horn of Gondor, then cast Gandalf with protection available.",
} satisfies SolDirectedConstructedDeckV11;

const resolved = resolveCustomerGamePlanV111({
  architectGamePlan: {
    earlyGame: ["Develop with Sol Ring and Arcane Signet."],
    midGame: ["Cast Gandalf."],
    lateGame: ["Attack."],
  },
  expectedPlayPattern: deck.expectedPlayPattern,
  deck,
  deckPreferences: "only use cards from Lord of the Rings set and The Hobbit set",
  professorRepairApplied: true,
});
assert.equal(resolved?.source, "constructor");
assert.ok(resolved?.earlyGame[0]?.includes("Wayfarer's Bauble"));

const deckNames = collectDeckCardNames(deck);
assert.ok(deckNames.has("Horn of Gondor"));

console.log("professor-sol-directed-deck-display-v1-1-1.selftest: ok");
