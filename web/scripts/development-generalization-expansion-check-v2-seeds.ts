/**
 * expansion-check-v2 — sealed holdout stratified across exposed + prior families.
 * Selected before v1.25 parser tuning; parserExecutionCount = 0.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type ExpansionCheckV2Stratum =
  | "wrong_ability_attachment"
  | "search_tutor_resolution"
  | "variable_lose_life_regression"
  | "token_copy_delayed"
  | "delayed_exile_referent"
  | "pronoun_coreference"
  | "modal_wording"
  | "quantified_action"
  | "zone_transition_wording"
  | "span_role_reminder_abstain";

export interface ExpansionCheckV2Seed {
  stratum: ExpansionCheckV2Stratum;
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

export const EXPANSION_CHECK_V2_SEEDS: ExpansionCheckV2Seed[] = [
  // Newly exposed families (13)
  {
    stratum: "wrong_ability_attachment",
    name: "Sarkhan, Fireblood",
    category: "exp-check-v2 loyalty-scope",
    selectionRule: "PW +1 discard/draw vs +1 mana vs −7 tokens",
    primitives: [
      { actionType: "draw", evidenceContains: "draw a card", loyaltyCost: "+1", optionalEffect: true },
      { actionType: "add_mana", evidenceContains: "Add two mana in any combination", loyaltyCost: "+1" },
      { actionType: "create_token", evidenceContains: "Create four 5/5 red Dragon creature tokens", loyaltyCost: "−7" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "wrong_ability_attachment",
    name: "Nicol Bolas, Planeswalker",
    category: "exp-check-v2 loyalty-scope",
    selectionRule: "PW +3 destroy vs −2 gain control vs −9 damage/discard/sacrifice",
    primitives: [
      { actionType: "destroy", evidenceContains: "Destroy target noncreature permanent", loyaltyCost: "+3" },
      { actionType: "deal_damage", evidenceContains: "deals 7 damage to target player or planeswalker", loyaltyCost: "−9" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "wrong_ability_attachment",
    name: "Zariel, Archduke of Avernus",
    category: "exp-check-v2 loyalty-scope",
    selectionRule: "PW +1 pump vs 0 devil vs −6 emblem",
    primitives: [
      { actionType: "create_token", evidenceContains: "Create a 1/1 red Devil creature token", loyaltyCost: "0" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "wrong_ability_attachment",
    name: "Kasmina, Enigma Sage",
    category: "exp-check-v2 loyalty-scope",
    selectionRule: "PW +2 scry vs −X fractal vs −8 tutor cast",
    primitives: [
      { actionType: "scry", evidenceContains: "Scry 1", loyaltyCost: "+2" },
      { actionType: "create_token", evidenceContains: "Create a 0/0 green and blue Fractal creature token", loyaltyCost: "−X" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "search_tutor_resolution",
    name: "Visage of Bolas",
    category: "exp-check-v2 lib-gy-tutor",
    selectionRule: "ETB optional lib/gy search for named PW",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    stratum: "search_tutor_resolution",
    name: "Sun-Blessed Mount",
    category: "exp-check-v2 lib-gy-tutor",
    selectionRule: "ETB optional lib/gy search for named PW",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    stratum: "search_tutor_resolution",
    name: "Vision Quest",
    category: "exp-check-v2 lib-gy-tutor",
    selectionRule: "Lib/gy search put artifact creature onto battlefield",
    primitives: [
      { actionType: "search_library", evidenceContains: "Search your library and/or graveyard" },
      { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "variable_lose_life_regression",
    name: "Alms of the Vein",
    category: "exp-check-v2 target-opponent-life",
    selectionRule: "Target opponent loses 3 life with madness",
    primitives: [{ actionType: "lose_life", evidenceContains: "Target opponent loses 3 life" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "variable_lose_life_regression",
    name: "Starving Revenant",
    category: "exp-check-v2 target-opponent-life",
    selectionRule: "Descend triggered target opponent loses life",
    primitives: [{ actionType: "lose_life", evidenceContains: "target opponent loses 1 life" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    stratum: "token_copy_delayed",
    name: "Octomancer",
    category: "exp-check-v2 token-copy-delayed",
    selectionRule: "End step copy creature token entered this turn",
    primitives: [
      { actionType: "create_token", evidenceContains: "create a token that's a copy of target creature token" },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    stratum: "token_copy_delayed",
    name: "Replication Technique",
    category: "exp-check-v2 token-copy-delayed",
    selectionRule: "Demonstrate create copy token",
    primitives: [{ actionType: "create_token", evidenceContains: "Create a token that's a copy of target permanent you control" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "token_copy_delayed",
    name: "See Double",
    category: "exp-check-v2 token-copy-delayed",
    selectionRule: "Copy target spell + create token copy of creature",
    primitives: [{ actionType: "create_token", evidenceContains: "Create a token that's a copy of target creature" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "delayed_exile_referent",
    name: "Moira and Teshar",
    category: "exp-check-v2 delayed-exile",
    selectionRule: "Historic cast return nonland permanent exile end step",
    primitives: [
      { actionType: "return_to_battlefield", evidenceContains: "return target nonland permanent card from your graveyard to the battlefield" },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },

  // Prior structural families + controls (9)
  {
    stratum: "pronoun_coreference",
    name: "Demonic Vigor",
    category: "exp-check-v2 pronoun",
    selectionRule: "When enchanted creature dies return that card",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    stratum: "pronoun_coreference",
    name: "Eldrazi Confluence",
    category: "exp-check-v2 pronoun",
    selectionRule: "Exile then return that permanent tapped",
    primitives: [{ actionType: "exile", evidenceContains: "Exile target nonland permanent" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "modal_wording",
    name: "Wail of the Forgotten",
    category: "exp-check-v2 modal",
    selectionRule: "Descend modal return/discard/look",
    primitives: [
      { actionType: "return_to_hand", evidenceContains: "Return target nonland permanent to its owner's hand" },
      { actionType: "discard", evidenceContains: "Target opponent discards a card" },
      { actionType: "draw", evidenceContains: "Put one of them into your hand" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "modal_wording",
    name: "Into the Roil",
    category: "exp-check-v2 modal",
    selectionRule: "Kicker bounce + optional draw",
    primitives: [
      { actionType: "return_to_hand", evidenceContains: "Return target nonland permanent to its owner's hand" },
      { actionType: "draw", evidenceContains: "draw a card", optionalEffect: true },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "quantified_action",
    name: "Soratami Mirror-Mage",
    category: "exp-check-v2 bounce",
    selectionRule: "Return lands cost bounce creature",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target creature to its owner's hand" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "quantified_action",
    name: "Venser's Diffusion",
    category: "exp-check-v2 bounce",
    selectionRule: "Return nonland permanent or suspended card",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target nonland permanent or suspended card to its owner's hand" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "zone_transition_wording",
    name: "Perilous Voyage",
    category: "exp-check-v2 bounce-scry",
    selectionRule: "Return nonland permanent + conditional scry",
    primitives: [
      { actionType: "return_to_hand", evidenceContains: "Return target nonland permanent you don't control to its owner's hand" },
      { actionType: "scry", evidenceContains: "scry 2" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "zone_transition_wording",
    name: "Into Thin Air",
    category: "exp-check-v2 bounce",
    selectionRule: "Affinity return artifact to hand",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target artifact to its owner's hand" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "span_role_reminder_abstain",
    name: "Quiet Purity",
    category: "exp-check-v2 control",
    selectionRule: "Baseline destroy enchantment",
    primitives: [{ actionType: "destroy", evidenceContains: "Destroy target enchantment" }],
    manualReviewConfirmed: true,
  },
];

export const EXPANSION_CHECK_V2_COUNT = EXPANSION_CHECK_V2_SEEDS.length;
