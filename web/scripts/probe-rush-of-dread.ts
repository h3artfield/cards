import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import { classifyUnmatchedAction, inferSupportedPrimitiveFromEvidence, spanValid } from "./oracle-action-eval-shared";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const env = JSON.parse(
  readFileSync("data/oracle-action-eval-development-generalization-expansion-v4.json", "utf8"),
) as { cases: Array<{ id: string; oracleId: string; oracleText: string; expectedPrimitiveActions: unknown[] }> };
const c = env.cases.find((x) => x.id === "dev-exp-v4-012")!;
const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText });
const actions = raw.actions.map((a, index) => ({
  index,
  primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
  evidenceText: a.evidenceText,
  evidenceStart: a.evidenceStart,
  evidenceEnd: a.evidenceEnd,
  cardFaceId: a.faceId,
  abilityIndex: a.abilityIndex,
  modalOptionId: a.modalOptionId,
  reviewStatus: a.reviewStatus as "accepted" | "needs_review",
}));
console.log(
  "accepted",
  actions.filter((a) => a.reviewStatus === "accepted").map((a) => a.primitive),
);
const expected = (c.expectedPrimitiveActions as Array<{ negative?: boolean }>).filter((e) => !e.negative);
const outcome = matchGoldToActions({
  expected: expected as never,
  actions,
  tier: "accepted",
  oracleText: c.oracleText,
});
for (const idx of outcome.unmatchedActionIndices) {
  const action = actions[idx];
  const cat = classifyUnmatchedAction({
    testCase: c as never,
    primitive: action.primitive,
    evidenceText: action.evidenceText,
    evidenceStart: action.evidenceStart,
    evidenceEnd: action.evidenceEnd,
    cardFaceId: action.cardFaceId,
    abilityIndex: action.abilityIndex,
  });
  console.log(action.primitive, cat, action.evidenceText.slice(0, 70), action.evidenceStart, action.evidenceEnd);
  console.log("  spanValid", spanValid(c.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd));
  console.log("  supported", inferSupportedPrimitiveFromEvidence(c.oracleText, action.evidenceText));
}
