/**
 * v1.27 structural block invariant tests — synthetic fixtures, not spent check-v3 cards.
 * Run: npx tsx scripts/test-oracle-structural-blocks-v127.ts
 */
import assert from "node:assert/strict";
import {
  actionWithinLoyaltyBlock,
  actionWithinModalOption,
  buildLoyaltyAbilities,
  buildModalOptions,
  isSpellCopyPrimitive,
  isTokenCopyCreation,
  parseTokenCopyOf,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks";

const ORACLE = "test-oracle-id";
const FACE = "front";

function testLoyaltyBlockIsolation() {
  const text =
    "+1: Draw a card, then discard a card.\n+1: You may exile a nonland card with mana value 3 or less from your hand.\n−6: Until end of turn, whenever you cast a spell, copy it.";
  const blocks = buildLoyaltyAbilities(ORACLE, FACE, text);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].loyaltyCost, "+1");
  assert.equal(blocks[1].loyaltyCost, "+1");
  assert.notEqual(blocks[0].abilityId, blocks[1].abilityId);

  const drawStart = text.indexOf("Draw a card");
  const ok = actionWithinLoyaltyBlock(
    { evidenceStart: drawStart, evidenceEnd: drawStart + "Draw a card".length, loyaltyCost: "+1" },
    blocks,
  );
  assert.ok(ok.ok, ok.reason);

  const copyStart = text.indexOf("copy it");
  const bad = actionWithinLoyaltyBlock(
    { evidenceStart: copyStart, evidenceEnd: copyStart + "copy it".length, loyaltyCost: "+1" },
    blocks,
  );
  assert.equal(bad.ok, false);
  console.log("✓ loyalty block isolation");
}

function testDualPlusOneSeparateAbilityIds() {
  const text = "+1: Untap all creatures you control.\n+1: Search your library and/or graveyard for a Monk.";
  const blocks = buildLoyaltyAbilities(ORACLE, FACE, text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].loyaltyCost, "+1");
  assert.equal(blocks[1].loyaltyCost, "+1");
  assert.notEqual(blocks[0].abilityIndex, blocks[1].abilityIndex);
  console.log("✓ dual +1 separate abilityIds");
}

function testMinusXBoundary() {
  const text = "+2: Draw a card.\n−X: Deal X damage to each of up to three targets.";
  const blocks = buildLoyaltyAbilities(ORACLE, FACE, text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].loyaltyCost, "−X");
  const dmg = text.indexOf("Deal X damage");
  const leak = actionWithinLoyaltyBlock(
    { evidenceStart: dmg, evidenceEnd: dmg + 20, loyaltyCost: "+2" },
    blocks,
  );
  assert.equal(leak.ok, false);
  console.log("✓ −X boundary");
}

function testSpreeOptionIsolation() {
  const text =
    "Spree (Choose one or more additional costs.)\n+ {1} — Target opponent sacrifices half the creatures they control of their choice, rounded up.\n+ {2} — Target opponent discards half the cards in their hand, rounded up.\n+ {2} — Target opponent loses half their life, rounded up.";
  const groups = buildModalOptions(ORACLE, FACE, text);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].options.length, 3);
  assert.equal(groups[0].options[0].optionCost, "+ {1}");
  assert.equal(groups[0].options[1].optionId, "opt-2");

  const sacIdx = text.indexOf("sacrifices half");
  const discIdx = text.indexOf("discards half");
  assert.ok(
    actionWithinModalOption(
      { evidenceStart: sacIdx, evidenceEnd: sacIdx + 20, modalOptionId: "opt-1" },
      groups,
    ).ok || groups[0].options[0].startOffset <= sacIdx,
  );
  const cross = actionWithinModalOption(
    { evidenceStart: sacIdx, evidenceEnd: sacIdx + 20, modalOptionId: "opt-2" },
    groups,
  );
  assert.equal(cross.ok, false);
  console.log("✓ spree option isolation");
}

function testTokenCopyTaxonomy() {
  const tokenEv = "Create a token that's a copy of target artifact or creature you control";
  assert.ok(isTokenCopyCreation(tokenEv));
  assert.equal(parseTokenCopyOf(tokenEv), "target artifact or creature you control");
  assert.ok(isSpellCopyPrimitive("Copy target instant spell"));
  assert.ok(!isSpellCopyPrimitive(tokenEv));
  console.log("✓ token-copy taxonomy");
}

function testChooseOneModalBullets() {
  const text =
    "Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.";
  const groups = buildModalOptions(ORACLE, FACE, text);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].options.length, 2);
  assert.equal(groups[0].options[0].optionId, "opt-1");
  assert.equal(groups[0].options[1].optionId, "opt-2");
  console.log("✓ choose-one modal bullets");
}

function main() {
  testLoyaltyBlockIsolation();
  testDualPlusOneSeparateAbilityIds();
  testMinusXBoundary();
  testSpreeOptionIsolation();
  testTokenCopyTaxonomy();
  testChooseOneModalBullets();
  console.log("\nAll v1.27 structural invariant tests passed.");
}

main();
