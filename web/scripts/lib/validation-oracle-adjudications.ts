/**
 * Oracle-only adjudications for validation gold certification (v10).
 * Derived from catalog oracle text and taxonomy policy — never from RC1 output.
 */
import type { ExpectedPrimitiveAction } from "../audit-oracle-action-eval-cases";
import type { PrimitiveActionType } from "../../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

export type ValidationGoldAdjudication = {
  replace?: ExpectedPrimitiveAction[];
  merge?: ExpectedPrimitiveAction[];
  removeTypes?: PrimitiveActionType[];
  note: string;
};

/** Modal cards where stem evidence covers all bullets of that primitive type. */
const MODAL_STEM_CASES: Record<string, ExpectedPrimitiveAction[]> = {
  "held-0021": [
    { actionType: "exile", evidenceContains: "Exile" },
    { actionType: "draw", evidenceContains: "draw two cards" },
    { actionType: "lose_life", evidenceContains: "lose 2 life" },
    { actionType: "put_counter", evidenceContains: "Distribute" },
  ],
  "held-0022": [
    { actionType: "counter", evidenceContains: "Counter" },
    { actionType: "return_to_hand", evidenceContains: "Return" },
    { actionType: "destroy", evidenceContains: "Destroy" },
  ],
  "held-0085": [
    { actionType: "counter", evidenceContains: "Counter" },
    { actionType: "return_to_hand", evidenceContains: "Return" },
    { actionType: "draw", evidenceContains: "Draw" },
    { actionType: "tap", evidenceContains: "Tap" },
  ],
};

/** Cases where auto-derivation over/under-extracts vs oracle policy. */
const ORACLE_POLICY_CASES: Record<string, ValidationGoldAdjudication> = {
  "held-0012": {
    merge: [
      { actionType: "exile", evidenceContains: "Exile this Saga", cardFace: "front" },
      {
        actionType: "return_to_battlefield",
        evidenceContains: "return it to the battlefield transformed",
        cardFace: "front",
      },
      { actionType: "copy", evidenceContains: "copy of another target", cardFace: "back" },
    ],
    note: "Saga chapter III compound + back-face activated copy.",
  },
  "held-0013": {
    replace: [
      { actionType: "exile", evidenceContains: "exile the top card of your library" },
      { actionType: "play", evidenceContains: "you may play that card", optionalEffect: true },
      { actionType: "shuffle_library", evidenceContains: "Shuffle your library" },
    ],
    note: "One-shot play permission; exclude Storm reminder cast/copy.",
  },
  "held-0020": {
    replace: [
      { actionType: "draw", evidenceContains: "draw a card" },
      { actionType: "sacrifice", evidenceContains: "sacrifice this enchantment" },
    ],
    note: "Dress Down triggered draw + end-step sacrifice.",
  },
  "held-0028": {
    replace: [
      {
        actionType: "return_to_hand",
        evidenceContains: "Return target instant card from your graveyard to your hand",
      },
      {
        actionType: "return_to_hand",
        evidenceContains: "Return target sorcery card from your graveyard to your hand",
      },
      { actionType: "copy", evidenceContains: "copy it" },
    ],
    note: "Mirari Conjecture chapters I–II gy→hand + III copy trigger.",
  },
  "held-0073": {
    replace: [
      { actionType: "draw", evidenceContains: "you may draw a card", optionalEffect: true },
    ],
    note: "Rhystic Study optional draw on opponent spell.",
  },
  "held-0086": {
    merge: [
      {
        actionType: "exile",
        evidenceContains: "exile an instant card with mana value 2 or less from your hand",
        optionalEffect: true,
      },
    ],
    note: "Isochron Scepter imprint exile on entry.",
  },
  "held-0100": {
    replace: [
      { actionType: "add_mana", evidenceContains: "Add {C}" },
      { actionType: "destroy", evidenceContains: "Destroy target nonbasic land" },
      { actionType: "search_library", evidenceContains: "searches their library" },
      { actionType: "put_onto_battlefield", evidenceContains: "puts it onto the battlefield" },
      { actionType: "shuffle_library", evidenceContains: "then shuffles" },
    ],
    note: "Field of Ruin — sacrifice is Layer-1 activated cost, not Layer-2 primitive.",
  },
  "held-0017": {
    removeTypes: ["cast"],
    note: "Static restriction — no imperative cast primitive.",
  },
  "held-0075": {
    removeTypes: ["cast"],
    note: "Commander alternative cast cost permission is not imperative cast.",
  },
  "held-0019": {
    removeTypes: ["cast"],
    note: "Commander free-cast permission line is not imperative cast.",
  },
  "held-0101": {
    removeTypes: ["cast"],
    note: "Commander free-cast permission line is not imperative cast.",
  },
  "held-0102": {
    removeTypes: ["cast"],
    note: "Commander free-cast permission line is not imperative cast.",
  },
  "held-0103": {
    removeTypes: ["cast"],
    note: "Commander free-cast permission line is not imperative cast.",
  },
  "held-0084": {
    replace: [
      { actionType: "mill", evidenceContains: "mills fourteen cards" },
      { actionType: "mill", evidenceContains: "mills four cards" },
    ],
    note: "Main effect + cycling trigger mill; exclude cycling cost draw.",
  },
};

export function getValidationGoldAdjudication(caseId: string): ValidationGoldAdjudication | undefined {
  const modal = MODAL_STEM_CASES[caseId];
  if (modal) {
    return { replace: modal, note: "Modal choose-one stem evidence covers all bullets of each primitive type." };
  }
  return ORACLE_POLICY_CASES[caseId];
}

/** Parser emissions that are intentionally absent from gold (not gold omissions). */
export function isIntentionallyExcludedFromGold(evidence: string): boolean {
  if (/\bcast this spell, copy it\b/i.test(evidence)) return true;
  if (/\bWhen you cast this spell, copy it\b/i.test(evidence)) return true;
  if (/\byou may cast this spell without paying its mana cost\b/i.test(evidence)) return true;
  if (/\byou may cast this\b/i.test(evidence)) return true;
  if (/\bIf you control a commander, you may cast this spell\b/i.test(evidence)) return true;
  return false;
}
