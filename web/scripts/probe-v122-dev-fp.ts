/**
 * List accepted-tier metric FPs and unsupported cases (v1.22).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1, toLegacyExtractionResult } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

// Replicate accepted-tier FP detection from eval-oracle-action-extraction-v6
import {
  classifyFalsePositive,
  extractedPrimitive,
  evidenceMatchesExtracted,
  hasUpToConstraint,
  isOptionalEvidence,
  primitiveMatchesExpected,
  spanValid,
} from "./oracle-action-eval-shared";

const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v25.json", "utf8")) as {
  cases: OracleActionEvalCaseV2[];
};

const acceptedFps: Array<Record<string, unknown>> = [];
const unsupportedAccepted: Array<Record<string, unknown>> = [];

for (const testCase of dev.cases) {
  const raw = extractOracleActionsV1({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
  });
  const extraction = toLegacyExtractionResult(raw);
  const actionViews = extraction.actions.map((a, index) => ({
    index,
    primitive: extractedPrimitive(a),
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart,
    evidenceEnd: a.evidenceEnd,
    cardFaceId: a.cardFaceId,
    abilityIndex: a.abilityIndex,
    reviewStatus: a.reviewStatus,
    optional: a.optionalEffect ?? isOptionalEvidence(a.evidenceText),
    optionalEffect: a.optionalEffect,
    optionalCost: a.optionalCost,
    hasUpToConstraint: hasUpToConstraint(a.evidenceText) || a.targetMaximum !== undefined,
    conditions: a.effects.flatMap((e) => e.conditions ?? []),
    quantityConstraint: a.effects[0]?.quantity,
  }));

  const acceptedViews = actionViews.filter((a) => a.reviewStatus === "accepted");
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const matchedActions = new Set<number>();

  for (const exp of expected) {
    const idx = acceptedViews.findIndex((a, ai) => !matchedActions.has(a.index) && primitiveMatchesExpected(a, exp));
    if (idx >= 0) matchedActions.add(acceptedViews[idx].index);
  }

  for (const action of acceptedViews) {
    if (matchedActions.has(action.index) || !action.primitive) continue;
    const fpCategory = classifyFalsePositive({
      testCase,
      action,
      oracleText: testCase.oracleText,
      matchedExpectedIndices: new Set(),
      allActions: acceptedViews,
    });
    const isParserError =
      fpCategory !== "correct_action_missing_from_gold_labels" && fpCategory !== "evaluator_matching_defect";
    if (isParserError) {
      acceptedFps.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        primitive: action.primitive,
        evidence: action.evidenceText,
        fpCategory,
        optionalEffect: action.optionalEffect,
        cardFaceId: action.cardFaceId,
      });
    }
    if (fpCategory === "genuinely_unsupported_extraction") {
      unsupportedAccepted.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        primitive: action.primitive,
        evidence: action.evidenceText,
      });
    }
  }
}

const evalResult = evaluateCaseSet(dev.cases, "development_v25");
const out = {
  acceptedTierMetricFpCount: acceptedFps.length,
  acceptedFps,
  unsupportedAccepted,
  authoritative: evalResult.authoritativeClassification.counts,
  acceptedMetrics: evalResult.metricsByEmissionTier.acceptedOnly,
};

writeFileSync(resolve(process.cwd(), "reports/v122-dev-fp-unsupported.json"), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify({ fp: acceptedFps.length, unsupported: unsupportedAccepted.length, ...out.acceptedMetrics }, null, 2));
console.log(JSON.stringify(acceptedFps, null, 2));
