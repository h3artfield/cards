/**
 * Adjudicate validation v12 missing-gold-label false positives (Oracle text only).
 * Run: npx tsx scripts/adjudicate-validation-missing-gold-v12.ts
 */
import { REVIEWER_ID } from "./oracle-action-eval-shared";

export type MissingGoldDecision =
  | "accept_into_gold"
  | "reject_unsupported"
  | "reject_layer1_structure_only"
  | "reject_different_primitive";

export interface MissingGoldAdjudication {
  caseId: string;
  cardName: string;
  proposedPrimitive: string;
  evidenceSpan: string;
  decision: MissingGoldDecision;
  correctedPrimitive?: string;
  reason: string;
  reviewer: string;
}

export const VALIDATION_MISSING_GOLD_ADJUDICATIONS: MissingGoldAdjudication[] = [
  {
    caseId: "held-0017",
    cardName: "Grafdigger's Cage",
    proposedPrimitive: "cast",
    evidenceSpan: "cast spells from",
    decision: "reject_layer1_structure_only",
    reason:
      "Static restriction on opponent casting from libraries/graveyards — not a player-initiated cast primitive.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "held-0019",
    cardName: "Flawless Maneuver",
    proposedPrimitive: "cast",
    evidenceSpan: "you may cast this spell without paying its mana cost",
    decision: "reject_unsupported",
    reason: "Commander alternative-cost modifier — not cast-from-zone permission; empty cast gold is correct.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "held-0031",
    cardName: "Teferi, Hero of Dominaria",
    proposedPrimitive: "untap",
    evidenceSpan: "untap two lands",
    decision: "accept_into_gold",
    reason: "Delayed trigger on +1 ability is a distinct untap primitive effect.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "held-0041",
    cardName: "Thassa's Oracle",
    proposedPrimitive: "cast",
    evidenceSpan: "When you cast this spell",
    decision: "reject_layer1_structure_only",
    reason: "Cast appears in triggered ability header — trigger event, not Layer-2 cast action.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "held-0075",
    cardName: "Drannith Magistrate",
    proposedPrimitive: "cast",
    evidenceSpan: "cast spells from",
    decision: "reject_layer1_structure_only",
    reason: "Static cast restriction — not an executable cast primitive.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "held-0095",
    cardName: "Snap",
    proposedPrimitive: "untap",
    evidenceSpan: "Untap up to two lands",
    decision: "accept_into_gold",
    reason: "Oracle contains a separate untap instruction distinct from return_to_hand.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "held-0101",
    cardName: "Fierce Guardianship",
    proposedPrimitive: "cast",
    evidenceSpan: "you may cast this spell without paying its mana cost",
    decision: "reject_unsupported",
    reason: "Alternative cost clause; counter spell is the only Layer-2 primitive on this card.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "held-0102",
    cardName: "Deflecting Swat",
    proposedPrimitive: "cast",
    evidenceSpan: "you may cast this spell without paying its mana cost",
    decision: "reject_unsupported",
    reason: "Alternative cost clause; retargeting permission is structural, not cast-from-zone.",
    reviewer: REVIEWER_ID,
  },
  {
    caseId: "held-0103",
    cardName: "Deadly Rollick",
    proposedPrimitive: "cast",
    evidenceSpan: "you may cast this spell without paying its mana cost",
    decision: "reject_unsupported",
    reason: "Alternative cost clause; exile is the spell effect primitive.",
    reviewer: REVIEWER_ID,
  },
];
