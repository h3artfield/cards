/**
 * Diagnose v1.26 gate failures on dev + expansion v4.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
        sagaChapterId: a.sagaChapterId,
        modalOptionId: a.modalOptionId,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
      })),
    );
    const unsupported = raw.actions.filter((a) => a.reviewStatus === "needs_review" && a.abstainReason?.includes("unsupported"));
    if (unified.accepted.fn > 0 || unified.accepted.fp > 0 || unsupported.length > 0) {
      failures.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        family: (testCase as { expansionMetadata?: { family?: string } }).expansionMetadata?.family,
        tp: unified.accepted.tp,
        fp: unified.accepted.fp,
        fn: unified.accepted.fn,
        gold: testCase.expectedPrimitiveActions.filter((e) => !e.negative),
        accepted: raw.actions
          .filter((a) => a.reviewStatus === "accepted")
          .map((a) => ({
            primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
            evidence: a.evidenceText.slice(0, 80),
            loyaltyCost: a.loyaltyCost,
            modalOptionId: a.modalOptionId,
          })),
        needsReview: raw.actions
          .filter((a) => a.reviewStatus === "needs_review")
          .map((a) => ({ primitive: a.actionType, evidence: a.evidenceText.slice(0, 80), reason: a.abstainReason })),
      });
    }
  }
  return { label, path, parserVersion: ORACLE_ACTION_PARSER_VERSION, failureCount: failures.length, failures };
}

const sets = [
  ["data/oracle-action-eval-development-v26.json", "dev_v26"],
  ["data/oracle-action-eval-development-generalization-expansion-v4.json", "exp_v4"],
  ["data/oracle-action-eval-development-generalization-expansion-v3.json", "exp_v3"],
];

const all = sets.map(([p, l]) => diagnose(p, l));
const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/v126-gate-failure-diagnosis.json");
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), sets: all }, null, 2));
console.log(JSON.stringify(all.map((s) => ({ label: s.label, failureCount: s.failureCount, ids: s.failures.map((f) => f.caseId) })), null, 2));
