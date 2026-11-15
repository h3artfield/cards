/**
 * Spent-pilot mechanism-truth adjudication for three missing cases.
 * Oracle pins sourced from committed catalog-derived canonical facts — not dev36 strategy fixtures.
 */
import type { IndependentCommanderMechanismTruthCase } from "../../src/lib/deck-synthesis/independent-truth-types-v1";

export const SPENT_PILOT_MECHANISM_TRUTH_ADJUDICATION_V1_VERSION =
  "phase6a1-spent-pilot-mechanism-truth-adjudication-v1";

/** Catalog oracle pins — must match golden catalog / closure canonical facts. */
export const SPENT_PILOT_CATALOG_ORACLE_PINS = {
  "multi-muldrotha": {
    commander: "Muldrotha, the Gravetide",
    sourceOracleId: "e4625704-1d52-44e4-804f-2f45644d76ac",
    oracleText:
      "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard. (If a card has multiple permanent types, choose one as you play it.)",
    combinedColorIdentity: ["B", "G", "U"],
    bracket: 3 as const,
  },
  "blindv5-52-tokens": {
    commander: "Zaxara, the Exemplary",
    sourceOracleId: "a9946ea0-bf0e-4c9c-a3c6-21337a5029ab",
    oracleText:
      "Deathtouch\n{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.",
    combinedColorIdentity: ["B", "G", "U"],
    bracket: 3 as const,
  },
  "single-landfall-omnath": {
    commander: "Omnath, Locus of Rage",
    sourceOracleId: "1816eede-c5bd-49df-958f-a3af64cb2932",
    oracleText:
      "Landfall — Whenever a land you control enters, create a 5/5 red and green Elemental creature token.\nWhenever Omnath or another Elemental you control dies, Omnath deals 3 damage to any target.",
    combinedColorIdentity: ["G", "R"],
    bracket: 3 as const,
  },
} as const;

function muldrothaCase(): IndependentCommanderMechanismTruthCase {
  const pin = SPENT_PILOT_CATALOG_ORACLE_PINS["multi-muldrotha"];
  const landSpan =
    "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard.";
  return {
    caseId: "multi-muldrotha",
    commanders: [pin.commander],
    commandZoneConfiguration: "single_commander",
    combinedColorIdentity: [...pin.combinedColorIdentity],
    bracket: pin.bracket,
    commanderOracleTexts: [
      {
        sourceOracleId: pin.sourceOracleId,
        name: pin.commander,
        oracleText: pin.oracleText,
      },
    ],
    crossMemberRelationshipsAsSupplied: [],
    independentMechanismFacts: [
      {
        mechanismId: "muldrotha-graveyard-land-play",
        mechanismType: "PLAY_PERMISSION",
        evidenceSpan: landSpan,
        trigger: "DURING_EACH_OF_YOUR_TURNS",
        actions: [
          {
            type: "PLAY_FROM_GRAVEYARD",
            object: "LAND_CARD",
            zone: "GRAVEYARD",
            quantity: 1,
            perTurnLimit: 1,
          },
        ],
      },
      {
        mechanismId: "muldrotha-graveyard-permanent-cast",
        mechanismType: "PLAY_PERMISSION",
        evidenceSpan: landSpan,
        trigger: "DURING_EACH_OF_YOUR_TURNS",
        actions: [
          {
            type: "CAST_FROM_GRAVEYARD",
            object: "PERMANENT_SPELL",
            zone: "GRAVEYARD",
            constraint: "ONE_SPELL_OF_EACH_PERMANENT_TYPE",
          },
        ],
      },
    ],
    factStatus: "INDEPENDENTLY_ADJUDICATED",
  };
}

function zaxaraCase(): IndependentCommanderMechanismTruthCase {
  const pin = SPENT_PILOT_CATALOG_ORACLE_PINS["blindv5-52-tokens"];
  return {
    caseId: "blindv5-52-tokens",
    commanders: [pin.commander],
    commandZoneConfiguration: "single_commander",
    combinedColorIdentity: [...pin.combinedColorIdentity],
    bracket: pin.bracket,
    commanderOracleTexts: [
      {
        sourceOracleId: pin.sourceOracleId,
        name: pin.commander,
        oracleText: pin.oracleText,
      },
    ],
    crossMemberRelationshipsAsSupplied: [],
    independentMechanismFacts: [
      {
        mechanismId: "zaxara-deathtouch",
        mechanismType: "KEYWORD",
        evidenceSpan: "Deathtouch",
        keyword: "DEATHTOUCH",
      },
      {
        mechanismId: "zaxara-mana-activation",
        mechanismType: "ACTIVATED_ABILITY",
        evidenceSpan: "{T}: Add two mana of any one color.",
        cost: ["TAP_SELF"],
        actions: [
          {
            type: "ADD_MANA",
            amount: 2,
            colorChoice: "ANY_ONE_COLOR",
          },
        ],
      },
      {
        mechanismId: "zaxara-x-spell-hydra",
        mechanismType: "TRIGGERED_ABILITY",
        evidenceSpan:
          "Whenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.",
        trigger: "YOU_CAST_SPELL_WITH_X_IN_MANA_COST",
        actions: [
          {
            type: "CREATE_TOKEN",
            token: "0/0 GREEN HYDRA CREATURE",
            quantity: 1,
          },
          {
            type: "PUT_COUNTER",
            counterType: "+1/+1",
            quantity: "X_FROM_SPELL_MANA_COST",
            recipient: "THAT_TOKEN",
          },
        ],
      },
    ],
    factStatus: "INDEPENDENTLY_ADJUDICATED",
  };
}

function omnathCase(): IndependentCommanderMechanismTruthCase {
  const pin = SPENT_PILOT_CATALOG_ORACLE_PINS["single-landfall-omnath"];
  return {
    caseId: "single-landfall-omnath",
    commanders: [pin.commander],
    commandZoneConfiguration: "single_commander",
    combinedColorIdentity: [...pin.combinedColorIdentity],
    bracket: pin.bracket,
    commanderOracleTexts: [
      {
        sourceOracleId: pin.sourceOracleId,
        name: pin.commander,
        oracleText: pin.oracleText,
      },
    ],
    crossMemberRelationshipsAsSupplied: [],
    independentMechanismFacts: [
      {
        mechanismId: "omnath-landfall-elemental",
        mechanismType: "TRIGGERED_ABILITY",
        evidenceSpan:
          "Landfall — Whenever a land you control enters, create a 5/5 red and green Elemental creature token.",
        trigger: "LANDFALL",
        actions: [
          {
            type: "CREATE_TOKEN",
            token: "5/5 RED AND GREEN ELEMENTAL CREATURE",
            quantity: 1,
          },
        ],
      },
      {
        mechanismId: "omnath-elemental-death-damage",
        mechanismType: "TRIGGERED_ABILITY",
        evidenceSpan:
          "Whenever Omnath or another Elemental you control dies, Omnath deals 3 damage to any target.",
        trigger: "OMNATH_OR_ELEMENTAL_YOU_CONTROL_DIES",
        actions: [
          {
            type: "DEAL_DAMAGE",
            quantity: 3,
            target: "ANY_TARGET",
          },
        ],
      },
    ],
    factStatus: "INDEPENDENTLY_ADJUDICATED",
  };
}

export function buildSpentPilotMechanismTruthCases(): IndependentCommanderMechanismTruthCase[] {
  return [muldrothaCase(), zaxaraCase(), omnathCase()];
}
