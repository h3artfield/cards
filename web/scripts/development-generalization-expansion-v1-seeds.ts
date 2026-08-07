/**
 * development_generalization_expansion_v1 seeds — genuine parser families, zero benchmark overlap.
 * Evidence verified against catalogOracleCards; oracleIds checked via probe-oracle-overlap.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type ExpansionFamily =
  | "multiface_structure"
  | "pronoun_coreference"
  | "unusual_imperative_verb"
  | "modal_wording"
  | "quantified_action"
  | "zone_transition_wording"
  | "search_tutor_resolution"
  | "delayed_later_action"
  | "optionality_attachment"
  | "wrong_ability_attachment"
  | "static_cast_permission_leak"
  | "variable_lose_life_regression"
  | "span_role_reminder_abstain";

export type ExpansionSplit = "expansion-training" | "expansion-check";

export interface ExpansionSeed {
  family: ExpansionFamily;
  split: ExpansionSplit;
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
  }>;
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  forbidden?: PrimitiveActionType[];
  manualReviewConfirmed: true;
}

export const DEV_GENERALIZATION_EXPANSION_V1_SEEDS: ExpansionSeed[] = [
  // multiface_structure (4)
  { family: "multiface_structure", split: "expansion-training", name: "Witch Enchanter // Witch-Blessed Meadow", category: "exp-v1 multiface", layout: "split", face: "front", selectionRule: "split: destroy on creature face", primitives: [{ actionType: "destroy", evidenceContains: "destroy target artifact or enchantment", cardFace: "front" }], manualReviewConfirmed: true },
  { family: "multiface_structure", split: "expansion-training", name: "Witch Enchanter // Witch-Blessed Meadow", category: "exp-v1 multiface", layout: "split", face: "back", selectionRule: "split: mana on land face", primitives: [{ actionType: "add_mana", evidenceContains: "Add {W}", cardFace: "back" }], manualReviewConfirmed: true },
  { family: "multiface_structure", split: "expansion-training", name: "Azusa's Many Journeys // Likeness of the Seeker", category: "exp-v1 multiface", layout: "saga", selectionRule: "saga chapter gain life + return transformed", primitives: [{ actionType: "gain_life", evidenceContains: "You gain 3 life" }], manualReviewConfirmed: true },
  { family: "multiface_structure", split: "expansion-check", name: "Azusa's Many Journeys // Likeness of the Seeker", category: "exp-v1 multiface", layout: "saga", selectionRule: "saga return to battlefield transformed", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "return it to the battlefield transformed" }], manualReviewConfirmed: true },

  // pronoun_coreference (4)
  { family: "pronoun_coreference", split: "expansion-training", name: "Blur", category: "exp-v1 pronoun", selectionRule: "exile + return that card", primitives: [{ actionType: "exile", evidenceContains: "Exile target creature you control" }, { actionType: "return_to_battlefield", evidenceContains: "return that card to the battlefield" }], manualReviewConfirmed: true },
  { family: "pronoun_coreference", split: "expansion-training", name: "Greasefang, Okiba Boss", category: "exp-v1 pronoun", selectionRule: "return Vehicle + return to hand at end step", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "return target Vehicle card from your graveyard to the battlefield" }, { actionType: "return_to_hand", evidenceContains: "Return it to its owner's hand" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { family: "pronoun_coreference", split: "expansion-training", name: "Thassa, Deep-Dwelling", category: "exp-v1 pronoun", selectionRule: "exile + return that card end step", primitives: [{ actionType: "exile", evidenceContains: "exile up to one other target creature you control" }, { actionType: "return_to_battlefield", evidenceContains: "return that card to the battlefield" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { family: "pronoun_coreference", split: "expansion-check", name: "Cogwork Assembler", category: "exp-v1 pronoun", selectionRule: "Create token copy of target artifact", primitives: [{ actionType: "copy", evidenceContains: "copy of target artifact" }], manualReviewConfirmed: true },

  // unusual_imperative_verb (4)
  { family: "unusual_imperative_verb", split: "expansion-training", name: "Mindlink Mech", category: "exp-v1 copy-of-target", selectionRule: "becomes a copy of target nonlegendary creature", primitives: [{ actionType: "copy", evidenceContains: "becomes a copy of target nonlegendary creature" }], manualReviewConfirmed: true },
  { family: "unusual_imperative_verb", split: "expansion-training", name: "Saheeli's Artistry", category: "exp-v1 modal-copy", selectionRule: "Create token that's a copy of target", primitives: [{ actionType: "copy", evidenceContains: "copy of target artifact" }], manualReviewConfirmed: true },
  { family: "unusual_imperative_verb", split: "expansion-training", name: "Misfortune's Gain", category: "exp-v1 third-person-gain", selectionRule: "Its owner gains N life", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target creature" }, { actionType: "gain_life", evidenceContains: "gains 4 life" }], manualReviewConfirmed: true },
  { family: "unusual_imperative_verb", split: "expansion-check", name: "Fall to Earth", category: "exp-v1 destroy-gain", selectionRule: "destroy + controller gains life", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target creature with flying" }, { actionType: "gain_life", evidenceContains: "gains 4 life" }], manualReviewConfirmed: true },

  // modal_wording (4)
  { family: "modal_wording", split: "expansion-training", name: "Lorehold Command", category: "exp-v1 modal", selectionRule: "Choose two — create token / deal damage", primitives: [{ actionType: "create_token", evidenceContains: "Create a 3/2 red and white Spirit creature token" }, { actionType: "deal_damage", evidenceContains: "deals 3 damage" }], manualReviewConfirmed: true },
  { family: "modal_wording", split: "expansion-training", name: "Revoke Existence", category: "exp-v1 modal", selectionRule: "Exile target artifact or enchantment", primitives: [{ actionType: "exile", evidenceContains: "Exile target artifact or enchantment" }], manualReviewConfirmed: true },
  { family: "modal_wording", split: "expansion-training", name: "Paths of Tuinvale", category: "exp-v1 modal", selectionRule: "Choose one or both — return creature", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target creature you control to its owner's hand" }], manualReviewConfirmed: true },
  { family: "modal_wording", split: "expansion-check", name: "Roadside Blowout", category: "exp-v1 modal", selectionRule: "Return opponent creature or Vehicle + draw", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target creature or Vehicle an opponent controls" }, { actionType: "draw", evidenceContains: "Draw a card" }], manualReviewConfirmed: true },

  // quantified_action (4)
  { family: "quantified_action", split: "expansion-training", name: "Nature's Rhythm", category: "exp-v1 up-to", selectionRule: "Search creature MV X or less + put onto battlefield", primitives: [{ actionType: "search_library", evidenceContains: "Search your library for a creature card" }, { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield" }], manualReviewConfirmed: true },
  { family: "quantified_action", split: "expansion-training", name: "Thunderherd Migration", category: "exp-v1 up-to", selectionRule: "Search basic land put tapped", primitives: [{ actionType: "search_library", evidenceContains: "Search your library for a basic land card" }, { actionType: "put_onto_battlefield", evidenceContains: "put it onto the battlefield tapped" }], manualReviewConfirmed: true },
  { family: "quantified_action", split: "expansion-training", name: "Unsummon", category: "exp-v1 bounce", selectionRule: "Return target creature", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target creature to its owner's hand" }], manualReviewConfirmed: true },
  { family: "quantified_action", split: "expansion-check", name: "Drag Under", category: "exp-v1 bounce-draw", selectionRule: "Return creature + draw", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target creature to its owner's hand" }, { actionType: "draw", evidenceContains: "Draw a card" }], manualReviewConfirmed: true },

  // zone_transition_wording (4)
  { family: "zone_transition_wording", split: "expansion-training", name: "Higure, the Still Wind", category: "exp-v1 tutor", selectionRule: "Search Ninja put hand", primitives: [{ actionType: "search_library", evidenceContains: "Search your library for a Ninja card" }], manualReviewConfirmed: true },
  { family: "zone_transition_wording", split: "expansion-training", name: "Chart a Course", category: "exp-v1 draw-discard", selectionRule: "Draw two then discard unless", primitives: [{ actionType: "draw", evidenceContains: "Draw two cards" }, { actionType: "discard", evidenceContains: "discard a card" }], manualReviewConfirmed: true },
  { family: "zone_transition_wording", split: "expansion-training", name: "Compulsive Research", category: "exp-v1 target-draw", selectionRule: "Target player draws three", primitives: [{ actionType: "draw", evidenceContains: "draws three cards" }], manualReviewConfirmed: true },
  { family: "zone_transition_wording", split: "expansion-check", name: "Wall of Blossoms", category: "exp-v1 etb-draw", selectionRule: "When enters draw a card", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },

  // search_tutor_resolution (4)
  { family: "search_tutor_resolution", split: "expansion-training", name: "Higure, the Still Wind", category: "exp-v1 ninja-tutor", selectionRule: "Search library reveal shuffle hand", primitives: [{ actionType: "search_library", evidenceContains: "Search your library for a Ninja card" }], manualReviewConfirmed: true },
  { family: "search_tutor_resolution", split: "expansion-training", name: "Nature's Rhythm", category: "exp-v1 creature-tutor", selectionRule: "Search creature put battlefield shuffle", primitives: [{ actionType: "search_library", evidenceContains: "Search your library for a creature card" }], manualReviewConfirmed: true },
  { family: "search_tutor_resolution", split: "expansion-training", name: "Thunderherd Migration", category: "exp-v1 land-tutor", selectionRule: "Search basic land put tapped shuffle", primitives: [{ actionType: "search_library", evidenceContains: "Search your library for a basic land card" }], manualReviewConfirmed: true },
  { family: "search_tutor_resolution", split: "expansion-check", name: "Vraska's Scorn", category: "exp-v1 search-gy", selectionRule: "Search library and/or graveyard for named card", primitives: [{ actionType: "lose_life", evidenceContains: "loses 4 life" }, { actionType: "search_library", evidenceContains: "search your library and/or graveyard" }], manualReviewConfirmed: true },

  // delayed_later_action (4)
  { family: "delayed_later_action", split: "expansion-training", name: "Dark Tutelage", category: "exp-v1 upkeep", selectionRule: "At upkeep reveal put hand lose life equal", primitives: [{ actionType: "draw", evidenceContains: "put that card into your hand" }, { actionType: "lose_life", evidenceContains: "lose life equal to its mana value" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { family: "delayed_later_action", split: "expansion-training", name: "Telling Time", category: "exp-v1 look-draw", selectionRule: "Look at top three + put one hand", primitives: [{ actionType: "draw", evidenceContains: "Put one of those cards into your hand" }], manualReviewConfirmed: true },
  { family: "delayed_later_action", split: "expansion-training", name: "Greasefang, Okiba Boss", category: "exp-v1 combat-return", selectionRule: "At beginning of combat return Vehicle", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "return target Vehicle card from your graveyard to the battlefield" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { family: "delayed_later_action", split: "expansion-check", name: "Bident of Thassa", category: "exp-v1 combat-draw", selectionRule: "Whenever combat damage draw", primitives: [{ actionType: "draw", evidenceContains: "draw a card", optionalEffect: true }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },

  // optionality_attachment (4)
  { family: "optionality_attachment", split: "expansion-training", name: "Telling Time", category: "exp-v1 optional-look", selectionRule: "Look at top three partition", primitives: [{ actionType: "draw", evidenceContains: "Put one of those cards into your hand" }], manualReviewConfirmed: true },
  { family: "optionality_attachment", split: "expansion-training", name: "Chart a Course", category: "exp-v1 unless", selectionRule: "Draw two unless attacked", primitives: [{ actionType: "draw", evidenceContains: "Draw two cards" }], manualReviewConfirmed: true },
  { family: "optionality_attachment", split: "expansion-training", name: "Compulsive Research", category: "exp-v1 unless-discard", selectionRule: "Draw three unless discard land", primitives: [{ actionType: "draw", evidenceContains: "draws three cards" }], manualReviewConfirmed: true },
  { family: "optionality_attachment", split: "expansion-check", name: "Bident of Thassa", category: "exp-v1 you-may-draw", selectionRule: "You may draw on combat damage", primitives: [{ actionType: "draw", evidenceContains: "you may draw a card", optionalEffect: true }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },

  // wrong_ability_attachment (4)
  { family: "wrong_ability_attachment", split: "expansion-training", name: "Heliod, Sun-Crowned", category: "exp-v1 pw-static", selectionRule: "Static devotion + triggered gain life counter", primitives: [{ actionType: "put_counter", evidenceContains: "put a +1/+1 counter on target creature" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { family: "wrong_ability_attachment", split: "expansion-training", name: "Kiora, Behemoth Beckoner", category: "exp-v1 pw-trigger", selectionRule: "Triggered draw on power 4+ separate from loyalty", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { family: "wrong_ability_attachment", split: "expansion-training", name: "Angrath, the Flame-Chained", category: "exp-v1 pw-loyalty", selectionRule: "Loyalty discard + lose life separate abilities", primitives: [{ actionType: "discard", evidenceContains: "discards a card" }, { actionType: "lose_life", evidenceContains: "loses 2 life" }], manualReviewConfirmed: true },
  { family: "wrong_ability_attachment", split: "expansion-check", name: "Sorin, Grim Nemesis", category: "exp-v1 pw-draw", selectionRule: "Loyalty reveal draw + opponent lose life", primitives: [{ actionType: "draw", evidenceContains: "put that card into your hand" }, { actionType: "lose_life", evidenceContains: "loses life equal to its mana value" }], manualReviewConfirmed: true },

  // static_cast_permission_leak (4)
  { family: "static_cast_permission_leak", split: "expansion-training", name: "Force of Negation", category: "exp-v1 alt-cast", selectionRule: "Alternative cost — not cast L2", primitives: [{ actionType: "counter", evidenceContains: "Counter target noncreature spell" }], forbidden: ["cast"], manualReviewConfirmed: true },
  { family: "static_cast_permission_leak", split: "expansion-training", name: "Leyline of Anticipation", category: "exp-v1 static-permission", selectionRule: "Static flash permission", primitives: [], forbidden: ["cast"], manualReviewConfirmed: true },
  { family: "static_cast_permission_leak", split: "expansion-training", name: "Vedalken Orrery", category: "exp-v1 static-permission", selectionRule: "Static flash permission", primitives: [], forbidden: ["cast"], manualReviewConfirmed: true },
  { family: "static_cast_permission_leak", split: "expansion-check", name: "Nature's Rhythm", category: "exp-v1 harmonize", selectionRule: "Harmonize cast from graveyard — abstain cast from reminder", primitives: [{ actionType: "search_library", evidenceContains: "Search your library for a creature card" }], forbidden: ["cast"], manualReviewConfirmed: true },

  // variable_lose_life_regression (4)
  { family: "variable_lose_life_regression", split: "expansion-training", name: "Exsanguinate", category: "exp-v1 x-life", selectionRule: "Each opponent loses X life", primitives: [{ actionType: "lose_life", evidenceContains: "loses X life" }], manualReviewConfirmed: true },
  { family: "variable_lose_life_regression", split: "expansion-training", name: "Gray Merchant of Asphodel", category: "exp-v1 equal-devotion", selectionRule: "loses X life devotion", primitives: [{ actionType: "lose_life", evidenceContains: "loses X life" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { family: "variable_lose_life_regression", split: "expansion-training", name: "Peer into the Abyss", category: "exp-v1 half-life", selectionRule: "loses half their life", primitives: [{ actionType: "lose_life", evidenceContains: "loses half their life" }], manualReviewConfirmed: true },
  { family: "variable_lose_life_regression", split: "expansion-check", name: "Sorin, Grim Nemesis", category: "exp-v1 equal-mv", selectionRule: "loses life equal to mana value", primitives: [{ actionType: "lose_life", evidenceContains: "loses life equal to its mana value" }], manualReviewConfirmed: true },

  // span_role_reminder_abstain (4)
  { family: "span_role_reminder_abstain", split: "expansion-training", name: "Empty the Warrens", category: "exp-v1 storm-reminder", selectionRule: "Storm reminder — abstain copy", primitives: [{ actionType: "create_token", evidenceContains: "Create two 1/1 red Goblin creature tokens" }], forbidden: ["copy"], manualReviewConfirmed: true },
  { family: "span_role_reminder_abstain", split: "expansion-training", name: "Weather the Storm", category: "exp-v1 storm-reminder", selectionRule: "Storm + gain life abstain copy", primitives: [{ actionType: "gain_life", evidenceContains: "gain 3 life" }], forbidden: ["copy"], manualReviewConfirmed: true },
  { family: "span_role_reminder_abstain", split: "expansion-training", name: "Annul", category: "exp-v1 simple", selectionRule: "Baseline counter", primitives: [{ actionType: "counter", evidenceContains: "Counter target artifact or enchantment spell" }], manualReviewConfirmed: true },
  { family: "span_role_reminder_abstain", split: "expansion-check", name: "Essence Scatter", category: "exp-v1 simple", selectionRule: "Baseline counter creature spell", primitives: [{ actionType: "counter", evidenceContains: "Counter target creature spell" }], manualReviewConfirmed: true },
];

export const EXPANSION_V1_TRAINING_COUNT = DEV_GENERALIZATION_EXPANSION_V1_SEEDS.filter((s) => s.split === "expansion-training").length;
export const EXPANSION_V1_CHECK_COUNT = DEV_GENERALIZATION_EXPANSION_V1_SEEDS.filter((s) => s.split === "expansion-check").length;
