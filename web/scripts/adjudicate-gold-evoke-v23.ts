/**
 * v23 Grief evoke-cost gold correction.
 * Parent: development_set_v22 (immutable).
 */
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export const GOLD_V23_REVIEWER = "evoke-cost-policy-v23";
export const GOLD_V23_REVIEWED_AT = "2026-08-07T11:45:00.000Z";

export interface GoldV23Correction {
  caseId: string;
  cardName: string;
  reason: string;
  removeGold?: { actionType: PrimitiveActionType; evidenceContains: string };
  forbiddenPrimitive?: PrimitiveActionType;
  structureNote?: string;
}

export const GOLD_V23_CORRECTIONS: GoldV23Correction[] = [
  {
    caseId: "eval-0058",
    cardName: "Grief",
    reason:
      "Evoke exile-from-hand is Layer-1 alternative cost (action=exile, source=hand), not Layer-2 exile primitive.",
    removeGold: { actionType: "exile", evidenceContains: "Exile a black card" },
    forbiddenPrimitive: "exile",
    structureNote: "Evoke alternative cost preserved in Layer-1 mechanic context; ETB discard remains Layer-2.",
  },
];
