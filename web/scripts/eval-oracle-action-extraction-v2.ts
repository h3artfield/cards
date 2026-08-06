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
import {
  segmentOracleCard,
  validateEvidenceSpan,
} from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { extractOracleActionsV1, toLegacyExtractionResult } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import type { OracleActionEvalCase } from "./generate-oracle-action-eval-cases";

interface FieldMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
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
  let zoneTp = 0;
  let zoneFp = 0;
  let evidenceValid = 0;
  let evidenceTotal = 0;
  let inventedEffects = 0;
  let oracleFaceCorrect = 0;
  let abstentions = 0;

  const caseResults = [];

  for (const testCase of cases) {
    const abilities = segmentOracleCard({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
    });
    const extraction = toLegacyExtractionResult(extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    }));

    oracleFaceCorrect += extraction.oracleId === testCase.oracleId ? 1 : 0;

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

    const extractedTypes = new Set(
      extraction.actions.flatMap((a) => a.effects.map((e) => e.actionType)),
    );
    const expectedPositive = testCase.expectedActions.filter((e) => !e.negative);
    const expectedNegative = testCase.expectedActions.filter((e) => e.negative);

    for (const exp of expectedPositive) {
      if (exp.actionType === "multiple" || exp.actionType === "optional" || exp.actionType === "triggered") {
        const hit = extraction.actions.some((a) =>
          a.evidenceText.toLowerCase().includes(exp.evidenceContains.toLowerCase()) ||
          a.effects.some((e) => e.actionType === exp.actionType),
        );
        if (hit) actionTp += 1;
        else actionFn += 1;
        continue;
      }
      if (extractedTypes.has(exp.actionType)) actionTp += 1;
      else actionFn += 1;
    }

    for (const exp of expectedNegative) {
      if (extractedTypes.has(exp.actionType)) actionFp += 1;
    }

    for (const forbidden of testCase.forbiddenActions ?? []) {
      if (extractedTypes.has(forbidden)) {
        actionFp += 1;
        inventedEffects += 1;
      }
    }

    for (const extra of extractedTypes) {
      if (!expectedPositive.some((e) => e.actionType === extra) && !(testCase.forbiddenActions ?? []).includes(extra)) {
        if (!["triggered", "multiple", "optional"].includes(extra)) actionFp += 1;
      }
    }

    if (expectedPositive.some((e) => e.abilityType === "triggered" || e.actionType === "triggered")) {
      const hasTriggered = extraction.actions.some((a) => a.abilityType === "triggered");
      if (hasTriggered) triggerTp += 1;
      else triggerFn += 1;
    }

    caseResults.push({
      id: testCase.id,
      category: testCase.category,
      abilityCount: abilities.length,
      actionCount: extraction.actions.length,
      abstainedCount: extraction.abstainedClauses.length,
      extractedTypes: [...extractedTypes],
    });
  }

  const actionMetrics = computeMetrics(actionTp, actionFp, actionFn);
  const triggerMetrics = computeMetrics(triggerTp, triggerFp, triggerFn);
  const evidenceSpanValidity = evidenceTotal > 0 ? evidenceValid / evidenceTotal : 1;
  const oracleFaceAccuracy = cases.length > 0 ? oracleFaceCorrect / cases.length : 1;

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
      value: zoneTp / Math.max(zoneTp + zoneFp, 1),
      target: ORACLE_ACTION_PRODUCTION_GATES.zoneTransitionPrecision.target,
      pass: false,
      note: "Zone extraction not yet implemented in segmented parser",
    },
    triggerClassificationPrecision: {
      value: triggerMetrics.precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.triggerClassificationPrecision.target,
      pass: gatePass(triggerMetrics.precision, ORACLE_ACTION_PRODUCTION_GATES.triggerClassificationPrecision.target, "min"),
    },
    costClassificationPrecision: {
      value: 0,
      target: ORACLE_ACTION_PRODUCTION_GATES.costClassificationPrecision.target,
      pass: false,
      note: "Cost extraction not yet implemented in segmented parser",
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
      evidenceSpanValidity,
      abstentionCount: abstentions,
      inventedEffects,
    },
    pipelineDesign: {
      stages: [
        "oracle_card",
        "card_faces",
        "ability_paragraph_segmentation",
        "ability_type_classification",
        "trigger_cost_effect_extraction",
        "evidence_span_validation",
        "functional_role_derivation",
      ],
      actionsVsRoles:
        "actions[] are observable rules-text operations with evidence spans; derivedRoles[] are deck-building interpretations with lower certainty",
      extractionPriority: ["deterministic", "model_assisted", "manual_override"],
      abstentionPolicy: "Parser abstains when evidence span cannot be validated — abstention preferred over fabrication",
    },
    pilotStatus: {
      ready: false,
      reason: "Production gates not met — do not run 500-card pilot or full 38,542 extraction",
      nextStep: "Build deterministic grammar parser, pass field-level gates on 200+ eval set, then pilot 500 cards",
    },
    caseResultsSample: caseResults.slice(0, 20),
    gateSummary: allGatesPass
      ? "READY for 500-card pilot"
      : "NOT READY — missing structured information is acceptable; incorrect structured information is not",
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-extraction-eval-v2.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Eval: ${cases.length} cases`);
  console.log(`  action precision: ${(actionMetrics.precision * 100).toFixed(1)}%`);
  console.log(`  action recall:    ${(actionMetrics.recall * 100).toFixed(1)}%`);
  console.log(`  false-positive:   ${(actionMetrics.falsePositiveRate * 100).toFixed(1)}%`);
  console.log(`  all gates pass:   ${allGatesPass}`);
  console.log(`Report: ${outPath}`);
}

main();
