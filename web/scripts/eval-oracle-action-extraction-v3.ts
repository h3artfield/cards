/**
 * Three-layer Oracle-action evaluation — production gates unchanged.
 * Run: npx tsx scripts/eval-oracle-action-extraction-v3.ts
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
  normalizeToPrimitive,
  type PrimitiveActionType,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

interface FieldMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
}

function computeMetrics(tp: number, fp: number, fn: number): FieldMetrics {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : tp > 0 ? 1 : 1;
  const falsePositiveRate = tp + fp > 0 ? fp / (tp + fp) : fp > 0 ? 1 : 0;
  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall, falsePositiveRate };
}

function gatePass(value: number, target: number, direction: "min" | "max"): boolean {
  return direction === "min" ? value >= target : value <= target;
}

function extractedPrimitive(
  action: ReturnType<typeof toLegacyExtractionResult>["actions"][number],
): PrimitiveActionType | null {
  return normalizeToPrimitive(action.effects[0]?.actionType ?? "", action.evidenceText);
}

function primitiveMatchesExpected(
  action: ReturnType<typeof toLegacyExtractionResult>["actions"][number],
  exp: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
): boolean {
  const primitive = extractedPrimitive(action);
  if (!primitive || primitive !== exp.actionType) return false;
  if (!action.evidenceText.toLowerCase().includes(exp.evidenceContains.toLowerCase())) return false;
  if (exp.cardFace && action.cardFaceId !== exp.cardFace) return false;
  if (exp.optional !== undefined) {
    const isOptional = /\bYou may\b|\bup to\b/i.test(action.evidenceText);
    if (isOptional !== exp.optional) return false;
  }
  return true;
}

export function runEvaluation(cases: OracleActionEvalCaseV2[]) {
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
  let abstentions = 0;
  const failedCases: Array<{ id: string; category: string; missing: string[]; extra: string[] }> = [];

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const extraction = toLegacyExtractionResult(raw);

    for (const action of extraction.actions) {
      evidenceTotal += 1;
      if (validateEvidenceSpan(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd).valid) {
        evidenceValid += 1;
      }
    }
    abstentions += extraction.abstainedClauses.length;

    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matchedExpected = new Set<number>();
    const matchedActions = new Set<number>();

    for (let ei = 0; ei < expected.length; ei++) {
      const exp = expected[ei];
      const idx = extraction.actions.findIndex((a, ai) =>
        !matchedActions.has(ai) && primitiveMatchesExpected(a, exp),
      );
      if (idx >= 0) {
        actionTp += 1;
        matchedExpected.add(ei);
        matchedActions.add(idx);
        const action = extraction.actions[idx];
        if (action.costs?.length) costTp += 1;
        if (action.effects.some((e) => (e.sourceZone?.length ?? 0) > 0 || (e.destinationZone?.length ?? 0) > 0)) {
          zoneTp += 1;
        }
      } else {
        actionFn += 1;
      }
    }

    for (let ai = 0; ai < extraction.actions.length; ai++) {
      if (matchedActions.has(ai)) continue;
      const primitive = extractedPrimitive(extraction.actions[ai]);
      if (!primitive) continue;
      if (testCase.forbiddenPrimitiveActions?.includes(primitive)) {
        actionFp += 1;
        inventedEffects += 1;
        continue;
      }
      if (expected.length > 0) actionFp += 1;
    }

    for (const forbidden of testCase.forbiddenPrimitiveActions ?? []) {
      if (extraction.actions.some((a) => extractedPrimitive(a) === forbidden)) {
        actionFp += 1;
        inventedEffects += 1;
      }
    }

    const struct = testCase.expectedStructure;
    if (struct?.minTriggeredAbilities) {
      const triggeredCount = extraction.abilities.filter((a) => a.abilityType === "triggered").length;
      if (triggeredCount >= struct.minTriggeredAbilities) triggerTp += 1;
      else triggerFn += 1;
    }

    if (struct?.minActivatedAbilities) {
      const activatedCount = extraction.abilities.filter((a) => a.abilityType === "activated").length;
      if (activatedCount >= struct.minActivatedAbilities) abilityTp += 1;
      else abilityFn += 1;
    }

    if (struct?.optional !== undefined) {
      const hasOptional = extraction.actions.some((a) => /\bYou may\b|\bup to\b/i.test(a.evidenceText));
      if (hasOptional === struct.optional) optionalityTp += 1;
      else {
        optionalityFp += 1;
        optionalityFn += 1;
      }
    }

    if (struct?.requiresFace || testCase.cardFace) {
      const requiredFace = struct?.requiresFace ?? testCase.cardFace!;
      const faceOk =
        extraction.actions.length === 0 ||
        extraction.actions.every((a) => a.cardFaceId === requiredFace);
      if (faceOk) faceTp += 1;
      else {
        faceFp += 1;
        faceFn += 1;
      }
    }

    if (expected.length > 0 && matchedExpected.size < expected.length) {
      failedCases.push({
        id: testCase.id,
        category: testCase.category,
        missing: expected
          .filter((_, i) => !matchedExpected.has(i))
          .map((e) => `${e.actionType}:${e.evidenceContains}`),
        extra: extraction.actions
          .filter((_, i) => !matchedActions.has(i))
          .map((a) => `${extractedPrimitive(a) ?? "?"}:${a.evidenceText.slice(0, 40)}`),
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
  const abstentionRate = cases.length > 0 ? abstentions / cases.length : 0;

  const gateResults = {
    evidenceSpanValidity: {
      value: evidenceSpanValidity,
      target: ORACLE_ACTION_PRODUCTION_GATES.evidenceSpanValidity.target,
      pass: gatePass(evidenceSpanValidity, ORACLE_ACTION_PRODUCTION_GATES.evidenceSpanValidity.target, "min"),
    },
    oracleIdAndCardFaceAccuracy: {
      value: cases.length > 0 ? faceTp / Math.max(faceTp + faceFn, 1) : 1,
      target: ORACLE_ACTION_PRODUCTION_GATES.oracleIdAndCardFaceAccuracy.target,
      pass: gatePass(faceTp / Math.max(faceTp + faceFn, 1), ORACLE_ACTION_PRODUCTION_GATES.oracleIdAndCardFaceAccuracy.target, "min"),
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

  return {
    gateResults,
    allProductionGatesPass: Object.values(gateResults).every((g) => g.pass),
    fieldMetrics: {
      primitiveActionType: actionMetrics,
      triggerStructure: triggerMetrics,
      costClassification: costMetrics,
      zoneTransition: zoneMetrics,
      abilityStructure: abilityMetrics,
      optionality: optionalityMetrics,
      cardFace: faceMetrics,
      evidenceSpanValidity,
      abstentionCount: abstentions,
      abstentionRate,
      inventedEffects,
    },
    failedCaseCount: failedCases.length,
    failedCases: failedCases.slice(0, 20),
  };
}

async function main() {
  const casesPath = resolve(process.cwd(), "data", "oracle-action-eval-cases-v2.json");
  const { cases } = JSON.parse(readFileSync(casesPath, "utf8")) as {
    caseCount: number;
    cases: OracleActionEvalCaseV2[];
  };

  const result = runEvaluation(cases);
  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    evalCaseCount: cases.length,
    evalSchemaVersion: 2,
    taxonomyLayers: ["ability_structure", "primitive_actions", "derived_roles"],
    productionGates: ORACLE_ACTION_PRODUCTION_GATES,
    ...result,
    pilotStatus: {
      ready: result.allProductionGatesPass,
      reason: result.allProductionGatesPass
        ? "Production gates met"
        : "500-card pilot blocked — gates not met",
    },
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-extraction-eval-v3.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  const m = result.fieldMetrics.primitiveActionType;
  console.log(`Eval v3: ${cases.length} cases (three-layer taxonomy)`);
  console.log(`  primitive precision: ${(m.precision * 100).toFixed(1)}%`);
  console.log(`  primitive recall:    ${(m.recall * 100).toFixed(1)}%`);
  console.log(`  false-positive:      ${(m.falsePositiveRate * 100).toFixed(1)}%`);
  console.log(`  trigger precision:   ${(result.fieldMetrics.triggerStructure.precision * 100).toFixed(1)}%`);
  console.log(`  trigger recall:      ${(result.fieldMetrics.triggerStructure.recall * 100).toFixed(1)}%`);
  console.log(`  all gates pass:      ${result.allProductionGatesPass}`);
  console.log(`Report: ${outPath}`);
}

main();
