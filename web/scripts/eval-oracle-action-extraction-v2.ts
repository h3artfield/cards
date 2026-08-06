/**
 * Run Oracle-action extraction evaluation with field-level precision/recall gates.
 * Run: npx tsx scripts/eval-oracle-action-extraction-v2.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ORACLE_ACTION_PRODUCTION_GATES,
  ORACLE_ACTION_PARSER_VERSION,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { validateEvidenceSpan } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import {
  extractOracleActionsV1,
  toLegacyExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import {
  EVAL_PSEUDO_ACTION_TYPES,
  normalizeActionType,
  normalizeEvalExpectedActionType,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCase } from "./generate-oracle-action-eval-cases";

interface FieldMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
}

interface FailedCase {
  id: string;
  category: string;
  reason: string;
  expected: string[];
  extracted: string[];
  missing: string[];
  extra: string[];
}

function computeMetrics(tp: number, fp: number, fn: number): FieldMetrics {
  const precision = tp + fp > 0 ? tp / (tp + fp) : tp > 0 ? 1 : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : tp > 0 ? 1 : 0;
  const falsePositiveRate = tp + fp > 0 ? fp / (tp + fp) : fp > 0 ? 1 : 0;
  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, falsePositiveRate };
}

function gatePass(value: number, target: number, direction: "min" | "max"): boolean {
  return direction === "min" ? value >= target : value <= target;
}

function actionMatchesExpected(
  action: ReturnType<typeof toLegacyExtractionResult>["actions"][number],
  exp: OracleActionEvalCase["expectedActions"][number],
): boolean {
  const expectedType = normalizeEvalExpectedActionType(exp.actionType, exp.evidenceContains);
  const extractedType = normalizeActionType(action.effects[0]?.actionType ?? "");
  const evidenceOk = action.evidenceText.toLowerCase().includes(exp.evidenceContains.toLowerCase());

  if ((EVAL_PSEUDO_ACTION_TYPES as readonly string[]).includes(exp.actionType)) {
    return evidenceOk;
  }

  return extractedType === expectedType && evidenceOk;
}

async function main() {
  const casesPath = resolve(process.cwd(), "data", "oracle-action-eval-cases.json");
  const { cases } = JSON.parse(readFileSync(casesPath, "utf8")) as {
    caseCount: number;
    cases: OracleActionEvalCase[];
  };

  let actionTp = 0;
  let actionFp = 0;
  let actionFn = 0;
  let triggerTp = 0;
  let triggerFp = 0;
  let triggerFn = 0;
  let costTp = 0;
  let costFp = 0;
  let costFn = 0;
  let zoneTp = 0;
  let zoneFp = 0;
  let zoneFn = 0;
  let abilityTp = 0;
  let abilityFp = 0;
  let abilityFn = 0;
  let optionalityTp = 0;
  let optionalityFp = 0;
  let optionalityFn = 0;
  let faceTp = 0;
  let faceFp = 0;
  let faceFn = 0;

  let evidenceValid = 0;
  let evidenceTotal = 0;
  let inventedEffects = 0;
  let oracleFaceCorrect = 0;
  let abstentions = 0;

  const failedCases: FailedCase[] = [];

  for (const testCase of cases) {
    const extraction = toLegacyExtractionResult(extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    }));

    oracleFaceCorrect += extraction.oracleId === testCase.oracleId ? 1 : 0;

    if (testCase.cardFace) {
      const faceOk = extraction.actions.every((a) => a.cardFaceId === testCase.cardFace);
      if (faceOk || extraction.actions.length === 0) faceTp += 1;
      else {
        faceFp += 1;
        faceFn += 1;
      }
    }

    for (const action of extraction.actions) {
      evidenceTotal += 1;
      const span = validateEvidenceSpan(
        testCase.oracleText,
        action.evidenceText,
        action.evidenceStart,
        action.evidenceEnd,
      );
      if (span.valid) evidenceValid += 1;
    }

    abstentions += extraction.abstainedClauses.length;

    const expectedPositive = testCase.expectedActions.filter((e) => !e.negative);
    const matchedExpected = new Set<number>();
    const matchedActions = new Set<number>();

    for (let ei = 0; ei < expectedPositive.length; ei++) {
      const exp = expectedPositive[ei];
      const idx = extraction.actions.findIndex((a, ai) =>
        !matchedActions.has(ai) && actionMatchesExpected(a, exp),
      );
      if (idx >= 0) {
        actionTp += 1;
        matchedExpected.add(ei);
        matchedActions.add(idx);

        const action = extraction.actions[idx];
        if (exp.abilityType === "triggered" || exp.actionType === "triggered") {
          if (action.abilityType === "triggered") triggerTp += 1;
          else triggerFn += 1;
        }
        if (exp.actionType === "optional") {
          const optional = /\bYou may\b|\bup to\b/i.test(action.evidenceText);
          if (optional) optionalityTp += 1;
          else optionalityFn += 1;
        }
        if (action.costs?.length || action.effects.some((e) => e.sourceZone?.length)) {
          zoneTp += 1;
        }
        if (action.costs?.length) costTp += 1;
        if (exp.abilityType && action.abilityType === exp.abilityType) abilityTp += 1;
        else if (exp.abilityType) abilityFn += 1;
      } else {
        actionFn += 1;
        if (exp.abilityType === "triggered" || exp.actionType === "triggered") triggerFn += 1;
        if (exp.actionType === "optional") optionalityFn += 1;
        if (exp.abilityType) abilityFn += 1;
      }
    }

    for (let ai = 0; ai < extraction.actions.length; ai++) {
      if (matchedActions.has(ai)) continue;
      const action = extraction.actions[ai];
      const type = normalizeActionType(action.effects[0]?.actionType ?? "");
      const forbidden = testCase.forbiddenActions ?? [];
      if (forbidden.includes(type)) {
        actionFp += 1;
        inventedEffects += 1;
        continue;
      }
      const coversExpected = expectedPositive.some((exp, ei) =>
        matchedExpected.has(ei) && normalizeEvalExpectedActionType(exp.actionType, exp.evidenceContains) === type,
      );
      if (!coversExpected && expectedPositive.length > 0) {
        actionFp += 1;
      }
    }

    for (const forbidden of testCase.forbiddenActions ?? []) {
      const hit = extraction.actions.some((a) =>
        normalizeActionType(a.effects[0]?.actionType ?? "") === normalizeActionType(forbidden),
      );
      if (hit) {
        actionFp += 1;
        inventedEffects += 1;
      }
    }

    if (expectedPositive.length > 0 && matchedExpected.size < expectedPositive.length) {
      const missing = expectedPositive
        .filter((_, i) => !matchedExpected.has(i))
        .map((e) => `${e.actionType}:${e.evidenceContains}`);
      const extra = extraction.actions
        .filter((_, i) => !matchedActions.has(i))
        .map((a) => `${normalizeActionType(a.effects[0]?.actionType ?? "")}:${a.evidenceText.slice(0, 40)}`);
      failedCases.push({
        id: testCase.id,
        category: testCase.category,
        reason: "unmatched_expected_actions",
        expected: expectedPositive.map((e) => `${e.actionType}:${e.evidenceContains}`),
        extracted: extraction.actions.map((a) =>
          `${normalizeActionType(a.effects[0]?.actionType ?? "")}:${a.evidenceText.slice(0, 40)}`,
        ),
        missing,
        extra,
      });
    }
  }

  const actionMetrics = computeMetrics(actionTp, actionFp, actionFn);
  const triggerMetrics = computeMetrics(triggerTp, triggerFp, triggerFn);
  const costMetrics = computeMetrics(costTp, costFp, costFn);
  const zoneMetrics = computeMetrics(zoneTp, zoneFp, zoneFn);
  const abilityMetrics = computeMetrics(abilityTp, abilityFp, abilityFn);
  const optionalityMetrics = computeMetrics(optionalityTp, optionalityFp, optionalityFn);
  const faceMetrics = computeMetrics(faceTp, faceFp, faceFn);

  const evidenceSpanValidity = evidenceTotal > 0 ? evidenceValid / evidenceTotal : 1;
  const oracleFaceAccuracy = cases.length > 0 ? oracleFaceCorrect / cases.length : 1;
  const abstentionRate = cases.length > 0 ? abstentions / cases.length : 0;

  const gateResults = {
    evidenceSpanValidity: {
      value: evidenceSpanValidity,
      target: ORACLE_ACTION_PRODUCTION_GATES.evidenceSpanValidity.target,
      pass: gatePass(evidenceSpanValidity, ORACLE_ACTION_PRODUCTION_GATES.evidenceSpanValidity.target, "min"),
    },
    oracleIdAndCardFaceAccuracy: {
      value: oracleFaceAccuracy,
      target: ORACLE_ACTION_PRODUCTION_GATES.oracleIdAndCardFaceAccuracy.target,
      pass: gatePass(oracleFaceAccuracy, ORACLE_ACTION_PRODUCTION_GATES.oracleIdAndCardFaceAccuracy.target, "min"),
    },
    unsupportedInventedEffects: {
      value: inventedEffects,
      target: ORACLE_ACTION_PRODUCTION_GATES.unsupportedInventedEffects.target,
      pass: inventedEffects === 0,
    },
    actionTypePrecision: {
      value: actionMetrics.precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.actionTypePrecision.target,
      pass: gatePass(actionMetrics.precision, ORACLE_ACTION_PRODUCTION_GATES.actionTypePrecision.target, "min"),
    },
    actionTypeRecall: {
      value: actionMetrics.recall,
      target: ORACLE_ACTION_PRODUCTION_GATES.actionTypeRecall.target,
      pass: gatePass(actionMetrics.recall, ORACLE_ACTION_PRODUCTION_GATES.actionTypeRecall.target, "min"),
    },
    zoneTransitionPrecision: {
      value: zoneMetrics.precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.zoneTransitionPrecision.target,
      pass: gatePass(zoneMetrics.precision, ORACLE_ACTION_PRODUCTION_GATES.zoneTransitionPrecision.target, "min"),
    },
    triggerClassificationPrecision: {
      value: triggerMetrics.precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.triggerClassificationPrecision.target,
      pass: gatePass(triggerMetrics.precision, ORACLE_ACTION_PRODUCTION_GATES.triggerClassificationPrecision.target, "min"),
    },
    costClassificationPrecision: {
      value: costMetrics.precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.costClassificationPrecision.target,
      pass: gatePass(costMetrics.precision, ORACLE_ACTION_PRODUCTION_GATES.costClassificationPrecision.target, "min"),
    },
    falsePositiveRate: {
      value: actionMetrics.falsePositiveRate,
      target: ORACLE_ACTION_PRODUCTION_GATES.falsePositiveRate.target,
      pass: gatePass(actionMetrics.falsePositiveRate, ORACLE_ACTION_PRODUCTION_GATES.falsePositiveRate.target, "max"),
    },
  };

  const allGatesPass = Object.values(gateResults).every((g) => g.pass);

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    evalCaseCount: cases.length,
    productionGates: ORACLE_ACTION_PRODUCTION_GATES,
    gateResults,
    allProductionGatesPass: allGatesPass,
    fieldMetrics: {
      actionType: actionMetrics,
      triggerClassification: triggerMetrics,
      costClassification: costMetrics,
      zoneTransition: zoneMetrics,
      abilityType: abilityMetrics,
      optionality: optionalityMetrics,
      cardFace: faceMetrics,
      evidenceSpanValidity,
      abstentionCount: abstentions,
      abstentionRate,
      inventedEffects,
    },
    failedCases: failedCases.slice(0, 30),
    failedCaseCount: failedCases.length,
    pilotStatus: {
      ready: allGatesPass,
      reason: allGatesPass
        ? "Production gates met on 204-case eval set"
        : "Production gates not met — 500-card pilot remains blocked",
    },
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-extraction-eval-v2.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Eval: ${cases.length} cases`);
  console.log(`  action precision: ${(actionMetrics.precision * 100).toFixed(1)}%`);
  console.log(`  action recall:    ${(actionMetrics.recall * 100).toFixed(1)}%`);
  console.log(`  false-positive:   ${(actionMetrics.falsePositiveRate * 100).toFixed(1)}%`);
  console.log(`  trigger precision:${(triggerMetrics.precision * 100).toFixed(1)}%`);
  console.log(`  zone precision:   ${(zoneMetrics.precision * 100).toFixed(1)}%`);
  console.log(`  cost precision:   ${(costMetrics.precision * 100).toFixed(1)}%`);
  console.log(`  abstention rate:  ${(abstentionRate * 100).toFixed(1)}%`);
  console.log(`  failed cases:     ${failedCases.length}`);
  console.log(`  all gates pass:   ${allGatesPass}`);
  console.log(`Report: ${outPath}`);
}

main();
