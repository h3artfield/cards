/**
 * expansion-training-v4 — family grammar from check-v2 abstract failures.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type ExpansionV4Family =
  | "loyalty_ability_scoping"
  | "search_destination_chain"
  | "modal_spree_structure"
  | "pronoun_coreference"
  | "conditional_zone_transition";

export interface ExpansionV4Seed {
  family: ExpansionV4Family;
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
    abilityIndex?: number;
    optionId?: string;
  }>;
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  forbidden?: PrimitiveActionType[];
  manualReviewConfirmed: true;
}

export const DEV_GENERALIZATION_EXPANSION_V4_SEEDS: ExpansionV4Seed[] = [
  // loyalty_ability_scoping (5)
  {
    family: "loyalty_ability_scoping",
    name: "Jace Reawakened",
    category: "exp-v4 loyalty-scope",
    selectionRule: "Dual +1 lines: draw/discard vs plot exile; −6 copy",
    primitives: [
      { actionType: "draw", evidenceContains: "Draw a card", loyaltyCost: "+1", abilityIndex: 1 },
      { actionType: "discard", evidenceContains: "discard a card", loyaltyCost: "+1", abilityIndex: 1 },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "loyalty_ability_scoping",
    name: "Nahiri, the Unforgiving",
    category: "exp-v4 loyalty-scope",
    selectionRule: "Dual +1 attack restriction vs discard/draw; 0 graveyard copy",
    primitives: [
      { actionType: "discard", evidenceContains: "Discard a card", loyaltyCost: "+1", abilityIndex: 2 },
      { actionType: "draw", evidenceContains: "draw a card", loyaltyCost: "+1", abilityIndex: 2 },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "loyalty_ability_scoping",
    name: "Vraska, Betrayal's Sting",
    category: "exp-v4 loyalty-scope",
    selectionRule: "0 draw/proliferate vs −2 transform vs −9 poison",
    primitives: [
      { actionType: "draw", evidenceContains: "You draw a card", loyaltyCost: "0" },
      { actionType: "lose_life", evidenceContains: "lose 1 life", loyaltyCost: "0" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "loyalty_ability_scoping",
    name: "Tezzeret, Cruel Captain",
    category: "exp-v4 loyalty-scope",
    selectionRule: "0 untap/pump vs −3 artifact tutor vs −7 emblem",
    primitives: [
      { actionType: "untap", evidenceContains: "Untap target artifact or creature", loyaltyCost: "0" },
      { actionType: "search_library", evidenceContains: "Search your library for an artifact card", loyaltyCost: "−3" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "loyalty_ability_scoping",
    name: "Elspeth, Undaunted Hero",
    category: "exp-v4 loyalty-scope",
    selectionRule: "+2 counters vs −2 lib/gy put battlefield vs −8 devotion pump",
    primitives: [
      { actionType: "put_counter", evidenceContains: "Put a +1/+1 counter on each of up to two target creatures", loyaltyCost: "+2" },
      { actionType: "search_library", evidenceContains: "Search your library and/or graveyard", loyaltyCost: "−2" },
      { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield", loyaltyCost: "−2" },
    ],
    manualReviewConfirmed: true,
  },

  // search_destination_chain (5)
  {
    family: "search_destination_chain",
    name: "The Hunger Tide Rises",
    category: "exp-v4 search-put",
    layout: "saga",
    selectionRule: "Saga IV lib/gy search put creature onto battlefield",
    primitives: [
      { actionType: "search_library", evidenceContains: "Search your library and/or graveyard" },
      { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "search_destination_chain",
    name: "Invasion of Ikoria // Zilortha, Apex of Ikoria",
    category: "exp-v4 search-put",
    layout: "split",
    face: "front",
    selectionRule: "Siege ETB lib/gy search put non-Human onto battlefield",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", cardFace: "front" },
      { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield", cardFace: "front" },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "search_destination_chain",
    name: "Sanctum of All",
    category: "exp-v4 search-put",
    selectionRule: "Upkeep lib/gy search Shrine put onto battlefield",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
      { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "search_destination_chain",
    name: "Grand Master of Flowers",
    category: "exp-v4 search-put",
    selectionRule: "Second +1 lib/gy search Monk put hand",
    primitives: [
      { actionType: "search_library", evidenceContains: "Search your library and/or graveyard", loyaltyCost: "+1", abilityIndex: 2 },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "search_destination_chain",
    name: "Domri's Nodorog",
    category: "exp-v4 search-hand",
    selectionRule: "ETB lib/gy search named card put hand",
    primitives: [
      { actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true },
    ],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },

  // modal_spree_structure (5)
  {
    family: "modal_spree_structure",
    name: "Unfortunate Accident",
    category: "exp-v4 spree",
    selectionRule: "Spree destroy vs create token — costs are L1 only",
    primitives: [
      { actionType: "destroy", evidenceContains: "Destroy target creature", optionId: "opt-1" },
      { actionType: "create_token", evidenceContains: "Create a 1/1 red Mercenary creature token", optionId: "opt-2" },
    ],
    forbidden: ["add_mana"],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "Rush of Dread",
    category: "exp-v4 spree",
    selectionRule: "Spree sacrifice/discard/lose-life half options",
    primitives: [{ actionType: "discard", evidenceContains: "Target opponent discards half the cards in their hand", optionId: "opt-2" }],
    forbidden: ["sacrifice", "lose_life"],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "Requisition Raid",
    category: "exp-v4 spree",
    selectionRule: "Spree destroy artifact/enchantment or put counter",
    primitives: [
      { actionType: "destroy", evidenceContains: "Destroy target artifact", optionId: "opt-1" },
      { actionType: "destroy", evidenceContains: "Destroy target enchantment", optionId: "opt-2" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "One Last Job",
    category: "exp-v4 spree",
    selectionRule: "Spree return creature/Mount/Aura from graveyard",
    primitives: [
      { actionType: "return_to_battlefield", evidenceContains: "Return target creature card from your graveyard to the battlefield", optionId: "opt-1" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "Smuggler's Surprise",
    category: "exp-v4 spree",
    selectionRule: "Spree discard/draw/token options",
    primitives: [
      { actionType: "mill", evidenceContains: "Mill four cards", optionId: "opt-1" },
      { actionType: "draw", evidenceContains: "put up to two creature and/or land cards from among the milled cards into your hand", optionId: "opt-1" },
    ],
    forbidden: ["put_onto_battlefield"],
    manualReviewConfirmed: true,
  },

  // pronoun_coreference (4)
  {
    family: "pronoun_coreference",
    name: "Squee's Embrace",
    category: "exp-v4 pronoun",
    selectionRule: "When enchanted creature dies return that card",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "pronoun_coreference",
    name: "Together Forever",
    category: "exp-v4 pronoun",
    selectionRule: "Activated: when creature dies return that card",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }],
    manualReviewConfirmed: true,
  },
  {
    family: "pronoun_coreference",
    name: "Puppet Master",
    category: "exp-v4 pronoun",
    selectionRule: "When enchanted creature dies return that card to hand",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    family: "pronoun_coreference",
    name: "Corrupted Zendikon",
    category: "exp-v4 pronoun",
    selectionRule: "When land dies return that card to hand",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },

  // conditional_zone_transition (4)
  {
    family: "conditional_zone_transition",
    name: "Fading Hope",
    category: "exp-v4 conditional-bounce",
    selectionRule: "Return creature + conditional scry if MV ≤3",
    primitives: [
      { actionType: "return_to_hand", evidenceContains: "Return target creature to its owner's hand" },
      { actionType: "scry", evidenceContains: "scry 1" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "conditional_zone_transition",
    name: "Confounding Riddle",
    category: "exp-v4 modal-look",
    selectionRule: "Modal look partition + counter unless sibling option",
    primitives: [{ actionType: "draw", evidenceContains: "Put one of them into your hand", optionId: "opt-1" }],
    manualReviewConfirmed: true,
  },
  {
    family: "conditional_zone_transition",
    name: "Angelic Shield",
    category: "exp-v4 sacrifice-bounce",
    selectionRule: "Sacrifice: return target creature to hand",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target creature to its owner's hand" }],
    manualReviewConfirmed: true,
  },
  {
    family: "conditional_zone_transition",
    name: "Vapor Snag",
    category: "exp-v4 instant-bounce",
    selectionRule: "Return creature + controller loses life rider",
    primitives: [
      { actionType: "return_to_hand", evidenceContains: "Return target creature to its owner's hand" },
      { actionType: "lose_life", evidenceContains: "Its controller loses 1 life" },
    ],
    manualReviewConfirmed: true,
  },
];

export const EXPANSION_V4_TRAINING_COUNT = DEV_GENERALIZATION_EXPANSION_V4_SEEDS.length;
