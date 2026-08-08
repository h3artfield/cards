/**
 * expansion-training-v5 — v1.27 structural family training (new Oracle IDs).
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type ExpansionV5Family =
  | "loyalty_ability_scoping"
  | "modal_spree_structure"
  | "token_copy_delayed";

export interface ExpansionV5Seed {
  family: ExpansionV5Family;
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

export const DEV_GENERALIZATION_EXPANSION_V5_SEEDS: ExpansionV5Seed[] = [
  {
    family: "loyalty_ability_scoping",
    name: "Huatli, Dinosaur Knight",
    category: "exp-v5 loyalty",
    selectionRule: "+2 counters vs −3 power damage vs −7 pump",
    primitives: [
      { actionType: "put_counter", evidenceContains: "Put two +1/+1 counters on up to one target Dinosaur", loyaltyCost: "+2" },
      { actionType: "deal_damage", evidenceContains: "deals damage equal to its power", loyaltyCost: "−3" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "loyalty_ability_scoping",
    name: "Jiang Yanggu, Wildcrafter",
    category: "exp-v5 loyalty",
    selectionRule: "Static excluded; −1 counter only",
    primitives: [{ actionType: "put_counter", evidenceContains: "Put a +1/+1 counter on target creature", loyaltyCost: "−1" }],
    manualReviewConfirmed: true,
  },
  {
    family: "loyalty_ability_scoping",
    name: "Domri Rade",
    category: "exp-v5 loyalty",
    selectionRule: "+1 reveal/put hand vs −2 fight",
    primitives: [{ actionType: "draw", evidenceContains: "put it into your hand", loyaltyCost: "+1", optionalEffect: true }],
    manualReviewConfirmed: true,
  },
  {
    family: "loyalty_ability_scoping",
    name: "The Wandering Emperor",
    category: "exp-v5 loyalty",
    selectionRule: "+1 counter/first strike vs −2 exile tapped",
    primitives: [
      { actionType: "put_counter", evidenceContains: "Put a +1/+1 counter on up to one target creature", loyaltyCost: "+1" },
      { actionType: "exile", evidenceContains: "Exile target tapped creature", loyaltyCost: "−2" },
    ],
    manualReviewConfirmed: true,
  },
  {
    family: "loyalty_ability_scoping",
    name: "Vraska the Unseen",
    category: "exp-v5 loyalty",
    selectionRule: "+1 destroy attacker vs −3 destroy permanent vs −7 assassins",
    primitives: [{ actionType: "destroy", evidenceContains: "Destroy target nonland permanent", loyaltyCost: "−3" }],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "Rustler Rampage",
    category: "exp-v5 spree",
    selectionRule: "Spree untap vs double strike",
    primitives: [{ actionType: "untap", evidenceContains: "Untap all creatures target player controls", optionId: "opt-1" }],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "Trash the Town",
    category: "exp-v5 spree",
    selectionRule: "Spree counters vs trample vs haste",
    primitives: [{ actionType: "put_counter", evidenceContains: "Put two +1/+1 counters on target creature", optionId: "opt-1" }],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "Road of Return",
    category: "exp-v5 modal",
    selectionRule: "Choose one gy return vs commander",
    primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target permanent card from your graveyard to your hand", optionId: "opt-1" }],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "Ember Island Production",
    category: "exp-v5 modal",
    selectionRule: "Choose one token copy hero vs creature",
    primitives: [{
      actionType: "create_token",
      evidenceContains: "Create a token that's a copy of target creature you control",
      optionId: "opt-1",
      tokenCopyOf: "target creature you control",
    }],
    manualReviewConfirmed: true,
  },
  {
    family: "modal_spree_structure",
    name: "Blinding Beam",
    category: "exp-v5 modal",
    selectionRule: "Choose one tap two vs skip untap step",
    primitives: [{ actionType: "tap", evidenceContains: "Tap two target creatures", optionId: "opt-1" }],
    manualReviewConfirmed: true,
  },
  {
    family: "token_copy_delayed",
    name: "Self-Reflection",
    category: "exp-v5 token-copy",
    selectionRule: "Create token copy controlled creature",
    primitives: [{
      actionType: "create_token",
      evidenceContains: "Create a token that's a copy of target creature you control",
      tokenCopyOf: "target creature you control",
    }],
    manualReviewConfirmed: true,
  },
  {
    family: "token_copy_delayed",
    name: "Littjara Mirrorlake",
    category: "exp-v5 token-copy",
    selectionRule: "Activated sacrifice land create copy with counter",
    primitives: [{
      actionType: "create_token",
      evidenceContains: "Create a token that's a copy of target creature you control",
      tokenCopyOf: "target creature you control",
    }],
    manualReviewConfirmed: true,
  },
  {
    family: "token_copy_delayed",
    name: "The Beamtown Bullies",
    category: "exp-v5 delayed-exile",
    selectionRule: "Activated goad put gy creature + delayed exile",
    primitives: [{ actionType: "put_onto_battlefield", evidenceContains: "puts target nonlegendary creature card from your graveyard onto the battlefield" }],
    manualReviewConfirmed: true,
  },
  {
    family: "token_copy_delayed",
    name: "False Memories",
    category: "exp-v5 delayed-exile",
    selectionRule: "Mill seven + delayed exile gy at end step",
    primitives: [{ actionType: "mill", evidenceContains: "Mill seven cards" }],
    manualReviewConfirmed: true,
  },
  {
    family: "token_copy_delayed",
    name: "Grist, the Hunger Tide",
    category: "exp-v5 loyalty-insect",
    selectionRule: "+1 create insect + mill chain",
    primitives: [{ actionType: "create_token", evidenceContains: "Create a 1/1 black and green Insect creature token", loyaltyCost: "+1" }],
    manualReviewConfirmed: true,
  },
];

export const EXPANSION_V5_TRAINING_COUNT = DEV_GENERALIZATION_EXPANSION_V5_SEEDS.length;
