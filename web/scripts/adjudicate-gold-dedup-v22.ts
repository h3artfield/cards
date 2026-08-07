/**
 * v22 duplicate-gold / matcher-alignment corrections.
 * Parent: development_set_v21 (immutable after v22 freeze).
 */
import type { PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export const GOLD_V22_REVIEWER = "duplicate-gold-dedup-v22";
export const GOLD_V22_REVIEWED_AT = "2026-08-07T11:10:00.000Z";

export interface GoldV22Correction {
  caseId: string;
  cardName: string;
  action: "remove_duplicate" | "align_optional_effect" | "align_evidence";
  reason: string;
  remove?: { actionType: PrimitiveActionType; evidenceContains: string };
  align?: {
    actionType: PrimitiveActionType;
    evidenceContains: string;
    optionalEffect?: boolean;
    newEvidenceContains?: string;
  };
}

/** Seven evaluator_gold_defect rows from v21 audit — duplicate or matcher-lag gold. */
export const GOLD_V22_CORRECTIONS: GoldV22Correction[] = [
  {
    caseId: "dev-cond-007",
    cardName: "Keldon Raider",
    action: "align_optional_effect",
    reason: "Consequent draw is matched without optionalEffect flag — align gold to parser.",
    align: { actionType: "draw", evidenceContains: "draw a card", optionalEffect: false },
  },
  {
    caseId: "eval-0059",
    cardName: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki",
    action: "align_optional_effect",
    reason: "If-you-do consequent draw matched without optionalEffect — align gold.",
    align: { actionType: "draw", evidenceContains: "draw that many cards", optionalEffect: false },
  },
  {
    caseId: "eval-0099",
    cardName: "Keldon Raider",
    action: "align_evidence",
    reason: "Over-broad discard evidence and draw optionalEffect mismatch.",
    align: { actionType: "discard", evidenceContains: "You may", newEvidenceContains: "you may discard a card" },
  },
  {
    caseId: "eval-0099",
    cardName: "Keldon Raider",
    action: "align_optional_effect",
    reason: "Consequent draw optionalEffect aligns with parser.",
    align: { actionType: "draw", evidenceContains: "draw a card", optionalEffect: false },
  },
  {
    caseId: "eval-0115",
    cardName: "Spell Contortion",
    action: "remove_duplicate",
    reason: "Duplicate counter gold — shorter evidence subsumed by longer span.",
    remove: { actionType: "counter", evidenceContains: "Counter target spell unless" },
  },
  {
    caseId: "eval-0199",
    cardName: "Combat Thresher",
    action: "remove_duplicate",
    reason: "Duplicate generic draw gold subsumed by draw a card.",
    remove: { actionType: "draw", evidenceContains: "draw" },
  },
  {
    caseId: "eval-0201",
    cardName: "Pollywog Symbiote",
    action: "remove_duplicate",
    reason: "Duplicate generic draw gold subsumed by draw a card.",
    remove: { actionType: "draw", evidenceContains: "draw" },
  },
  {
    caseId: "eval-0203",
    cardName: "Sorcerer Class",
    action: "remove_duplicate",
    reason: "Duplicate generic draw gold subsumed by ETB draw span.",
    remove: { actionType: "draw", evidenceContains: "draw" },
  },
];
