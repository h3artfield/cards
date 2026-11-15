import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const cases = (
  JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v3.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }
).cases;

for (const testCase of cases) {
  const raw = extractOracleActionsV1({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
  });
  const unified = evaluateCaseUnified(
    testCase,
    raw.actions.map((a) => ({
      actionType: a.actionType,
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      faceId: a.faceId,
      abilityIndex: a.abilityIndex,
      loyaltyCost: a.loyaltyCost,
      sagaChapterId: a.sagaChapterId,
      modalOptionId: a.modalOptionId,
      reviewStatus: a.reviewStatus,
      optionalEffect: a.optionalEffect,
      optional: a.optional,
    })),
  );
  if (unified.accepted.fp > 0 || unified.accepted.fn > 0) {
    console.log(testCase.id, testCase.cardName, unified.accepted);
    console.log(
      "gold:",
      testCase.expectedPrimitiveActions.filter((e) => !e.negative),
    );
    console.log(
      "accepted:",
      raw.actions.filter((a) => a.reviewStatus === "accepted").map((a) => ({
        type: a.actionType,
        ev: a.evidenceText.slice(0, 60),
        loyalty: a.loyaltyCost,
        ability: a.abilityIndex,
      })),
    );
    console.log("---");
  }
}
