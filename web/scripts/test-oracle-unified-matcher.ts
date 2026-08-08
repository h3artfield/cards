/**
 * Unified matcher regression tests — evaluator defect fixes.
 * Run: npx tsx scripts/test-oracle-unified-matcher.ts
 */
import assert from "node:assert/strict";
import {
  faceIdsEquivalent,
  matchGoldToActions,
  actionMatchesModalStem,
  isModalStemGold,
} from "./oracle-action-unified-matcher";
import type { ExpectedPrimitiveAction } from "./oracle-action-eval-shared";

function testFaceAliases() {
  assert.equal(faceIdsEquivalent("left", "front"), true);
  assert.equal(faceIdsEquivalent("room_right", "back"), true);
  assert.equal(faceIdsEquivalent("front", "back"), false);
}

function testModalStemMultiCover() {
  const oracleText = "Choose one —\n• Exile target creature.\n• Draw two cards.";
  const expected: ExpectedPrimitiveAction[] = [
    { actionType: "exile", evidenceContains: "Exile" },
    { actionType: "draw", evidenceContains: "Draw two cards" },
  ];
  const actions = [
    {
      index: 0,
      primitive: "exile",
      evidenceText: "Exile target creature with power 3 or greater.",
      cardFaceId: "front",
      abilityIndex: 0,
      reviewStatus: "accepted" as const,
    },
    {
      index: 1,
      primitive: "draw",
      evidenceText: "Draw two cards.",
      cardFaceId: "front",
      abilityIndex: 0,
      reviewStatus: "accepted" as const,
    },
  ];
  assert.equal(isModalStemGold(expected[0], oracleText), true);
  assert.equal(actionMatchesModalStem(actions[0], expected[0]), true);
  const match = matchGoldToActions({ expected, actions, tier: "accepted", oracleText });
  assert.equal(match.unmatchedActionIndices.length, 0);
  assert.equal(match.unmatchedExpectedIndices.length, 0);
}

function testDuplicateGoldDedupedFn() {
  const expected: ExpectedPrimitiveAction[] = [
    {
      actionType: "put_onto_battlefield",
      evidenceContains: "put a land card from your hand onto the battlefield",
      optionalEffect: true,
    },
  ];
  const actions = [
    {
      index: 0,
      primitive: "put_onto_battlefield",
      evidenceText: "You may put a land card from your hand onto the battlefield.",
      cardFaceId: "front",
      abilityIndex: 0,
      reviewStatus: "accepted" as const,
      optionalEffect: true,
    },
  ];
  const match = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: "Draw a card. You may put a land card from your hand onto the battlefield." });
  assert.equal(match.unmatchedExpectedIndices.length, 0);
  assert.equal(match.unmatchedActionIndices.length, 0);
}

function testOracleTextPassedForModalStemCover() {
  const oracleText = "Choose two —\n• Counter target spell.\n• Return target permanent to its owner's hand.";
  const expected: ExpectedPrimitiveAction[] = [
    { actionType: "counter", evidenceContains: "Counter" },
    { actionType: "return_to_hand", evidenceContains: "Return" },
  ];
  const actions = [
    {
      index: 0,
      primitive: "counter",
      evidenceText: "Counter target noncreature spell.",
      cardFaceId: "front",
      abilityIndex: 0,
      reviewStatus: "accepted" as const,
    },
  ];
  const match = matchGoldToActions({ expected, actions, tier: "accepted", oracleText });
  assert.equal(match.unmatchedActionIndices.length, 0, "modal stem should cover counter bullet");
  assert.equal(match.unmatchedExpectedIndices.length, 1, "return stem unmatched without emission");
}

function main() {
  testFaceAliases();
  testModalStemMultiCover();
  testDuplicateGoldDedupedFn();
  testOracleTextPassedForModalStemCover();
  console.log("test-oracle-unified-matcher: all passed");
}

main();
