/**
 * One-shot diagnosis of expansion-check-v2 execution #1 failures.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const path = "data/oracle-action-eval-development-generalization-expansion-check-v2.json";
const envelope = JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] };

const failures: Array<Record<string, unknown>> = [];

for (const testCase of envelope.cases) {
  const raw = extractOracleActionsV1({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
  });
  const actions = raw.actions.map((a, index) => ({
    index,
    primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
    evidenceText: a.evidenceText,
    reviewStatus: a.reviewStatus,
    loyaltyCost: a.loyaltyCost,
    abilityIndex: a.abilityIndex,
    modalOptionId: a.modalOptionId,
  }));
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
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    failures.push({
      caseId: testCase.id,
      family: (testCase as { expansionMetadata?: { family?: string } }).expansionMetadata?.family,
      tp: unified.accepted.tp,
      fp: unified.accepted.fp,
      fn: unified.accepted.fn,
      gold: expected,
      accepted: actions.filter((a) => a.reviewStatus === "accepted"),
      needsReview: actions.filter((a) => a.reviewStatus === "needs_review"),
    });
  }
}

const familyCounts: Record<string, number> = {};
for (const f of failures) {
  const fam = String(f.family ?? "unknown");
  familyCounts[fam] = (familyCounts[fam] ?? 0) + 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  parserVersion: ORACLE_ACTION_PARSER_VERSION,
  failureCount: failures.length,
  caseFailures: failures.length,
  familyCounts,
  failures,
};

const outPath = resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-check-v2-failure-diagnosis.json");
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outPath, familyCounts, failureIds: failures.map((f) => f.caseId) }, null, 2));
