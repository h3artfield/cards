/**
 * Replacement exile-instead policy regressions.
 * Run: cd web && npx tsx scripts/test-rc3-replacement-policy-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { classifyTextRoleAt } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

function accepted(text: string) {
  return parseOracleSemanticsRC3({ oracleId: "test-replacement-policy", oracleText: text }).actions.filter(
    (a) => a.reviewStatus === "accepted",
  );
}

function roleAt(text: string, evidence: string) {
  const idx = text.indexOf(evidence);
  assert.ok(idx >= 0, `evidence not found: ${evidence}`);
  return classifyTextRoleAt({
    paragraph: text,
    localStart: idx,
    localEnd: idx + evidence.length,
  });
}

{
  const text = "If Spectral Binding would be put into a graveyard from anywhere, exile it instead.";
  const actions = accepted(text);
  assert.equal(actions.filter((a) => a.actionType === "put_into_graveyard").length, 0);
  assert.equal(actions.filter((a) => a.actionType === "exile").length, 1);
}

{
  const text = "If this would die, exile it instead.";
  assert.equal(accepted(text).filter((a) => a.actionType === "exile").length, 1);
}

{
  const text = "If you would draw a card, instead draw two cards.";
  assert.equal(accepted(text).filter((a) => a.actionType === "exile").length, 0);
}

{
  const text = "Whenever you cast a spell, draw a card.";
  assert.equal(
    accepted(text).filter((a) => a.actionType === "cast" && /Whenever you cast/i.test(a.provenance.actionSpan.text)).length,
    0,
  );
  assert.equal(roleAt(text, "Whenever you cast a spell"), "trigger_event");
}

{
  const text = "until it is cast from exile, it gains haste.";
  assert.equal(accepted(text).filter((a) => a.actionType === "cast").length, 0);
}

console.log("test-rc3-replacement-policy-regressions: all passed");
