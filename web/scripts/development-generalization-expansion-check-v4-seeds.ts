/**
 * expansion-check-v4 — sealed RC2 fresh generalization holdout (~30 cases).
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type ExpansionCheckV4Stratum =
  | "loyalty_ability_scoping"
  | "modal_spree_structure"
  | "token_copy_delayed"
  | "search_destination_chain"
  | "pronoun_coreference"
  | "conditional_zone_transition"
  | "quantity_constraint"
  | "span_role_reminder_abstain";

export interface ExpansionCheckV4Seed {
  stratum: ExpansionCheckV4Stratum;
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
    tokenCopyOf?: string;
  }>;
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  forbidden?: PrimitiveActionType[];
  manualReviewConfirmed: true;
}

export const EXPANSION_CHECK_V4_SEEDS: ExpansionCheckV4Seed[] = [
  { stratum: "loyalty_ability_scoping", name: "Teyo, Geometric Tactician", category: "exp-chk-v4 loyalty", selectionRule: "+1 draw vs −2 choose attack direction", primitives: [{ actionType: "draw", evidenceContains: "each draw a card", loyaltyCost: "+1" }], manualReviewConfirmed: true },
  { stratum: "loyalty_ability_scoping", name: "Kiora, Master of the Depths", category: "exp-chk-v4 loyalty", selectionRule: "+1 untap creature/land vs −2 reveal", primitives: [{ actionType: "untap", evidenceContains: "Untap up to one target creature and up to one target land", loyaltyCost: "+1" }], manualReviewConfirmed: true },
  { stratum: "loyalty_ability_scoping", name: "Jaya, Venerated Firemage", category: "exp-chk-v4 loyalty", selectionRule: "+1 damage vs −2 damage vs −8 emblem", primitives: [{ actionType: "deal_damage", evidenceContains: "deals 2 damage to any target", loyaltyCost: "+1" }], manualReviewConfirmed: true },
  { stratum: "loyalty_ability_scoping", name: "Karn Liberated", category: "exp-chk-v4 loyalty", selectionRule: "+4 hand exile vs −3 permanent vs −14 restart", primitives: [{ actionType: "exile", evidenceContains: "exiles a card from their hand", loyaltyCost: "+4" }], manualReviewConfirmed: true },

  { stratum: "modal_spree_structure", name: "Take Down", category: "exp-chk-v4 modal", selectionRule: "Choose one single vs all flying damage", primitives: [{ actionType: "deal_damage", evidenceContains: "deals 4 damage to target creature with flying", optionId: "opt-1" }], manualReviewConfirmed: true },
  { stratum: "modal_spree_structure", name: "Caught in the Crossfire", category: "exp-chk-v4 spree", selectionRule: "Spree damage to outlaw/non-outlaw", primitives: [{ actionType: "deal_damage", evidenceContains: "deals 2 damage to each outlaw creature", optionId: "opt-1" }], manualReviewConfirmed: true },
  { stratum: "modal_spree_structure", name: "Jailbreak Scheme", category: "exp-chk-v4 spree", selectionRule: "Spree counter vs library top/bottom", primitives: [{ actionType: "put_counter", evidenceContains: "Put a +1/+1 counter on target creature", optionId: "opt-1" }], manualReviewConfirmed: true },
  { stratum: "modal_spree_structure", name: "Explosive Derailment", category: "exp-chk-v4 spree", selectionRule: "Spree damage vs destroy artifact", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target artifact", optionId: "opt-2" }], manualReviewConfirmed: true },
  { stratum: "modal_spree_structure", name: "Dance of the Tumbleweeds", category: "exp-chk-v4 spree", selectionRule: "Spree land vs elemental token", primitives: [{ actionType: "search_library", evidenceContains: "Search your library for a basic land card", optionId: "opt-1" }], manualReviewConfirmed: true },

  { stratum: "token_copy_delayed", name: "City of Death", category: "exp-chk-v4 saga-copy", selectionRule: "Saga chapter copy non-Saga token", primitives: [{ actionType: "create_token", evidenceContains: "Create a token that's a copy of target non-Saga token", tokenCopyOf: "target non-Saga token you control" }], manualReviewConfirmed: true },
  { stratum: "token_copy_delayed", name: "Oltec Matterweaver", category: "exp-chk-v4 token-copy", selectionRule: "Create token copy artifact", primitives: [{ actionType: "create_token", evidenceContains: "Create a token that's a copy of target artifact", tokenCopyOf: "target artifact" }], manualReviewConfirmed: true },
  { stratum: "token_copy_delayed", name: "Mythos of Illuna", category: "exp-chk-v4 token-copy", selectionRule: "Create token copy permanent", primitives: [{ actionType: "create_token", evidenceContains: "Create a token that's a copy of target permanent", tokenCopyOf: "target permanent" }], manualReviewConfirmed: true },

  { stratum: "search_destination_chain", name: "Chandra's Firemaw", category: "exp-chk-v4 search", selectionRule: "ETB lib/gy search Chandra put hand", primitives: [{ actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { stratum: "search_destination_chain", name: "The First Doctor", category: "exp-chk-v4 search", selectionRule: "Attack lib/gy search Doctor put hand", primitives: [{ actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { stratum: "search_destination_chain", name: "Delivery Moogle", category: "exp-chk-v4 search", selectionRule: "ETB search artifact MV≤2 put hand", primitives: [{ actionType: "search_library", evidenceContains: "search your library and/or graveyard for an artifact card", optionalEffect: true }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },

  { stratum: "pronoun_coreference", name: "Yomiji, Who Bars the Way", category: "exp-chk-v4 pronoun", selectionRule: "When legendary dies return that card", primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { stratum: "pronoun_coreference", name: "Crusher Zendikon", category: "exp-chk-v4 pronoun", selectionRule: "When enchanted land dies return that card", primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },
  { stratum: "pronoun_coreference", name: "Tiana, Ship's Caretaker", category: "exp-chk-v4 pronoun", selectionRule: "When aura/equipment dies return that card", primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }], structure: { minTriggeredAbilities: 1 }, manualReviewConfirmed: true },

  { stratum: "conditional_zone_transition", name: "Aether Tradewinds", category: "exp-chk-v4 bounce", selectionRule: "Return permanent you control and opponent permanent", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target permanent you control" }], manualReviewConfirmed: true },
  { stratum: "conditional_zone_transition", name: "Run Away Together", category: "exp-chk-v4 bounce", selectionRule: "Return two creatures different players", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return those creatures to their owners' hands" }], manualReviewConfirmed: true },
  { stratum: "conditional_zone_transition", name: "Whirlwind Denial", category: "exp-chk-v4 counter", selectionRule: "Counter unless pay for each spell/ability", primitives: [{ actionType: "counter", evidenceContains: "counter it unless its controller pays" }], manualReviewConfirmed: true },

  { stratum: "quantity_constraint", name: "Pox", category: "exp-chk-v4 quantity", selectionRule: "Each player loses third life/discards/sacrifices", primitives: [{ actionType: "lose_life", evidenceContains: "Each player loses a third of their life" }, { actionType: "discard", evidenceContains: "discards a third of the cards" }], manualReviewConfirmed: true },
  { stratum: "quantity_constraint", name: "Mind Rot", category: "exp-chk-v4 quantity", selectionRule: "Target player discards two", primitives: [{ actionType: "discard", evidenceContains: "Target player discards two cards" }], manualReviewConfirmed: true },

  { stratum: "span_role_reminder_abstain", name: "Naturalize", category: "exp-chk-v4 control", selectionRule: "Destroy artifact or enchantment", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target artifact or enchantment" }], manualReviewConfirmed: true },
  { stratum: "span_role_reminder_abstain", name: "Murder", category: "exp-chk-v4 removal", selectionRule: "Destroy target creature", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target creature" }], manualReviewConfirmed: true },
  { stratum: "span_role_reminder_abstain", name: "Izzet Guildmage", category: "exp-chk-v4 copy", selectionRule: "Activated copy instant/sorcery", primitives: [{ actionType: "copy", evidenceContains: "Copy target instant spell" }], manualReviewConfirmed: true },
  { stratum: "span_role_reminder_abstain", name: "Lay Bare the Heart", category: "exp-chk-v4 discard", selectionRule: "Reveal hand discard nonlegendary nonland", primitives: [{ actionType: "discard", evidenceContains: "That player discards that card" }], manualReviewConfirmed: true },
  { stratum: "span_role_reminder_abstain", name: "Cast Down", category: "exp-chk-v4 removal", selectionRule: "Destroy target nonlegendary creature", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target nonlegendary creature" }], manualReviewConfirmed: true },
  { stratum: "span_role_reminder_abstain", name: "Doom Blade", category: "exp-chk-v4 removal", selectionRule: "Destroy target nonblack creature", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target nonblack creature" }], manualReviewConfirmed: true },
  { stratum: "span_role_reminder_abstain", name: "Light of Hope", category: "exp-chk-v4 modal", selectionRule: "Choose one gain life/destroy/draw", primitives: [{ actionType: "gain_life", evidenceContains: "You gain 4 life", optionId: "opt-1" }], manualReviewConfirmed: true },
];

export const EXPANSION_CHECK_V4_COUNT = EXPANSION_CHECK_V4_SEEDS.length;
