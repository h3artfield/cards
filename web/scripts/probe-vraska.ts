import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import { classifyUnmatchedAction, inferSupportedPrimitiveFromEvidence, spanValid } from "./oracle-action-eval-shared";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const env = JSON.parse(
  readFileSync("data/oracle-action-eval-development-generalization-expansion-v5.json", "utf8"),
) as { cases: unknown[] };
const c = (env.cases as Array<{ id: string; oracleId: string; oracleText: string; expectedPrimitiveActions: unknown[] }>).find(
  (x) => x.id === "dev-exp-v5-005",
)!;
const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText });
const actions = raw.actions.map((a, index) => ({
  index,
  primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
  evidenceText: a.evidenceText,
  evidenceStart: a.evidenceStart,
  evidenceEnd: a.evidenceEnd,
  cardFaceId: a.faceId,
  abilityIndex: a.abilityIndex,
  loyaltyCost: a.loyaltyCost,
  modalOptionId: a.modalOptionId,
  reviewStatus: a.reviewStatus as "accepted" | "needs_review",
}));
const expected = (c.expectedPrimitiveActions as Array<{ negative?: boolean }>).filter((e) => !e.negative);
const outcome = matchGoldToActions({
  expected: expected as never,
  actions,
  tier: "accepted",
  oracleText: c.oracleText,
});
console.log("unmatched", outcome.unmatchedActionIndices);
console.log(
  "infer",
  inferSupportedPrimitiveFromEvidence(c.oracleText, "Create three 1/1 black Assassin creature tokens"),
);
console.log("span", spanValid(c.oracleText, "Create three 1/1 black Assassin creature tokens", 142, 189));
for (const idx of outcome.unmatchedActionIndices) {
  const action = actions[idx];
  console.log(JSON.stringify({ action, cat: classifyUnmatchedAction({ testCase: c as never, primitive: action.primitive, evidenceText: action.evidenceText, evidenceStart: action.evidenceStart, evidenceEnd: action.evidenceEnd, cardFaceId: action.cardFaceId, abilityIndex: action.abilityIndex, loyaltyCost: action.loyaltyCost, modalOptionId: action.modalOptionId }) }, null, 2));
}
