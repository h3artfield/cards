/**
 * RC8-0 — modal/trigger action ownership + span containment invariants.
 * Run: cd web && npx tsx scripts/test-rc8-action-ownership-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  countAcceptedActionOutsideOwnerSpan,
  verifySemanticParseIntegrity,
} from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";

function parse(text: string, oracleId = "test-rc8-ownership") {
  return parseOracleSemanticsRC3({ oracleId, oracleText: text });
}

function assertContainment(text: string, oracleId?: string) {
  const p = parse(text, oracleId);
  assert.equal(countAcceptedActionOutsideOwnerSpan(p), 0, "acceptedActionOutsideOwnerSpanCount");
  const integrity = verifySemanticParseIntegrity(p, text);
  assert.ok(integrity.ok, JSON.stringify(integrity));
  assert.equal(p.semanticValidation.invalidCount, 0);
  return p;
}

function ownerSpan(p: ReturnType<typeof parse>, parentAbilityId: string) {
  return p.abilities.find((a) => a.abilityId === parentAbilityId)?.abilitySpan;
}

function actionSpanContained(p: ReturnType<typeof parse>, actionType: string, evidencePart: RegExp) {
  const action = p.actions.find(
    (a) => a.reviewStatus === "accepted" && a.actionType === actionType && evidencePart.test(a.provenance.actionSpan.text),
  );
  assert.ok(action, `missing accepted ${actionType}`);
  const owner = p.abilities.find((a) => a.abilityId === action.parentAbilityId);
  assert.ok(owner, "owner ability");
  const span = action.provenance.actionSpan;
  assert.ok(span.cardStart >= owner!.abilitySpan.cardStart && span.cardEnd <= owner!.abilitySpan.cardEnd);
  return action;
}

// Caesar — trigger → optional sacrifice → When you do → inline modal (vh17-0049)
{
  const text =
    "Whenever you attack, you may sacrifice another creature. When you do, choose two —\n• Create two 1/1 red and white Soldier creature tokens with haste that are tapped and attacking.\n• You draw a card and you lose 1 life.\n• Caesar deals damage equal to the number of creature tokens you control to target opponent.";
  const p = assertContainment(text, "8e62d05a-6efd-4764-bca8-97895e0cb613");
  const sacrifice = actionSpanContained(p, "sacrifice", /sacrifice another creature/i);
  assert.match(sacrifice.parentAbilityId, /ability-0$/, "sacrifice owned by triggered segment, not modal container");
  const triggered = p.abilities.find((a) => a.abilityType === "triggered");
  assert.ok(triggered);
  assert.ok(
    sacrifice.provenance.actionSpan.cardStart >= triggered!.abilitySpan.cardStart &&
      sacrifice.provenance.actionSpan.cardEnd <= triggered!.abilitySpan.cardEnd,
  );
  const modal = p.abilities.find((a) => a.abilityType === "modal");
  assert.ok(modal);
  assert.notEqual(sacrifice.parentAbilityId, modal!.abilityId);
}

// Trigger → modal directly (no intermediate optional)
{
  const text =
    "Whenever you cast a spell, choose one —\n• Draw a card.\n• Deal 1 damage to any target.";
  const p = assertContainment(text);
  const draw = actionSpanContained(p, "draw", /draw a card/i);
  assert.match(draw.parentAbilityId, /ability-\d+/);
}

// Ordinary modal spell (no trigger wrapper)
{
  const text =
    "Choose one —\n• Destroy target creature.\n• Counter target spell.";
  const p = assertContainment(text);
  actionSpanContained(p, "destroy", /Destroy target creature/i);
  actionSpanContained(p, "counter", /Counter target spell/i);
}

// Sequential nonmodal action before modal section
{
  const text =
    "Draw a card, then choose one —\n• You gain 3 life.\n• You draw a card.";
  const p = assertContainment(text);
  const preModalDraw = p.actions.find(
    (a) => a.reviewStatus === "accepted" && a.actionType === "draw" && /Draw a card,/.test(a.provenance.actionSpan.text),
  );
  if (preModalDraw) {
    const owner = ownerSpan(p, preModalDraw.parentAbilityId);
    assert.ok(owner);
    assert.ok(preModalDraw.provenance.actionSpan.cardEnd <= owner!.cardEnd);
  }
}

// Nested granted trigger inside quoted ability (sanity — ownership not corrupted)
{
  const text =
    'Whenever you crank this Contraption, until end of turn, target creature gains "Whenever this creature deals combat damage to a player, destroy target creature that player controls."';
  const p = assertContainment(text, "fe7aafbf-fd19-44f9-b82f-032ae74e8b6f");
  assert.equal(countAcceptedActionOutsideOwnerSpan(p), 0);
}

console.log("test-rc8-action-ownership-regressions: all passed");
