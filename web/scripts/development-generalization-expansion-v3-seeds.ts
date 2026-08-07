/**
 * development_generalization_expansion_v3 — family-level training mined from catalog.
 * Excludes all prior dev/expansion/validation/blind oracleIds.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type ExpansionV3Family =
  | "wrong_ability_attachment"
  | "search_tutor_resolution"
  | "variable_lose_life_regression"
  | "token_copy_delayed"
  | "delayed_exile_referent";

export interface ExpansionV3Seed {
  family: ExpansionV3Family;
  name: string;
  category: string;
  layout?: string;
  face?: string;
  selectionRule: string;
  primitives: Array<{
    actionType: PrimitiveActionType;
    evidenceContains: string;
    optional?: boolean;
    optionalEffect?: boolean;
    cardFace?: string;
    loyaltyCost?: string;
  }>;
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  forbidden?: PrimitiveActionType[];
  manualReviewConfirmed: true;
}

/** Training-only — 4–8 cards per newly exposed failure family. */
export const DEV_GENERALIZATION_EXPANSION_V3_SEEDS: ExpansionV3Seed[] = [
  // wrong_ability_attachment — loyalty line scoping (−X / multi-cost bleed)
  {
    family: "wrong_ability_attachment",
    name: "Tamiyo, Compleated Sage",
    category: "exp-v3 loyalty-scope",
    selectionRule: "PW +1 tap vs −X exile-copy-from-graveyard vs −7 artifact",
    primitives: [
      { actionType: "tap", evidenceContains: "Tap up to one target artifact or creature", loyaltyCost: "+1" },
      { actionType: "exile", evidenceContains: "Exile target nonland permanent card with mana value X from your graveyard", loyaltyCost: "−X" },
      { actionType: "create_token", evidenceContains: "Create a token that's a copy of that card", loyaltyCost: "−X" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "wrong_ability_attachment",
    name: "Jace, the Perfected Mind",
    category: "exp-v3 loyalty-scope",
    selectionRule: "PW +1 debuff vs −2 mill/draw vs −X mill",
    primitives: [
      { actionType: "mill", evidenceContains: "mills three cards", loyaltyCost: "−2" },
      { actionType: "draw", evidenceContains: "you draw three cards", loyaltyCost: "−2" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "wrong_ability_attachment",
    name: "Chandra, Flamecaller",
    category: "exp-v3 loyalty-scope",
    selectionRule: "PW +1 delayed exile tokens vs 0 draw vs −X damage",
    primitives: [
      { actionType: "create_token", evidenceContains: "Create two 3/1 red Elemental creature tokens", loyaltyCost: "+1" },
      { actionType: "deal_damage", evidenceContains: "deals X damage to each creature", loyaltyCost: "−X" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "wrong_ability_attachment",
    name: "Huatli, Warrior Poet",
    category: "exp-v3 loyalty-scope",
    selectionRule: "PW +2 gain life vs 0 token vs −X divided damage",
    primitives: [
      { actionType: "gain_life", evidenceContains: "You gain life equal to the greatest power", loyaltyCost: "+2" },
      { actionType: "deal_damage", evidenceContains: "deals X damage divided as you choose", loyaltyCost: "−X" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "wrong_ability_attachment",
    name: "Karn, Scion of Urza",
    category: "exp-v3 loyalty-scope",
    selectionRule: "PW +1 reveal split vs −1 silver counter return vs −2 construct",
    primitives: [
      { actionType: "draw", evidenceContains: "Put that card into your hand", loyaltyCost: "+1" },
      { actionType: "exile", evidenceContains: "exile the other with a silver counter", loyaltyCost: "+1" },
      { actionType: "create_token", evidenceContains: "Create a 0/0 colorless Construct", loyaltyCost: "−2" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "wrong_ability_attachment",
    name: "Elspeth, Sun's Champion",
    category: "exp-v3 loyalty-scope",
    selectionRule: "PW +1 tokens vs −3 destroy vs −7 emblem",
    primitives: [
      { actionType: "create_token", evidenceContains: "Create three 1/1 white Soldier creature tokens", loyaltyCost: "+1" },
      { actionType: "destroy", evidenceContains: "Destroy all creatures with power 4 or greater", loyaltyCost: "−3" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "wrong_ability_attachment",
    name: "Teferi, Temporal Archmage",
    category: "exp-v3 loyalty-scope",
    selectionRule: "PW +1 scry vs −1 untap vs −10 emblem",
    primitives: [
      { actionType: "draw", evidenceContains: "Put one of them into your hand", loyaltyCost: "+1" },
      { actionType: "untap", evidenceContains: "Untap up to four target permanents", loyaltyCost: "−1" },
    ],
    manualReviewConfirmed: true,
  },

  // search_tutor_resolution — library and/or graveyard compound tutors
  {
    family: "search_tutor_resolution",
    name: "Ashiok's Forerunner",
    category: "exp-v3 lib-gy-tutor",
    selectionRule: "ETB optional search library and/or graveyard for named PW",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "search_tutor_resolution",
    name: "Niambi, Faithful Healer",
    category: "exp-v3 lib-gy-tutor",
    selectionRule: "ETB optional search library and/or graveyard for named PW",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "search_tutor_resolution",
    name: "Liliana's Scorn",
    category: "exp-v3 lib-gy-tutor",
    selectionRule: "Destroy then optional lib/gy tutor for named card",
    primitives: [
      { actionType: "destroy", evidenceContains: "Destroy target creature" },
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "search_tutor_resolution",
    name: "Runeforge Champion",
    category: "exp-v3 lib-gy-tutor",
    selectionRule: "ETB optional lib/gy search for Rune",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "search_tutor_resolution",
    name: "Fang-Druid Summoner",
    category: "exp-v3 lib-gy-tutor",
    selectionRule: "ETB optional lib/gy search for creature with no abilities",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },

  // variable_lose_life_regression — target opponent loses N life (non-Each-opponent wording)
  {
    family: "variable_lose_life_regression",
    name: "Zulaport Chainmage",
    category: "exp-v3 target-opponent-life",
    selectionRule: "Cohort activated target opponent loses life",
    primitives: [{ actionType: "lose_life", evidenceContains: "Target opponent loses 2 life" }],
    manualReviewConfirmed: true,
  },
  {
    family: "variable_lose_life_regression",
    name: "Collective Brutality",
    category: "exp-v3 target-opponent-life",
    selectionRule: "Modal escalate target opponent loses life",
    primitives: [{ actionType: "lose_life", evidenceContains: "Target opponent loses 2 life" }],
    manualReviewConfirmed: true,
  },
  {
    family: "variable_lose_life_regression",
    name: "Ghost Council of Orzhova",
    category: "exp-v3 target-opponent-life",
    selectionRule: "ETB target opponent loses life parallel gain",
    primitives: [
      { actionType: "lose_life", evidenceContains: "target opponent loses 1 life" },
      { actionType: "gain_life", evidenceContains: "you gain 1 life" },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "variable_lose_life_regression",
    name: "Essence Depleter",
    category: "exp-v3 target-opponent-life",
    selectionRule: "Activated target opponent loses life",
    primitives: [{ actionType: "lose_life", evidenceContains: "Target opponent loses 1 life" }],
    manualReviewConfirmed: true,
  },

  // token_copy_delayed — copy token + delayed sacrifice/exile
  {
    family: "token_copy_delayed",
    name: "Minion Reflector",
    category: "exp-v3 token-copy-delayed",
    selectionRule: "Optional pay create copy with delayed sacrifice",
    primitives: [
      { actionType: "create_token", evidenceContains: "create a token that's a copy of that creature", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "token_copy_delayed",
    name: "Electroduplicate",
    category: "exp-v3 token-copy-delayed",
    selectionRule: "Create copy token with end-step sacrifice",
    primitives: [{ actionType: "create_token", evidenceContains: "Create a token that's a copy of target creature" }],
    manualReviewConfirmed: true,
  },
  {
    family: "token_copy_delayed",
    name: "Saheeli, the Gifted",
    category: "exp-v3 token-copy-delayed",
    selectionRule: "PW −7 copy each artifact token with delayed exile",
    primitives: [
      { actionType: "create_token", evidenceContains: "create a token that's a copy of it", loyaltyCost: "−7" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "token_copy_delayed",
    name: "Nemesis Trap",
    category: "exp-v3 token-copy-delayed",
    selectionRule: "Exile attacker create copy exile end step",
    primitives: [
      { actionType: "exile", evidenceContains: "Exile target attacking creature" },
      { actionType: "create_token", evidenceContains: "Create a token that's a copy of that creature" },
    ],
    manualReviewConfirmed: true,
  },

  // delayed_exile_referent — return/reanimate then exile referent at end step
  {
    family: "delayed_exile_referent",
    name: "Whip of Erebos",
    category: "exp-v3 delayed-exile",
    selectionRule: "Reanimate from graveyard exile at next end step",
    primitives: [
      { actionType: "return_to_battlefield", evidenceContains: "Return target creature card from your graveyard to the battlefield" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "delayed_exile_referent",
    name: "Kheru Lich Lord",
    category: "exp-v3 delayed-exile",
    selectionRule: "Upkeep optional reanimate random exile next end step",
    primitives: [
      { actionType: "return_to_battlefield", evidenceContains: "return a creature card at random from your graveyard to the battlefield", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "delayed_exile_referent",
    name: "Gruesome Encore",
    category: "exp-v3 delayed-exile",
    selectionRule: "Reanimate opponent creature exile end step",
    primitives: [
      { actionType: "return_to_battlefield", evidenceContains: "Put target creature card from an opponent's graveyard onto the battlefield" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "delayed_exile_referent",
    name: "Coalstoke Gearhulk",
    category: "exp-v3 delayed-exile",
    selectionRule: "ETB reanimate from graveyard exile next end step",
    primitives: [
      { actionType: "return_to_battlefield", evidenceContains: "put target creature card with mana value 4 or less from a graveyard onto the battlefield" },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
];

export const EXPANSION_V3_TRAINING_COUNT = DEV_GENERALIZATION_EXPANSION_V3_SEEDS.length;
