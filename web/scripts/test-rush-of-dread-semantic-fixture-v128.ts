/**
 * Rush of Dread end-to-end semantic representation fixture (v1.28).
 */
import assert from "node:assert/strict";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";

const ORACLE_ID = "0dfe6ec6-a0df-41c8-90dd-1ddf0417700a";
const ORACLE_TEXT =
  "Spree (Choose one or more additional costs.)\n+ {1} — Target opponent sacrifices half the creatures they control of their choice, rounded up.\n+ {2} — Target opponent discards half the cards in their hand, rounded up.\n+ {2} — Target opponent loses half their life, rounded up.";

function testRushOfDreadSemanticFixture() {
  const parse = parseOracleSemantics({ oracleId: ORACLE_ID, oracleText: ORACLE_TEXT });
  const modal = parse.abilities.find((a) => a.mechanic === "spree");
  assert.ok(modal, "spree modal ability");
  assert.equal(modal!.abilityType, "modal");
  assert.equal(modal!.choose?.minimum, 1);
  assert.equal(modal!.choose?.maximum, "all");
  assert.equal(modal!.options?.length, 3);

  const opt1 = modal!.options!.find((o) => o.ordinal === 1)!;
  const opt2 = modal!.options!.find((o) => o.ordinal === 2)!;
  const opt3 = modal!.options!.find((o) => o.ordinal === 3)!;

  assert.equal(opt1.additionalCost?.mana?.[0], "1");
  assert.equal(opt2.additionalCost?.mana?.[0], "2");
  assert.equal(opt3.additionalCost?.mana?.[0], "2");
  assert.equal(opt1.segmentAbilityIndex, 1);
  assert.equal(opt2.segmentAbilityIndex, 2);
  assert.equal(opt3.segmentAbilityIndex, 3);

  const sac = parse.actions.find((a) => a.actionType === "sacrifice")!;
  const disc = parse.actions.find((a) => a.actionType === "discard")!;
  const life = parse.actions.find((a) => a.actionType === "lose_life")!;

  assert.equal(sac.modalOptionId, opt1.optionId);
  assert.equal(disc.modalOptionId, opt2.optionId);
  assert.equal(life.modalOptionId, opt3.optionId);

  assert.equal(sac.arguments.affectedPlayer, "target_opponent");
  assert.equal(sac.arguments.quantity?.quantityType, "derived");
  assert.equal(sac.arguments.quantity?.quantityRounding, "up");
  assert.equal(sac.arguments.choice?.chooser, "affected_player");
  assert.ok(sac.provenance.targetSpan?.text.includes("Target opponent"));
  assert.ok(sac.provenance.roundingSpan?.text.includes("rounded up"));

  assert.equal(disc.arguments.affectedPlayer, "target_opponent");
  assert.equal(disc.arguments.object?.zone, "hand");
  assert.equal(disc.arguments.quantity?.quantityType, "derived");
  assert.equal(disc.arguments.quantity?.quantityRounding, "up");
  assert.ok(disc.provenance.quantitySpan?.text.includes("half the cards"));
  assert.ok(disc.provenance.roundingSpan?.text.includes("rounded up"));
  assert.ok(disc.provenance.actionSpan.cardStart >= opt2.optionSpan.cardStart);
  assert.ok(disc.provenance.actionSpan.cardEnd <= opt2.optionSpan.cardEnd);

  assert.equal(life.arguments.affectedPlayer, "target_opponent");
  assert.equal(life.arguments.quantity?.quantityBase, "affected_player.life_total");
  assert.ok(life.provenance.targetSpan?.text.includes("Target opponent"));

  assert.equal(parse.oracleTextHash.length, 64);
  assert.equal(parse.actions.filter((a) => a.reviewStatus === "accepted").length, 3);
  console.log("✓ Rush of Dread semantic fixture");
}

testRushOfDreadSemanticFixture();
console.log("\nRush of Dread semantic fixture passed.");
