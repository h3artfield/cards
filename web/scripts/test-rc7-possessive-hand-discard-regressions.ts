/**
 * RC7-1 — player-possessive whole-hand discard grammar regressions.
 * Run: cd web && npx tsx scripts/test-rc7-possessive-hand-discard-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { validateGoldAction } from "./lib/gold-policy-validator-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function acceptedActions(text: string) {
  return parseOracleSemanticsRC3({ oracleId: "rc7-discard-hand", oracleText: text }).actions.filter(
    (a) => a.reviewStatus === "accepted",
  );
}

function hasDiscardHand(text: string, needle: RegExp): boolean {
  return acceptedActions(text).some((a) => a.actionType === "discard" && needle.test(a.provenance?.actionSpan?.text ?? ""));
}

// Resolving possessive-hand discard → L2
assert.ok(
  hasDiscardHand("Whenever chaos ensues, discard your hand.", /\bdiscard your hand\b/i),
  "discard your hand resolving",
);
assert.ok(
  hasDiscardHand("Each player discards their hand, then draws three cards.", /\bdiscards their hand\b/i),
  "discards their hand resolving",
);
assert.ok(
  hasDiscardHand("Choose one —\n• Discard your hand, then draw cards.", /\bDiscard your hand\b/i),
  "modal Discard your hand",
);

// Cost discard → not extracted as resolving L2 from cost region alone
const costDiscard = acceptedActions("{2}, Discard a card: Draw a card.");
assert.equal(
  costDiscard.filter((a) => a.actionType === "discard").length,
  0,
  "cost discard must not leak as L2",
);

// Trigger reference — not executed discard
const triggerRef = acceptedActions("Whenever you discard a card, draw a card.");
assert.equal(
  triggerRef.filter((a) => a.actionType === "discard").length,
  0,
  "trigger reference discard must not emit",
);

// Distinct grammars — must NOT match possessive-hand fix
assert.equal(
  hasDiscardHand("By discarding a card in addition to paying its other costs.", /discarding a card/i),
  false,
  "additional-cost gerund must not match",
);
assert.equal(
  hasDiscardHand("That player discards it.", /\bdiscards it\b/i),
  false,
  "third-person pronoun discard must not match possessive-hand pattern",
);
assert.equal(
  hasDiscardHand("Discard one of them.", /Discard one of them/i),
  false,
  "discard one of them must not match",
);

// Gold policy: resolving target-player possessive hand is L2; trigger reference is not
const targetPlayerCase: OracleActionEvalCaseV2 = {
  id: "rc7-discard-policy",
  oracleId: "rc7-discard-policy",
  oracleText: "Whenever you cast a spell, target player discards their hand.",
  expectedPrimitiveActions: [],
};
assert.equal(
  validateGoldAction(targetPlayerCase, {
    actionType: "discard",
    evidenceContains: "target player discards their hand",
  }).length,
  0,
  "cast trigger condition discard reference remains L1 invalid",
);

console.log("test-rc7-possessive-hand-discard-regressions: all passed");
