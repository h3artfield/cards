/**
 * expansion-check-v3 — sealed holdout (~28 cases) before v1.26 tuning.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type ExpansionCheckV3Stratum =
  | "loyalty_ability_scoping"
  | "search_destination_chain"
  | "modal_spree_structure"
  | "pronoun_coreference"
  | "conditional_zone_transition"
  | "token_copy_delayed"
  | "delayed_exile_referent"
  | "span_role_reminder_abstain";

export interface ExpansionCheckV3Seed {
  stratum: ExpansionCheckV3Stratum;
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

export const EXPANSION_CHECK_V3_SEEDS: ExpansionCheckV3Seed[] = [
  {
    stratum: "loyalty_ability_scoping",
    name: "Chandra, Spark Hunter",
    category: "exp-chk-v3 loyalty",
    selectionRule: "+2 draw vs 0 vehicle token vs −7 emblem",
    primitives: [
      { actionType: "draw", evidenceContains: "draw a card", loyaltyCost: "+2", optionalEffect: true },
      { actionType: "create_token", evidenceContains: "Create a 3/2 colorless Vehicle artifact token", loyaltyCost: "0" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "loyalty_ability_scoping",
    name: "Kaito, Dancing Shadow",
    category: "exp-chk-v3 loyalty",
    selectionRule: "+1 draw vs −2 bounce vs −4 ultimate",
    primitives: [{ actionType: "draw", evidenceContains: "draw a card", loyaltyCost: "+1" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "loyalty_ability_scoping",
    name: "Tyvar Kell",
    category: "exp-chk-v3 loyalty",
    selectionRule: "+1 vs −2 vs −6 wolf tokens",
    primitives: [{ actionType: "put_counter", evidenceContains: "Put a +1/+1 counter on up to one target Elf", loyaltyCost: "+1" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "loyalty_ability_scoping",
    name: "Gideon, Martial Paragon",
    category: "exp-chk-v3 loyalty",
    selectionRule: "+1 counters vs −3 destroy vs −10 emblem",
    primitives: [{ actionType: "untap", evidenceContains: "Untap all creatures you control", loyaltyCost: "+2" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "loyalty_ability_scoping",
    name: "Jeska, Thrice Reborn",
    category: "exp-chk-v3 loyalty",
    selectionRule: "−X damage vs −6 emblem",
    primitives: [{ actionType: "deal_damage", evidenceContains: "deals X damage to each of up to three targets", loyaltyCost: "−X" }],
    manualReviewConfirmed: true,
  },

  {
    stratum: "search_destination_chain",
    name: "Rhythmic Water Vortex",
    category: "exp-chk-v3 search",
    selectionRule: "Bounce up to two then lib/gy search put hand",
    primitives: [
      { actionType: "return_to_hand", evidenceContains: "Return up to two target creatures to their owner's hand" },
      { actionType: "search_library", evidenceContains: "Search your library and/or graveyard" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "search_destination_chain",
    name: "Dr. Julius Jumblemorph",
    category: "exp-chk-v3 search",
    selectionRule: "Mutate optional lib/gy search put hand",
    primitives: [{ actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "search_destination_chain",
    name: "Sorin's Guide",
    category: "exp-chk-v3 search",
    selectionRule: "Lib/gy search vampire put hand",
    primitives: [{ actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "search_destination_chain",
    name: "Captain Kirk, Boldly Going",
    category: "exp-chk-v3 search",
    selectionRule: "Attack trigger lib/gy search land/Enterprise put hand",
    primitives: [{ actionType: "search_library", evidenceContains: "search your library and/or graveyard", optionalEffect: true }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },

  {
    stratum: "modal_spree_structure",
    name: "Lively Dirge",
    category: "exp-chk-v3 spree",
    selectionRule: "Spree search gy vs return creatures",
    primitives: [
      { actionType: "search_library", evidenceContains: "Search your library for a card", optionId: "opt-1" },
      { actionType: "return_to_battlefield", evidenceContains: "Return up to two creature cards", optionId: "opt-2" },
    ],
    manualReviewConfirmed: true,
  },
  {
    stratum: "modal_spree_structure",
    name: "Phantom Interference",
    category: "exp-chk-v3 spree",
    selectionRule: "Spree counter vs draw",
    primitives: [{ actionType: "counter", evidenceContains: "Counter target spell unless its controller pays", optionId: "opt-2" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "modal_spree_structure",
    name: "Return the Favor",
    category: "exp-chk-v3 spree",
    selectionRule: "Spree copy spell vs return permanent",
    primitives: [{ actionType: "copy", evidenceContains: "Copy target instant spell", optionId: "opt-1" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "modal_spree_structure",
    name: "Three Steps Ahead",
    category: "exp-chk-v3 spree",
    selectionRule: "Spree counter/copy modal",
    primitives: [{ actionType: "copy", evidenceContains: "Create a token that's a copy of target artifact or creature you control", optionId: "opt-2" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "modal_spree_structure",
    name: "Supreme Will",
    category: "exp-chk-v3 modal-look",
    selectionRule: "Modal look partition vs counter unless",
    primitives: [{ actionType: "draw", evidenceContains: "Put one of them into your hand", optionId: "opt-2" }],
    manualReviewConfirmed: true,
  },

  {
    stratum: "pronoun_coreference",
    name: "Vastwood Zendikon",
    category: "exp-chk-v3 pronoun",
    selectionRule: "When enchanted land dies return that card",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    stratum: "pronoun_coreference",
    name: "Nissa's Zendikon",
    category: "exp-chk-v3 pronoun",
    selectionRule: "When enchanted land dies return that card",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    stratum: "pronoun_coreference",
    name: "Guardian Zendikon",
    category: "exp-chk-v3 pronoun",
    selectionRule: "When enchanted land dies return that card",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "return that card to its owner's hand" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },

  {
    stratum: "conditional_zone_transition",
    name: "Worthy Cost",
    category: "exp-chk-v3 sacrifice-exile",
    selectionRule: "Additional cost sacrifice + exile target",
    primitives: [{ actionType: "exile", evidenceContains: "Exile target creature or planeswalker" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "conditional_zone_transition",
    name: "Disperse",
    category: "exp-chk-v3 conditional-bounce",
    selectionRule: "Return nonland permanent to hand",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target nonland permanent to its owner's hand" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "conditional_zone_transition",
    name: "Rescue",
    category: "exp-chk-v3 bounce",
    selectionRule: "Return target permanent you control",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target permanent you control to its owner's hand" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "conditional_zone_transition",
    name: "Boomerang",
    category: "exp-chk-v3 bounce",
    selectionRule: "Return target permanent",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target permanent to its owner's hand" }],
    manualReviewConfirmed: true,
  },

  {
    stratum: "token_copy_delayed",
    name: "Croaking Counterpart",
    category: "exp-chk-v3 token-copy",
    selectionRule: "Create frog token copy",
    primitives: [{ actionType: "create_token", evidenceContains: "Create a token that's a copy of target non-Frog creature" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "token_copy_delayed",
    name: "Shaun, Father of Synths",
    category: "exp-chk-v3 token-copy",
    selectionRule: "Create token copy of artifact",
    primitives: [{ actionType: "create_token", evidenceContains: "Create a tapped and attacking token that's a copy of target attacking legendary creature" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "delayed_exile_referent",
    name: "Tilonalli's Summoner",
    category: "exp-chk-v3 delayed-exile",
    selectionRule: "Attack create tokens + exile end step unless ascend",
    primitives: [{ actionType: "create_token", evidenceContains: "create X 1/1 red Elemental creature tokens that are tapped and attacking" }],
    structure: { minTriggeredAbilities: 1 },
    manualReviewConfirmed: true,
  },
  {
    stratum: "delayed_exile_referent",
    name: "Sauron, the Necromancer",
    category: "exp-chk-v3 delayed-exile",
    selectionRule: "Amass + delayed exile referent",
    primitives: [{ actionType: "create_token", evidenceContains: "Create a tapped and attacking token that's a copy of that card, except it's a 3/3 black Wraith" }],
    manualReviewConfirmed: true,
  },

  {
    stratum: "span_role_reminder_abstain",
    name: "Broken Bond",
    category: "exp-chk-v3 control",
    selectionRule: "Destroy artifact/enchantment",
    primitives: [{ actionType: "destroy", evidenceContains: "Destroy target artifact or enchantment" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "span_role_reminder_abstain",
    name: "Ronom Unicorn",
    category: "exp-chk-v3 control",
    selectionRule: "Destroy enchantment",
    primitives: [{ actionType: "destroy", evidenceContains: "Destroy target enchantment" }],
    manualReviewConfirmed: true,
  },
  {
    stratum: "span_role_reminder_abstain",
    name: "Reasonable Doubt",
    category: "exp-chk-v3 control",
    selectionRule: "Counter unless pay",
    primitives: [{ actionType: "counter", evidenceContains: "Counter target spell unless its controller pays" }],
    manualReviewConfirmed: true,
  },
];

export const EXPANSION_CHECK_V3_COUNT = EXPANSION_CHECK_V3_SEEDS.length;
