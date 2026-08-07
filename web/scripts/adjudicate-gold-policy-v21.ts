/**
 * v1.15 policy gold adjudications → development_set_v21.
 * Cost-policy corrections, tutor compound gold, and four gold_omission adjudications.
 */
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export const GOLD_V21_REVIEWER = "cost-compound-policy-v21";
export const GOLD_V21_REVIEWED_AT = "2026-08-07T09:30:00.000Z";

export type GoldV21Decision = "add_gold" | "remove_gold" | "reject_parser_output";

export interface GoldV21Adjudication {
  caseId: string;
  cardName: string;
  face: "front" | "back";
  decision: GoldV21Decision;
  reason: string;
  policyArea: "cost_layer_boundary" | "tutor_compound" | "gold_omission" | "saga_compound";
  goldAddition?: {
    actionType: PrimitiveActionType;
    evidenceContains: string;
    cardFace?: "front" | "back";
    optionalEffect?: boolean;
  };
  goldRemoval?: {
    actionType: PrimitiveActionType;
    evidenceContains: string;
  };
  forbiddenPrimitive?: PrimitiveActionType;
}

export const GOLD_V21_ADJUDICATIONS: GoldV21Adjudication[] = [
  // —— Cost policy: remove Layer-2 gold for activated/additional costs ——
  {
    caseId: "eval-0023",
    cardName: "Ashnod's Altar",
    face: "front",
    decision: "remove_gold",
    policyArea: "cost_layer_boundary",
    reason: "Sacrifice in 'Sacrifice a creature: Add' is Layer-1 activated cost, not Layer-2 sacrifice.",
    goldRemoval: { actionType: "sacrifice", evidenceContains: "Sacrifice" },
  },
  {
    caseId: "eval-0028",
    cardName: "Fauna Shaman",
    face: "front",
    decision: "remove_gold",
    policyArea: "cost_layer_boundary",
    reason: "Discard in '{G}, {T}, Discard a creature card:' is Layer-1 cost, not Layer-2 discard.",
    goldRemoval: { actionType: "discard", evidenceContains: "Discard" },
  },
  {
    caseId: "eval-0029",
    cardName: "Survival of the Fittest",
    face: "front",
    decision: "remove_gold",
    policyArea: "cost_layer_boundary",
    reason: "Discard in '{G}, Discard a creature card:' is Layer-1 cost, not Layer-2 discard.",
    goldRemoval: { actionType: "discard", evidenceContains: "Discard a creature card" },
  },
  {
    caseId: "eval-0030",
    cardName: "Crop Rotation",
    face: "front",
    decision: "remove_gold",
    policyArea: "cost_layer_boundary",
    reason: "Sacrifice in additional cost is Layer-1 cost, not Layer-2 sacrifice.",
    goldRemoval: { actionType: "sacrifice", evidenceContains: "sacrifice a land" },
  },
  {
    caseId: "dev-v9-007",
    cardName: "Harrow",
    face: "front",
    decision: "remove_gold",
    policyArea: "cost_layer_boundary",
    reason: "Sacrifice in additional cost is Layer-1 cost, not Layer-2 sacrifice.",
    goldRemoval: { actionType: "sacrifice", evidenceContains: "sacrifice a land" },
  },
  {
    caseId: "eval-0174",
    cardName: "Eliminate the Competition",
    face: "front",
    decision: "remove_gold",
    policyArea: "cost_layer_boundary",
    reason: "Cast/s sacrifice in additional cost are Layer-1 cost structure, not Layer-2 primitives.",
    goldRemoval: { actionType: "cast", evidenceContains: "cast this spell, sacrifice X creatures" },
  },
  {
    caseId: "eval-0174",
    cardName: "Eliminate the Competition",
    face: "front",
    decision: "remove_gold",
    policyArea: "cost_layer_boundary",
    reason: "Sacrifice in additional cost is Layer-1 cost, not Layer-2 sacrifice.",
    goldRemoval: { actionType: "sacrifice", evidenceContains: "sacrifice X creatures" },
  },
  {
    caseId: "eval-0174",
    cardName: "Eliminate the Competition",
    face: "front",
    decision: "add_gold",
    policyArea: "cost_layer_boundary",
    reason: "Destroy X target creatures is the spell's Layer-2 effect.",
    goldAddition: { actionType: "destroy", evidenceContains: "Destroy X target creatures" },
  },

  // —— Tutor compound: distinct search + put gold (not mutually exclusive) ——
  {
    caseId: "dev-v9-009",
    cardName: "Rampant Growth",
    face: "front",
    decision: "add_gold",
    policyArea: "tutor_compound",
    reason: "Search and put onto battlefield are distinct Layer-2 actions in one resolution.",
    goldAddition: { actionType: "put_onto_battlefield", evidenceContains: "put that card onto the battlefield" },
  },
  {
    caseId: "dev-v9-007",
    cardName: "Harrow",
    face: "front",
    decision: "add_gold",
    policyArea: "tutor_compound",
    reason: "Put onto battlefield is distinct from search in Harrow resolution.",
    goldAddition: { actionType: "put_onto_battlefield", evidenceContains: "put them onto the battlefield" },
  },
  {
    caseId: "dev-v9-008",
    cardName: "Kodama's Reach",
    face: "front",
    decision: "add_gold",
    policyArea: "tutor_compound",
    reason: "Put one onto battlefield is distinct from search in Kodama's Reach.",
    goldAddition: { actionType: "put_onto_battlefield", evidenceContains: "put one onto the battlefield" },
  },
  {
    caseId: "eval-0012",
    cardName: "Solemn Simulacrum",
    face: "front",
    decision: "add_gold",
    policyArea: "tutor_compound",
    reason: "ETB search-then-put includes distinct put onto battlefield action.",
    goldAddition: {
      actionType: "put_onto_battlefield",
      evidenceContains: "put that card onto the battlefield",
      optionalEffect: true,
    },
  },
  {
    caseId: "eval-0030",
    cardName: "Crop Rotation",
    face: "front",
    decision: "add_gold",
    policyArea: "tutor_compound",
    reason: "Put onto battlefield is distinct from search in Crop Rotation resolution.",
    goldAddition: { actionType: "put_onto_battlefield", evidenceContains: "put that card onto the battlefield" },
  },
  {
    caseId: "eval-0009",
    cardName: "Path to Exile",
    face: "front",
    decision: "add_gold",
    policyArea: "tutor_compound",
    reason: "Opponent's optional search-then-put includes distinct put onto battlefield.",
    goldAddition: {
      actionType: "put_onto_battlefield",
      evidenceContains: "put that card onto the battlefield",
      optionalEffect: true,
    },
  },

  // —— Four gold_omission adjudications ——
  {
    caseId: "eval-0059",
    cardName: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki",
    face: "front",
    decision: "add_gold",
    policyArea: "saga_compound",
    reason: "Saga chapter III exile and return transformed are distinct Layer-2 actions.",
    goldAddition: { actionType: "exile", evidenceContains: "Exile this Saga" },
  },
  {
    caseId: "eval-0059",
    cardName: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki",
    face: "front",
    decision: "add_gold",
    policyArea: "saga_compound",
    reason: "Return transformed is distinct Layer-2 action after exile in chapter III.",
    goldAddition: { actionType: "return_to_battlefield", evidenceContains: "return it to the battlefield transformed" },
  },
  {
    caseId: "eval-0109",
    cardName: "Founding the Third Path",
    face: "front",
    decision: "add_gold",
    policyArea: "gold_omission",
    reason: "Saga chapter II mill is a distinct Layer-2 action.",
    goldAddition: { actionType: "mill", evidenceContains: "mills four cards" },
  },
  {
    caseId: "eval-0041",
    cardName: "Decree of Pain",
    face: "front",
    decision: "reject_parser_output",
    policyArea: "gold_omission",
    reason: "Cycling reminder discard is Layer-1 cycling cost, not Layer-2 discard effect.",
    forbiddenPrimitive: "discard",
  },
];

export function isGoldV21Forbidden(input: {
  caseId: string;
  parserPrimitive: string;
  parserEvidence: string;
}): { forbidden: boolean; reason?: string } {
  for (const adj of GOLD_V21_ADJUDICATIONS) {
    if (adj.caseId !== input.caseId || adj.decision !== "reject_parser_output") continue;
    if (adj.forbiddenPrimitive !== input.parserPrimitive) continue;
    return { forbidden: true, reason: adj.reason };
  }
  return { forbidden: false };
}
