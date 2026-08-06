/**
 * Oracle-action evaluation v5 — dev + validation split, accepted-only metrics, support tiers.
 * Run: npx tsx scripts/eval-oracle-action-extraction-v5.ts
 * Final blind: npx tsx scripts/eval-oracle-action-extraction-v5.ts --allow-final-blind
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ORACLE_ACTION_PRODUCTION_GATES,
  ORACLE_ACTION_PARSER_VERSION,
  type OracleActionExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import {
  extractOracleActionsV1,
  toLegacyExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import {
  PRIMITIVE_ACTION_TYPES,
  normalizeToPrimitive,
  classifyPrimitiveSupportTier,
  type PrimitiveActionType,
  type PrimitiveSupportTier,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
  spanValid,
} from "./oracle-action-eval-shared";

export type FalsePositiveCategory =
  | "wrong_primitive_action_type"
  | "correct_action_missing_from_gold_labels"
  | "duplicate_action_extraction"
  | "wrong_card_face"
  | "wrong_ability_association"
  | "incorrect_evidence_to_action_mapping"
  | "granularity_mismatch"
  | "condition_or_optionality_mismatch"
  | "genuinely_unsupported_extraction"
  | "evaluator_matching_defect";

interface FieldMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  support?: number;
  abstentionRate?: number;
}

interface ExtractedActionView {
  index: number;
  primitive: PrimitiveActionType | null;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  cardFaceId: string;
  abilityIndex: number;
  reviewStatus: string;
  optional: boolean;
}

interface ClassifiedMismatch {
  caseId: string;
  category: FalsePositiveCategory;
  predicted: string;
  expected?: string;
  evidenceText: string;
  notes: string;
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
  action: OracleActionExtractionResult["actions"][number],
): PrimitiveActionType | null {
  return normalizeToPrimitive(action.effects[0]?.actionType ?? "", action.evidenceText);
}

function isOptionalEvidence(text: string): boolean {
  return /\b(?:You|they|that player|its controller) may\b/i.test(text);
}

function primitiveMatchesExpected(
  action: ExtractedActionView,
  exp: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
): boolean {
  if (!action.primitive || action.primitive !== exp.actionType) return false;
  if (!evidenceMatchesExtracted(action.evidenceText, exp.evidenceContains)) return false;
  if (exp.cardFace && action.cardFaceId !== exp.cardFace) return false;
  if (exp.optional !== undefined) {
    if (isOptionalEvidence(action.evidenceText) !== exp.optional) return false;
  }
  return true;
}

function findBestExpectedMatch(
  action: ExtractedActionView,
  expected: OracleActionEvalCaseV2["expectedPrimitiveActions"],
): { index: number; strict: boolean } | null {
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    if (exp.negative) continue;
    if (primitiveMatchesExpected(action, exp)) return { index: i, strict: true };
  }
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    if (exp.negative) continue;
    if (action.primitive === exp.actionType && evidenceMatchesOracle(exp.evidenceContains, action.evidenceText)) {
      return { index: i, strict: false };
    }
  }
  return null;
}

function classifyFalsePositive(input: {
  testCase: OracleActionEvalCaseV2;
  action: ExtractedActionView;
  oracleText: string;
  matchedExpectedIndices: Set<number>;
  allActions: ExtractedActionView[];
}): FalsePositiveCategory {
  const { testCase, action, oracleText, matchedExpectedIndices, allActions } = input;
  const primitive = action.primitive;

  if (!spanValid(oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd)) {
    return "genuinely_unsupported_extraction";
  }

  if (testCase.forbiddenPrimitiveActions?.includes(primitive!)) {
    const supported = inferSupportedPrimitiveFromEvidence(oracleText, action.evidenceText);
    if (!supported || supported === primitive) return "genuinely_unsupported_extraction";
    return "wrong_primitive_action_type";
  }

  const supported = inferSupportedPrimitiveFromEvidence(oracleText, action.evidenceText);
  if (!supported) return "genuinely_unsupported_extraction";

  if (primitive !== supported) return "wrong_primitive_action_type";

  if (testCase.cardFace && action.cardFaceId !== testCase.cardFace) {
    return "wrong_card_face";
  }

  const duplicate = allActions.some(
    (other, oi) =>
      oi !== action.index &&
      other.primitive === action.primitive &&
      evidenceMatchesExtracted(other.evidenceText, action.evidenceText.slice(0, 24)),
  );
  if (duplicate) return "duplicate_action_extraction";

  const looseExpected = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.actionType === primitive &&
      evidenceMatchesOracle(oracleText, action.evidenceText),
  );
  if (looseExpected) {
    if (looseExpected.optional !== undefined && isOptionalEvidence(action.evidenceText) !== looseExpected.optional) {
      return "condition_or_optionality_mismatch";
    }
    if (!evidenceMatchesExtracted(action.evidenceText, looseExpected.evidenceContains)) {
      return "evaluator_matching_defect";
    }
    if (matchedExpectedIndices.has(testCase.expectedPrimitiveActions.indexOf(looseExpected))) {
      return "duplicate_action_extraction";
    }
    return "evaluator_matching_defect";
  }

  const typeInGoldDifferentEvidence = testCase.expectedPrimitiveActions.find(
    (e) => !e.negative && e.actionType === primitive,
  );
  if (typeInGoldDifferentEvidence) return "granularity_mismatch";

  const wrongTypeInGold = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.evidenceContains &&
      evidenceMatchesExtracted(action.evidenceText, e.evidenceContains) &&
      e.actionType !== primitive,
  );
  if (wrongTypeInGold) return "incorrect_evidence_to_action_mapping";

  if (supported === primitive && evidenceMatchesOracle(oracleText, action.evidenceText)) {
    return "correct_action_missing_from_gold_labels";
  }

  return "wrong_ability_association";
}

function evaluateCaseSet(
  cases: OracleActionEvalCaseV2[],
  setName: string,
  opts?: { acceptedOnly?: boolean },
) {
  const acceptedOnly = opts?.acceptedOnly ?? false;
  let goldTp = 0;
  let goldFp = 0;
  let goldFn = 0;

  let extractionTp = 0;
  let extractionFp = 0;
  let extractionFn = 0;

  let triggerTp = 0;
  let triggerFp = 0;
  let triggerFn = 0;
  let costTp = 0;
  let costFp = 0;
  let costFn = 0;
  let zoneTp = 0;
  let zoneFp = 0;
  let zoneFn = 0;
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
  let acceptedCount = 0;
  let needsReviewCount = 0;
  let abstainedActionCount = 0;

  const fpByCategory: Record<FalsePositiveCategory, number> = {
    wrong_primitive_action_type: 0,
    correct_action_missing_from_gold_labels: 0,
    duplicate_action_extraction: 0,
    wrong_card_face: 0,
    wrong_ability_association: 0,
    incorrect_evidence_to_action_mapping: 0,
    granularity_mismatch: 0,
    condition_or_optionality_mismatch: 0,
    genuinely_unsupported_extraction: 0,
    evaluator_matching_defect: 0,
  };

  const confusionMatrix: Record<string, Record<string, number>> = {};
  const primitiveStats: Record<
    PrimitiveActionType,
    { goldTp: number; goldFp: number; goldFn: number; extractionTp: number; extractionFp: number; extractionFn: number; abstentions: number }
  > = Object.fromEntries(
    PRIMITIVE_ACTION_TYPES.map((p) => [p, { goldTp: 0, goldFp: 0, goldFn: 0, extractionTp: 0, extractionFp: 0, extractionFn: 0, abstentions: 0 }]),
  ) as Record<
    PrimitiveActionType,
    { goldTp: number; goldFp: number; goldFn: number; extractionTp: number; extractionFp: number; extractionFn: number; abstentions: number }
  >;

  let duplicateSuppressedTotal = 0;
  let missingGoldLabelCount = 0;
  let trueUnsupportedCount = 0;
  const metricsByLayout: Record<string, { tp: number; fp: number; fn: number }> = {};
  const metricsByAbilityType: Record<string, { tp: number; fp: number; fn: number }> = {};
  const classifiedMismatches: ClassifiedMismatch[] = [];
  const evaluatorDefects: string[] = [];
  const failedCases: Array<{ id: string; category: string; missing: string[]; extra: string[] }> = [];

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    duplicateSuppressedTotal += raw.duplicateSuppressedCount;
    const extraction = toLegacyExtractionResult(raw);
    abstentions += extraction.abstainedClauses.length;

    let actionViews: ExtractedActionView[] = extraction.actions.map((a, index) => ({
      index,
      primitive: extractedPrimitive(a),
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      cardFaceId: a.cardFaceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus,
      optional: isOptionalEvidence(a.evidenceText),
    }));

    if (acceptedOnly) {
      actionViews = actionViews.filter((a) => a.reviewStatus === "accepted");
    }

    for (const action of actionViews) {
      evidenceTotal += 1;
      if (spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd)) {
        evidenceValid += 1;
      }
      if (action.reviewStatus === "accepted") acceptedCount += 1;
      else if (action.reviewStatus === "needs_review") needsReviewCount += 1;
      else if (action.reviewStatus === "abstained") abstainedActionCount += 1;
    }

    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matchedExpected = new Set<number>();
    const matchedActions = new Set<number>();

    for (let ei = 0; ei < expected.length; ei++) {
      const exp = expected[ei];
      const idx = actionViews.findIndex(
        (a, ai) => !matchedActions.has(ai) && primitiveMatchesExpected(a, exp),
      );
      if (idx >= 0) {
        goldTp += 1;
        matchedExpected.add(ei);
        matchedActions.add(idx);
        const action = actionViews[idx];
        primitiveStats[exp.actionType].goldTp += 1;
        const layoutKey = testCase.layout ?? testCase.category;
        metricsByLayout[layoutKey] ??= { tp: 0, fp: 0, fn: 0 };
        metricsByLayout[layoutKey].tp += 1;
        const abType = extraction.actions[idx]?.abilityType ?? "unknown";
        metricsByAbilityType[abType] ??= { tp: 0, fp: 0, fn: 0 };
        metricsByAbilityType[abType].tp += 1;

        const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.evidenceText);
        if (supported === exp.actionType && spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd)) {
          extractionTp += 1;
          primitiveStats[exp.actionType].extractionTp += 1;
        }

        const extracted = extraction.actions[idx];
        if (extracted.costs?.length) costTp += 1;
        if (extracted.effects.some((e) => (e.sourceZone?.length ?? 0) > 0 || (e.destinationZone?.length ?? 0) > 0)) {
          zoneTp += 1;
        }
      } else {
        goldFn += 1;
        primitiveStats[exp.actionType].goldFn += 1;
        const layoutKey = testCase.layout ?? testCase.category;
        metricsByLayout[layoutKey] ??= { tp: 0, fp: 0, fn: 0 };
        metricsByLayout[layoutKey].fn += 1;

        const anySupport = actionViews.some(
          (a) =>
            a.primitive === exp.actionType &&
            evidenceMatchesOracle(testCase.oracleText, exp.evidenceContains) &&
            spanValid(testCase.oracleText, a.evidenceText, a.evidenceStart, a.evidenceEnd),
        );
        if (!anySupport) extractionFn += 1;
        else extractionTp += 1;
      }
    }

    for (const action of actionViews) {
      if (matchedActions.has(action.index) || !action.primitive) continue;

      const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.evidenceText);
      const evidenceOk = spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd);

      if (testCase.forbiddenPrimitiveActions?.includes(action.primitive)) {
        goldFp += 1;
        inventedEffects += 1;
        if (evidenceOk && supported) extractionFp += 1;
        else extractionTp += 1;
        primitiveStats[action.primitive].goldFp += 1;
        continue;
      }

      const fpCategory = classifyFalsePositive({
        testCase,
        action,
        oracleText: testCase.oracleText,
        matchedExpectedIndices: matchedExpected,
        allActions: actionViews,
      });
      fpByCategory[fpCategory] += 1;
      if (fpCategory === "correct_action_missing_from_gold_labels") missingGoldLabelCount += 1;
      if (fpCategory === "genuinely_unsupported_extraction") trueUnsupportedCount += 1;

      const isParserError =
        fpCategory !== "correct_action_missing_from_gold_labels" &&
        fpCategory !== "evaluator_matching_defect";

      if (expected.length > 0 || supported) {
        goldFp += 1;
        primitiveStats[action.primitive].goldFp += 1;
      }

      if (isParserError && evidenceOk) {
        extractionFp += 1;
        primitiveStats[action.primitive].extractionFp += 1;
      } else if (evidenceOk && supported === action.primitive) {
        extractionTp += 1;
        primitiveStats[action.primitive].extractionTp += 1;
      } else if (!evidenceOk || !supported) {
        extractionFp += 1;
        primitiveStats[action.primitive].extractionFp += 1;
      }

      if (fpCategory === "evaluator_matching_defect") {
        evaluatorDefects.push(`${testCase.id}: ${action.primitive} — ${action.evidenceText.slice(0, 50)}`);
      }

      classifiedMismatches.push({
        caseId: testCase.id,
        category: fpCategory,
        predicted: `${action.primitive}:${action.evidenceText.slice(0, 40)}`,
        evidenceText: action.evidenceText,
        notes: fpCategory,
      });

      const nearestExpected = expected.find((e) => e.actionType === action.primitive);
      const expectedKey = nearestExpected?.actionType ?? "none";
      const predictedKey = action.primitive ?? "none";
      confusionMatrix[expectedKey] ??= {};
      confusionMatrix[expectedKey][predictedKey] = (confusionMatrix[expectedKey][predictedKey] ?? 0) + 1;
    }

    for (const forbidden of testCase.forbiddenPrimitiveActions ?? []) {
      if (actionViews.some((a) => a.primitive === forbidden)) {
        goldFp += 1;
        inventedEffects += 1;
        extractionFp += 1;
      }
    }

    const struct = testCase.expectedStructure;
    if (struct?.minTriggeredAbilities) {
      const triggeredCount = extraction.abilities.filter((a) => a.abilityType === "triggered").length;
      if (triggeredCount >= struct.minTriggeredAbilities) triggerTp += 1;
      else triggerFn += 1;
    }

    if (struct?.optional !== undefined) {
      const hasOptional = actionViews.some((a) => a.optional);
      if (hasOptional === struct.optional) optionalityTp += 1;
      else {
        optionalityFp += 1;
        optionalityFn += 1;
      }
    }

    for (const exp of expected) {
      if (exp.optional === undefined) continue;
      const matching = actionViews.filter(
        (a) => a.primitive === exp.actionType && evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
      );
      if (matching.length === 0) {
        optionalityFn += 1;
        continue;
      }
      const anyMatch = matching.some((a) => a.optional === exp.optional);
      if (anyMatch) optionalityTp += 1;
      else {
        optionalityFp += 1;
        optionalityFn += 1;
      }
    }

    if (struct?.requiresFace || testCase.cardFace) {
      const requiredFace = struct?.requiresFace ?? testCase.cardFace!;
      const faceOk =
        actionViews.length === 0 || actionViews.every((a) => a.cardFaceId === requiredFace);
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
        extra: actionViews
          .filter((a) => !matchedActions.has(a.index))
          .map((a) => `${a.primitive ?? "?"}:${a.evidenceText.slice(0, 40)}`),
      });
    }
  }

  const goldMetrics = computeMetrics(goldTp, goldFp, goldFn);
  const extractionMetrics = computeMetrics(extractionTp, extractionFp, extractionFn);

  const perPrimitive: Record<string, FieldMetrics & { support: number; abstentionRate: number; supportTier: PrimitiveSupportTier }> = {};
  for (const p of PRIMITIVE_ACTION_TYPES) {
    const s = primitiveStats[p];
    const support = s.goldTp + s.goldFn;
    const m = computeMetrics(s.extractionTp, s.extractionFp, s.extractionFn);
    perPrimitive[p] = {
      ...m,
      support,
      abstentionRate: cases.length > 0 ? s.abstentions / cases.length : 0,
      supportTier: classifyPrimitiveSupportTier({
        support,
        precision: m.precision,
        recall: m.recall,
        falsePositiveRate: m.falsePositiveRate,
      }),
    };
  }

  const gateResults = {
    evidenceSpanValidity: {
      value: evidenceTotal > 0 ? evidenceValid / evidenceTotal : 1,
      target: ORACLE_ACTION_PRODUCTION_GATES.evidenceSpanValidity.target,
      pass: gatePass(evidenceValid / Math.max(evidenceTotal, 1), ORACLE_ACTION_PRODUCTION_GATES.evidenceSpanValidity.target, "min"),
    },
    actionTypePrecision: {
      value: extractionMetrics.precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.actionTypePrecision.target,
      pass: gatePass(extractionMetrics.precision, ORACLE_ACTION_PRODUCTION_GATES.actionTypePrecision.target, "min"),
    },
    actionTypeRecall: {
      value: extractionMetrics.recall,
      target: ORACLE_ACTION_PRODUCTION_GATES.actionTypeRecall.target,
      pass: gatePass(extractionMetrics.recall, ORACLE_ACTION_PRODUCTION_GATES.actionTypeRecall.target, "min"),
    },
    falsePositiveRate: {
      value: extractionMetrics.falsePositiveRate,
      target: ORACLE_ACTION_PRODUCTION_GATES.falsePositiveRate.target,
      pass: gatePass(extractionMetrics.falsePositiveRate, ORACLE_ACTION_PRODUCTION_GATES.falsePositiveRate.target, "max"),
    },
    triggerClassificationPrecision: {
      value: computeMetrics(triggerTp, triggerFp, triggerFn).precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.triggerClassificationPrecision.target,
      pass: gatePass(computeMetrics(triggerTp, triggerFp, triggerFn).precision, ORACLE_ACTION_PRODUCTION_GATES.triggerClassificationPrecision.target, "min"),
    },
    costClassificationPrecision: {
      value: computeMetrics(costTp, costFp, costFn).precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.costClassificationPrecision.target,
      pass: gatePass(computeMetrics(costTp, costFp, costFn).precision, ORACLE_ACTION_PRODUCTION_GATES.costClassificationPrecision.target, "min"),
    },
    zoneTransitionPrecision: {
      value: computeMetrics(zoneTp, zoneFp, zoneFn).precision,
      target: ORACLE_ACTION_PRODUCTION_GATES.zoneTransitionPrecision.target,
      pass: gatePass(computeMetrics(zoneTp, zoneFp, zoneFn).precision, ORACLE_ACTION_PRODUCTION_GATES.zoneTransitionPrecision.target, "min"),
    },
    unsupportedInventedEffects: {
      value: inventedEffects,
      target: ORACLE_ACTION_PRODUCTION_GATES.unsupportedInventedEffects.target,
      pass: inventedEffects === 0,
    },
  };

  return {
    setName,
    caseCount: cases.length,
    goldSetMatching: {
      ...goldMetrics,
      label: "Exact match against manually labeled expected actions",
    },
    extractionCorrectness: {
      ...extractionMetrics,
      label: "Oracle-supported extraction with correct primitive type",
      evidenceSpanValidity: evidenceTotal > 0 ? evidenceValid / evidenceTotal : 1,
      inventedEffects,
    },
    structureMetrics: {
      trigger: computeMetrics(triggerTp, triggerFp, triggerFn),
      cost: computeMetrics(costTp, costFp, costFn),
      zone: computeMetrics(zoneTp, zoneFp, zoneFn),
      optionality: computeMetrics(optionalityTp, optionalityFp, optionalityFn),
      cardFace: computeMetrics(faceTp, faceFp, faceFn),
    },
    falsePositiveClassification: fpByCategory,
    falsePositiveClassificationNotes: {
      parserErrors:
        fpByCategory.wrong_primitive_action_type +
        fpByCategory.duplicate_action_extraction +
        fpByCategory.wrong_card_face +
        fpByCategory.wrong_ability_association +
        fpByCategory.incorrect_evidence_to_action_mapping +
        fpByCategory.genuinely_unsupported_extraction,
      goldLabelIssues:
        fpByCategory.correct_action_missing_from_gold_labels + fpByCategory.granularity_mismatch,
      evaluatorIssues:
        fpByCategory.evaluator_matching_defect + fpByCategory.condition_or_optionality_mismatch,
    },
    confusionMatrix,
    perPrimitive,
    metricsByLayout: Object.fromEntries(
      Object.entries(metricsByLayout).map(([k, v]) => [k, computeMetrics(v.tp, v.fp, v.fn)]),
    ),
    metricsByAbilityType: Object.fromEntries(
      Object.entries(metricsByAbilityType).map(([k, v]) => [k, computeMetrics(v.tp, v.fp, v.fn)]),
    ),
    parserDefectAccounting: {
      duplicateSuppressedCount: duplicateSuppressedTotal,
      missingGoldLabelCount,
      trueUnsupportedExtractionCount: trueUnsupportedCount,
      parserErrorCount:
        fpByCategory.wrong_primitive_action_type +
        fpByCategory.duplicate_action_extraction +
        fpByCategory.wrong_card_face +
        fpByCategory.wrong_ability_association +
        fpByCategory.incorrect_evidence_to_action_mapping +
        fpByCategory.genuinely_unsupported_extraction,
    },
    abstentionAndReview: {
      abstentionClauseCount: abstentions,
      abstentionRate: cases.length > 0 ? abstentions / cases.length : 0,
      acceptedActions: acceptedCount,
      needsReviewActions: needsReviewCount,
      abstainedActions: abstainedActionCount,
    },
    gateResults,
    allProductionGatesPass: Object.values(gateResults).every((g) => g.pass),
    failedCaseCount: failedCases.length,
    failedCases: failedCases.slice(0, 25),
    classifiedMismatchSample: classifiedMismatches.slice(0, 40),
    remainingEvaluatorDefects: [...new Set(evaluatorDefects)].slice(0, 30),
  };
}

async function main() {
  const allowFinalBlind = process.argv.includes("--allow-final-blind");
  const devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-frozen.json");
  const validationPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v1.json");
  const blindPath = resolve(process.cwd(), "data", "oracle-action-eval-final-blind-v1.json");
  const blindManifestPath = resolve(process.cwd(), "data", "oracle-action-eval-final-blind-manifest.json");

  const dev = JSON.parse(readFileSync(devPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    taxonomyVersion: string;
  };

  let validation: { cases: OracleActionEvalCaseV2[]; caseCount: number; contentHash: string };
  try {
    validation = JSON.parse(readFileSync(validationPath, "utf8"));
  } catch {
    const legacy = JSON.parse(readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-held-out.json"), "utf8"));
    validation = { ...legacy, contentHash: legacy.contentHash ?? "legacy" };
  }

  const developmentResults = evaluateCaseSet(dev.cases, "development");
  const developmentAccepted = evaluateCaseSet(dev.cases, "development", { acceptedOnly: true });
  const validationResults = evaluateCaseSet(validation.cases, "validation_set_v1");
  const validationAccepted = evaluateCaseSet(validation.cases, "validation_set_v1", { acceptedOnly: true });

  let finalBlindResults = null;
  if (allowFinalBlind) {
    const blind = JSON.parse(readFileSync(blindPath, "utf8")) as { cases: OracleActionEvalCaseV2[] };
    finalBlindResults = evaluateCaseSet(blind.cases, "final_blind_test_v1");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    gateSequence: [
      "improve parser on development set",
      "pass development gates",
      "evaluate on manually reviewed validation set",
      "freeze release candidate",
      "run once against sealed final blind set",
      "begin 500-card pilot",
    ],
    developmentSet: {
      caseCount: dev.cases.length,
      contentHash: dev.contentHash,
      ...developmentResults,
      acceptedOnlyMetrics: developmentAccepted.extractionCorrectness,
    },
    validationSet: {
      classification: "validation_set_v1",
      caseCount: validation.cases.length,
      contentHash: validation.contentHash,
      ...validationResults,
      acceptedOnlyMetrics: validationAccepted.extractionCorrectness,
    },
    finalBlindTest: allowFinalBlind
      ? finalBlindResults
      : {
          status: "SEALED",
          path: blindPath,
          manifestPath: blindManifestPath,
          note: "Pass --allow-final-blind only when release candidate clears dev + validation gates",
        },
    pilotStatus: {
      ready: false,
      reason: "500-card pilot blocked until release candidate passes final blind test",
    },
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-parser-dev-report-v5.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  const d = developmentResults.extractionCorrectness;
  const v = validationResults.extractionCorrectness;
  console.log(`Parser dev report v5 (${ORACLE_ACTION_PARSER_VERSION})`);
  console.log("");
  console.log("Development (204):");
  console.log(`  extraction P/R: ${(d.precision * 100).toFixed(1)}% / ${(d.recall * 100).toFixed(1)}%`);
  console.log(`  duplicates suppressed: ${developmentResults.parserDefectAccounting.duplicateSuppressedCount}`);
  console.log(`  needs_review: ${developmentResults.abstentionAndReview.needsReviewActions}`);
  console.log(`  optionality P/R: ${(developmentResults.structureMetrics.optionality.precision * 100).toFixed(1)}% / ${(developmentResults.structureMetrics.optionality.recall * 100).toFixed(1)}%`);
  console.log("");
  console.log(`Validation (${validation.cases.length}):`);
  console.log(`  extraction P/R: ${(v.precision * 100).toFixed(1)}% / ${(v.recall * 100).toFixed(1)}%`);
  console.log(`  duplicates suppressed: ${validationResults.parserDefectAccounting.duplicateSuppressedCount}`);
  console.log(`  parser errors: ${validationResults.parserDefectAccounting.parserErrorCount}`);
  console.log(`  missing gold labels: ${validationResults.parserDefectAccounting.missingGoldLabelCount}`);
  console.log(`Report: ${outPath}`);
}

main();
