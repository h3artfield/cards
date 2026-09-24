/**
 * Diagnose v1.27 training corpus failures.
 */
import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

function diagnose(path: string, label: string) {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const failures: Array<Record<string, unknown>> = [];
  for (const testCase of envelope.cases) {
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
        modalOptionId: a.modalOptionId,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
      })),
    );
    if (unified.accepted.fp > 0 || unified.accepted.fn > 0) {
      failures.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        ...unified.accepted,
        accepted: raw.actions
          .filter((a) => a.reviewStatus === "accepted")
          .map((a) => ({
            primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
            evidence: a.evidenceText.slice(0, 80),
            loyaltyCost: a.loyaltyCost,
            modalOptionId: a.modalOptionId,
          })),
      });
    }
  }
  return { label, failureCount: failures.length, failures };
}

const sets = [
  ["data/oracle-action-eval-development-generalization-expansion-v5.json", "exp_v5"],
  ["data/oracle-action-eval-development-generalization-expansion-v4.json", "exp_v4"],
];

console.log(
  JSON.stringify(
    { parserVersion: ORACLE_ACTION_PARSER_VERSION, sets: sets.map(([p, l]) => diagnose(p, l)) },
    null,
    2,
  ),
);
