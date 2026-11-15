/**
 * RC5 P0 — alternative/additional cost suppression contrasts.
 * Run: cd web && npx tsx scripts/test-rc5-alternative-cost-policy-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { countActivatedCostLayer2Leakage } from "./lib/activated-cost-leakage";

const ORACLE_ID = "test-rc5-alt-cost-policy";

function accepted(text: string) {
  return parseOracleSemanticsRC3({ oracleId: ORACLE_ID, oracleText: text }).actions.filter(
    (a) => a.reviewStatus === "accepted",
  );
}

function assertNoCostLeak(text: string, forbiddenTypes: string[]) {
  const parse = parseOracleSemanticsRC3({ oracleId: ORACLE_ID, oracleText: text });
  const actions = parse.actions.filter((a) => a.reviewStatus === "accepted");
  for (const type of forbiddenTypes) {
    assert.equal(
      actions.filter((a) => a.actionType === type).length,
      0,
      `must not emit accepted ${type} in cost region: ${text.slice(0, 60)}…`,
    );
  }
  assert.equal(countActivatedCostLayer2Leakage(ORACLE_ID, text, parse.actions), 0);
}

// Layer 1 only — rather than pay
{
  const text =
    "You may discard a Plains card rather than pay this spell's mana cost.\nDestroy target artifact or enchantment.";
  assertNoCostLeak(text, ["discard"]);
  assert.ok(accepted(text).some((a) => a.actionType === "destroy"), "spell effect destroy must remain L2");
}

// Layer 1 only — additional cost
{
  const text = "As an additional cost to cast this spell, discard a card.\nDraw two cards.";
  assertNoCostLeak(text, ["discard"]);
  assert.ok(accepted(text).some((a) => a.actionType === "draw"), "draw effect must remain L2");
}

// Layer 1 only — activated cost before colon
{
  const text = "{T}, Discard this card: Draw a card.";
  assertNoCostLeak(text, ["discard", "tap"]);
  assert.ok(accepted(text).some((a) => a.actionType === "draw"), "post-colon draw must remain L2");
}

// Layer 2 valid — target player discards
{
  const text = "Target player discards a card.";
  assert.ok(accepted(text).some((a) => a.actionType === "discard"), "target discard must emit L2");
}

// Layer 2 valid — discard then draw (resolving effect, not cost)
{
  const text = "You discard two cards, then draw a card.";
  const actions = accepted(text);
  assert.ok(actions.some((a) => a.actionType === "discard"), "resolving discard must emit L2");
  assert.ok(actions.some((a) => a.actionType === "draw"), "draw must emit L2");
}

console.log("test-rc5-alternative-cost-policy-regressions: all passed");
