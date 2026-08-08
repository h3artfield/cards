/**
 * Diagnose expansion-check-v3 execution #1 failures.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const path = "data/oracle-action-eval-development-generalization-expansion-check-v3.json";
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
      sagaChapterId: a.sagaChapterId,
      modalOptionId: a.modalOptionId,
      reviewStatus: a.reviewStatus,
      optionalEffect: a.optionalEffect,
      optional: a.optional,
    })),
  );
  if (unified.accepted.fn > 0 || unified.accepted.fp > 0) {
    failures.push({
      caseId: testCase.id,
      cardName: testCase.cardName,
      stratum: (testCase as { expansionMetadata?: { family?: string } }).expansionMetadata?.family,
      tp: unified.accepted.tp,
      fp: unified.accepted.fp,
      fn: unified.accepted.fn,
      gold: testCase.expectedPrimitiveActions.filter((e) => !e.negative),
      accepted: raw.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({
          type: normalizeToPrimitive(a.actionType, a.evidenceText),
          evidence: a.evidenceText.slice(0, 90),
          loyaltyCost: a.loyaltyCost,
          abilityIndex: a.abilityIndex,
          modalOptionId: a.modalOptionId,
          optionalEffect: a.optionalEffect,
        })),
    });
  }
}

const familyCounts: Record<string, number> = {};
for (const f of failures) {
  const fam = String(f.stratum ?? "unknown");
  familyCounts[fam] = (familyCounts[fam] ?? 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  parserVersion: ORACLE_ACTION_PARSER_VERSION,
  executionNumber: 1,
  failureCount: failures.length,
  familyCounts,
  failureClassification: "pending_review",
  failures,
};

const outPath = resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-check-v3-execution-1-diagnosis.json");
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outPath, familyCounts, ids: failures.map((f) => f.caseId) }, null, 2));
