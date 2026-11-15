import { buildLoyaltyAbilities, findLoyaltyBlockForSpan } from "../src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const text =
  "+1: Until your next turn, whenever a creature deals combat damage to Vraska, destroy that creature.\n−3: Destroy target nonland permanent.\n−7: Create three 1/1 black Assassin creature tokens with \"Whenever this token deals combat damage to a player, that player loses the game.\"";
const blocks = buildLoyaltyAbilities("test", "front", text);
console.log(blocks.map((b) => ({ cost: b.loyaltyCost, idx: b.abilityIndex, start: b.startOffset, end: b.endOffset })));
const raw = extractOracleActionsV1({ oracleId: "test", oracleText: text });
for (const a of raw.actions.filter((x) => x.reviewStatus === "accepted")) {
  const block = findLoyaltyBlockForSpan(blocks, a.evidenceStart, a.evidenceEnd);
  console.log({
    type: a.actionType,
    evidence: a.evidenceText.slice(0, 50),
    abilityIndex: a.abilityIndex,
    loyaltyCost: a.loyaltyCost,
    span: [a.evidenceStart, a.evidenceEnd],
    blockCost: block?.loyaltyCost,
    blockIdx: block?.abilityIndex,
  });
}

import { goldCoveredAbilityScopeKeys } from "./oracle-action-eval-shared";
const testCase = {
  oracleId: "test",
  oracleText: text,
  expectedPrimitiveActions: [
    { actionType: "destroy", evidenceContains: "Destroy target nonland permanent", loyaltyCost: "−3" },
  ],
};
console.log("covered", [...goldCoveredAbilityScopeKeys(testCase as never)]);
