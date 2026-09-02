/**
 * Professor v4.17 — requirement family fixture candidates for cheap acceptance.
 */
import type { BrewRequirementV417 } from "./professor-brew-blueprint-v4-17-v1";
import { bracketQualityContractV417 } from "./professor-brew-blueprint-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";
import type { RequirementCandidateInputV417 } from "./professor-requirement-candidate-v4-17-v1";
import { functionalTokenForFamily } from "./professor-requirement-materializer-v4-17-v1";

export const FAMILY_FIXTURE_CANDIDATES = {
  INTERACTION: {
    eligible: {
      oracleId: "oid-counterspell",
      name: "Counterspell",
      manaValue: 2,
      colors: ["U"],
      typeLine: "Instant",
      oracleText: "Counter target spell.",
    },
    ineligible: {
      oracleId: "oid-dark-ritual",
      name: "Dark Ritual",
      manaValue: 1,
      colors: ["B"],
      typeLine: "Instant",
      oracleText: "Add {B}{B}{B}.",
    },
  },
  ACCELERATION: {
    eligible: {
      oracleId: "oid-cultivate",
      name: "Cultivate",
      manaValue: 3,
      colors: ["G"],
      typeLine: "Sorcery",
      oracleText: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
    },
    ineligible: {
      oracleId: "oid-vanilla",
      name: "Vanilla Creature",
      manaValue: 2,
      colors: ["G"],
      typeLine: "Creature",
      oracleText: "",
    },
  },
  PROTECTION: {
    eligible: {
      oracleId: "oid-lightning-greaves",
      name: "Lightning Greaves",
      manaValue: 2,
      colors: [],
      typeLine: "Artifact — Equipment",
      oracleText: "Equipped creature has hexproof and haste. Equip {0}",
    },
    ineligible: {
      oracleId: "oid-giant-growth",
      name: "Giant Growth",
      manaValue: 1,
      colors: ["G"],
      typeLine: "Instant",
      oracleText: "Target creature gets +3/+3 until end of turn.",
    },
  },
  CARD_VELOCITY: {
    eligible: {
      oracleId: "oid-ancestral-recall",
      name: "Ancestral Recall",
      manaValue: 1,
      colors: ["U"],
      typeLine: "Instant",
      oracleText: "Draw three cards.",
    },
    ineligible: {
      oracleId: "oid-shock",
      name: "Shock",
      manaValue: 1,
      colors: ["R"],
      typeLine: "Instant",
      oracleText: "Shock deals 2 damage to any target.",
    },
  },
  ACCESS: {
    eligible: {
      oracleId: "oid-demonic-tutor",
      name: "Demonic Tutor",
      manaValue: 2,
      colors: ["B"],
      typeLine: "Sorcery",
      oracleText: "Search your library for a card, put that card into your hand, then shuffle.",
    },
    ineligible: {
      oracleId: "oid-rampant-growth",
      name: "Rampant Growth",
      manaValue: 2,
      colors: ["G"],
      typeLine: "Sorcery",
      oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.",
    },
  },
  WIN_COMPONENT: {
    eligible: {
      oracleId: "oid-thassa",
      name: "Thassa's Oracle",
      manaValue: 2,
      colors: ["U"],
      typeLine: "Creature — Merfolk Wizard",
      oracleText: "When Thassa's Oracle enters, look at the top X cards of your library, where X is your devotion to blue. You win the game.",
    },
    ineligible: {
      oracleId: "oid-bear",
      name: "Grizzly Bears",
      manaValue: 2,
      colors: ["G"],
      typeLine: "Creature — Bear",
      oracleText: "",
    },
  },
  ENGINE_ENABLER: {
    eligible: {
      oracleId: "oid-ashnod",
      name: "Ashnod's Altar",
      manaValue: 3,
      colors: [],
      typeLine: "Artifact",
      oracleText: "Sacrifice a creature: Add {C}{C}.",
    },
    ineligible: {
      oracleId: "oid-llanowar",
      name: "Llanowar Elves",
      manaValue: 1,
      colors: ["G"],
      typeLine: "Creature — Elf Druid",
      oracleText: "{T}: Add {G}.",
    },
  },
} as const satisfies Record<string, { eligible: RequirementCandidateInputV417; ineligible: RequirementCandidateInputV417 }>;

export function buildFamilyRequirementV417(family: keyof typeof FAMILY_FIXTURE_CANDIDATES): BrewRequirementV417 {
  const fn = family === "ENGINE_ENABLER" ? "ENGINE_ENABLER" : family;
  return {
    requirementId: `req-${family.toLowerCase()}-test`,
    blueprintRevisionId: 0,
    family: fn as BrewRequirementV417["family"],
    purpose: `Test ${family} requirement`,
    priority: 80,
    physicalSlotsNeeded: { min: 1, preferred: 1, max: 2 },
    requiredFunctions: [fn as BrewRequirementV417["requiredFunctions"][number]],
    requiredMechanics: [],
    hardRequirements: [
      { constraintId: "legal", description: "Legal", semanticToken: functionalTokenForFamily(fn as never) },
    ],
    preferredRequirements: [],
    acceptableFunctionalAlternatives: [],
    hardConstraints: ["legal_in_color_identity"],
    softPreferences: [],
    packageIds: [],
    bracketQualityContract: bracketQualityContractV417(4),
    requirementBracketContract: requirementBracketContractV417(fn as never, 4),
    currentCoverage: 0,
    targetCoverage: 1,
    selectedCardIds: [],
    status: "OPEN",
  };
}
