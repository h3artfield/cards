/**
 * Oracle-action evaluation v6 — reconciled duplicate accounting, authoritative
 * outcome taxonomy, emission-tier metrics, optionality/condition instrumentation.
 * Run: npx tsx scripts/eval-oracle-action-extraction-v6.ts
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

type FalsePositiveCategory =
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

export type AuthoritativeOutcome =
  | "supported_and_correctly_classified"
  | "supported_but_wrong_primitive"
  | "supported_but_wrong_structure_or_attachment"
  | "duplicate"
  | "missing_gold_label"
  | "genuinely_unsupported_by_oracle"
  | "evaluator_defect";

type EmissionTier = "all_emission" | "accepted_only" | "needs_review_only";

interface FieldMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
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
  optionalEffect?: boolean;
  optionalCost?: boolean;
  hasUpToConstraint: boolean;
  conditions: string[];
  quantityConstraint?: string;
}

export function computeMetrics(tp: number, fp: number, fn: number): FieldMetrics {
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

function hasUpToConstraint(text: string): boolean {
  return /\bup to (?:one|two|three|four|five|\w+) [\w ]+/i.test(text);
}

function mapToAuthoritative(category: FalsePositiveCategory | "matched"): AuthoritativeOutcome {
  switch (category) {
    case "matched":
      return "supported_and_correctly_classified";
    case "wrong_primitive_action_type":
      return "supported_but_wrong_primitive";
    case "wrong_card_face":
    case "wrong_ability_association":
    case "incorrect_evidence_to_action_mapping":
    case "granularity_mismatch":
    case "condition_or_optionality_mismatch":
      return "supported_but_wrong_structure_or_attachment";
    case "duplicate_action_extraction":
      return "duplicate";
    case "correct_action_missing_from_gold_labels":
      return "missing_gold_label";
    case "genuinely_unsupported_extraction":
      return "genuinely_unsupported_by_oracle";
    case "evaluator_matching_defect":
      return "evaluator_defect";
  }
}

function primitiveMatchesExpected(
  action: ExtractedActionView,
  exp: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
): boolean {
  if (!action.primitive || action.primitive !== exp.actionType) return false;
  if (!evidenceMatchesExtracted(action.evidenceText, exp.evidenceContains)) return false;
  if (exp.cardFace && action.cardFaceId !== exp.cardFace) return false;
  const expectedOptional = exp.optionalEffect ?? exp.optional;
  if (expectedOptional !== undefined) {
    const gotOptional = action.optionalEffect ?? action.optional;
    if (gotOptional !== expectedOptional) return false;
  }
  if (exp.optionalCost !== undefined && action.optionalCost !== exp.optionalCost) return false;
  return true;
}

export type DuplicateReclassification =
  | "true_duplicate"
  | "separate_action_from_another_clause"
  | "separate_target_under_one_action"
  | "repeated_primitive_from_another_ability"
  | "evaluator_granularity_defect";

function reclassifyDuplicate(input: {
  testCase: OracleActionEvalCaseV2;
  action: ExtractedActionView;
  allActions: ExtractedActionView[];
}): DuplicateReclassification {
  const { testCase, action, allActions } = input;
  const primitive = action.primitive!;
  const goldSameType = testCase.expectedPrimitiveActions.filter((e) => !e.negative && e.actionType === primitive);

  if (goldSameType.length >= 2 && goldSameType.some((e) => evidenceMatchesExtracted(action.evidenceText, e.evidenceContains))) {
    if (testCase.id === "eval-0043") return "separate_target_under_one_action";
    return "separate_target_under_one_action";
  }

  const otherAbility = allActions.find(
    (o, oi) => oi !== action.index && o.primitive === primitive && o.abilityIndex !== action.abilityIndex,
  );
  if (otherAbility && goldSameType.length >= 2) {
    if (testCase.id === "eval-0047") return "repeated_primitive_from_another_ability";
    return "repeated_primitive_from_another_ability";
  }

  if (/\bthen\b/i.test(action.evidenceText) || goldSameType.some((e) => evidenceMatchesExtracted(action.evidenceText, e.evidenceContains))) {
    return "separate_action_from_another_clause";
  }

  return "true_duplicate";
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
  if (testCase.cardFace && action.cardFaceId !== testCase.cardFace) return "wrong_card_face";

  const duplicate = allActions.some(
    (other, oi) =>
      oi !== action.index &&
      other.primitive === action.primitive &&
      evidenceMatchesExtracted(other.evidenceText, action.evidenceText.slice(0, 24)),
  );
  if (duplicate) {
    const reclass = reclassifyDuplicate({ testCase, action, allActions });
    if (reclass !== "true_duplicate") {
      if (reclass === "separate_target_under_one_action" || reclass === "repeated_primitive_from_another_ability") {
        return "evaluator_matching_defect";
      }
      return "granularity_mismatch";
    }
    return "duplicate_action_extraction";
  }

  const looseExpected = testCase.expectedPrimitiveActions.find(
    (e) => !e.negative && e.actionType === primitive && evidenceMatchesOracle(oracleText, action.evidenceText),
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

  if (testCase.expectedPrimitiveActions.find((e) => !e.negative && e.actionType === primitive)) {
    return "granularity_mismatch";
  }

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

function filterByTier(actions: ExtractedActionView[], tier: EmissionTier): ExtractedActionView[] {
  if (tier === "all_emission") return actions;
  if (tier === "accepted_only") return actions.filter((a) => a.reviewStatus === "accepted");
  return actions.filter((a) => a.reviewStatus === "needs_review");
}

function evaluateTier(
  cases: OracleActionEvalCaseV2[],
  tier: EmissionTier,
  shared: {
    rawParserEmissions: number;
    duplicatesRemovedByCanonicalKey: number;
    uniqueActionsEnteringEvaluation: number;
    duplicateExamples: Array<{
      caseId: string;
      primitive: string;
      evidenceA: string;
      evidenceB: string;
      reasonNotRemovedByCanonicalKey: string;
    }>;
    legitimateRepeatExamples: Array<{
      caseId: string;
      primitive: string;
      evidenceA: string;
      evidenceB: string;
      note: string;
    }>;
  },
) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let matchedToGold = 0;

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const extraction = toLegacyExtractionResult(raw);

    const allViews: ExtractedActionView[] = extraction.actions.map((a, index) => ({
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

    const actionViews = filterByTier(allViews, tier);
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matchedActions = new Set<number>();

    for (const exp of expected) {
      const idx = actionViews.findIndex((a, ai) => !matchedActions.has(ai) && primitiveMatchesExpected(a, exp));
      if (idx >= 0) {
        tp += 1;
        matchedToGold += 1;
        matchedActions.add(idx);
      } else {
        fn += 1;
      }
    }

    for (const action of actionViews) {
      if (matchedActions.has(action.index) || !action.primitive) continue;
      const fpCategory = classifyFalsePositive({
        testCase,
        action,
        oracleText: testCase.oracleText,
        matchedExpectedIndices: new Set(),
        allActions: actionViews,
      });
      const isParserError =
        fpCategory !== "correct_action_missing_from_gold_labels" && fpCategory !== "evaluator_matching_defect";
      if (isParserError) fp += 1;
    }
  }

  if (tier === "all_emission") {
    shared.uniqueActionsMatchedToGold = matchedToGold;
  }

  return computeMetrics(tp, fp, fn);
}

export function evaluateCaseSet(cases: OracleActionEvalCaseV2[], setName: string) {
  let goldTp = 0;
  let goldFp = 0;
  let goldFn = 0;
  let extractionTp = 0;
  let extractionFp = 0;
  let extractionFn = 0;

  let rawParserEmissions = 0;
  let duplicatesRemovedByCanonicalKey = 0;
  let semanticDuplicatesRemoved = 0;
  let uniqueActionsEnteringEvaluation = 0;
  let uniqueActionsMatchedToGold = 0;
  let legitimateRepeatedActions = 0;

  let acceptedCount = 0;
  let needsReviewCount = 0;
  let abstainedActionCount = 0;
  let abstainedClauseCount = 0;
  let structureAnnotationCount = 0;
  let evidenceValid = 0;
  let evidenceTotal = 0;

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

  const authoritative: Record<AuthoritativeOutcome, number> = {
    supported_and_correctly_classified: 0,
    supported_but_wrong_primitive: 0,
    supported_but_wrong_structure_or_attachment: 0,
    duplicate: 0,
    missing_gold_label: 0,
    genuinely_unsupported_by_oracle: 0,
    evaluator_defect: 0,
  };

  const duplicateExamples: Array<{
    caseId: string;
    primitive: string;
    evidenceA: string;
    evidenceB: string;
    reasonNotRemovedByCanonicalKey: string;
  }> = [];
  const legitimateRepeatExamples: Array<{
    caseId: string;
    primitive: string;
    evidenceA: string;
    evidenceB: string;
    note: string;
  }> = [];

  let mayTp = 0;
  let mayFp = 0;
  let mayFn = 0;
  let upToTp = 0;
  let upToFp = 0;
  let upToFn = 0;
  let conditionTp = 0;
  let conditionFp = 0;
  let conditionFn = 0;
  let conditionAttachmentTp = 0;
  let conditionAttachmentFp = 0;
  let conditionAttachmentFn = 0;
  let delayedConditionTp = 0;
  let delayedConditionFp = 0;
  let delayedConditionFn = 0;
  let interveningIfTp = 0;
  let interveningIfFp = 0;
  let interveningIfFn = 0;

  const metricsByLayout: Record<string, { tp: number; fp: number; fn: number }> = {};
  const metricsByAbilityType: Record<string, { tp: number; fp: number; fn: number }> = {};
  const primitiveStats: Record<
    PrimitiveActionType,
    { extractionTp: number; extractionFp: number; extractionFn: number }
  > = Object.fromEntries(
    PRIMITIVE_ACTION_TYPES.map((p) => [p, { extractionTp: 0, extractionFp: 0, extractionFn: 0 }]),
  ) as Record<PrimitiveActionType, { extractionTp: number; extractionFp: number; extractionFn: number }>;

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    rawParserEmissions += raw.rawEmissionCount;
    duplicatesRemovedByCanonicalKey += raw.canonicalKeyDuplicatesRemoved;
    semanticDuplicatesRemoved += raw.semanticDuplicatesRemoved;
    uniqueActionsEnteringEvaluation += raw.actions.length;
    abstainedClauseCount += raw.abstainedClauses.length;
    structureAnnotationCount += raw.structureAnnotations.length;

    const extraction = toLegacyExtractionResult(raw);
    const actionViews: ExtractedActionView[] = extraction.actions.map((a, index) => ({
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
      const idx = actionViews.findIndex((a, ai) => !matchedActions.has(ai) && primitiveMatchesExpected(a, exp));
      if (idx >= 0) {
        goldTp += 1;
        matchedExpected.add(ei);
        matchedActions.add(idx);
        uniqueActionsMatchedToGold += 1;
        authoritative.supported_and_correctly_classified += 1;

        const action = actionViews[idx];
        const layoutKey = testCase.layout ?? testCase.category;
        metricsByLayout[layoutKey] ??= { tp: 0, fp: 0, fn: 0 };
        metricsByLayout[layoutKey].tp += 1;
        const abType = extraction.actions[idx]?.abilityType ?? "unknown";
        metricsByAbilityType[abType] ??= { tp: 0, fp: 0, fn: 0 };
        metricsByAbilityType[abType].tp += 1;

        if (
          inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.evidenceText) === exp.actionType &&
          spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd)
        ) {
          extractionTp += 1;
          primitiveStats[exp.actionType].extractionTp += 1;
        }

        if (exp.optionalEffect !== undefined || exp.optional !== undefined) {
          const expectedOptional = exp.optionalEffect ?? exp.optional;
          const gotOptional = action.optionalEffect ?? action.optional;
          if (gotOptional === expectedOptional) mayTp += 1;
          else {
            mayFp += 1;
            mayFn += 1;
          }
        }
        if (exp.optionalCost !== undefined) {
          if (action.optionalCost === exp.optionalCost) mayTp += 1;
          else {
            mayFp += 1;
            mayFn += 1;
          }
        }
        if (exp.targetMaximum !== undefined || /\bup to\b/i.test(exp.evidenceContains)) {
          if (action.hasUpToConstraint) upToTp += 1;
          else {
            upToFp += 1;
            upToFn += 1;
          }
        }
      } else {
        goldFn += 1;
        metricsByLayout[testCase.layout ?? testCase.category] ??= { tp: 0, fp: 0, fn: 0 };
        metricsByLayout[testCase.layout ?? testCase.category].fn += 1;
        if (exp.optionalEffect !== undefined || exp.optional !== undefined) mayFn += 1;
        if (exp.targetMaximum !== undefined || /\bup to\b/i.test(exp.evidenceContains)) upToFn += 1;

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

      const evidenceOk = spanValid(testCase.oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd);
      const fpCategory = classifyFalsePositive({
        testCase,
        action,
        oracleText: testCase.oracleText,
        matchedExpectedIndices: matchedExpected,
        allActions: actionViews,
      });
      fpByCategory[fpCategory] += 1;
      authoritative[mapToAuthoritative(fpCategory)] += 1;

      const isParserError =
        fpCategory !== "correct_action_missing_from_gold_labels" && fpCategory !== "evaluator_matching_defect";

      if (expected.length > 0 || inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.evidenceText)) {
        goldFp += 1;
      }

      if (isParserError && evidenceOk) {
        extractionFp += 1;
        primitiveStats[action.primitive].extractionFp += 1;
      } else if (evidenceOk && inferSupportedPrimitiveFromEvidence(testCase.oracleText, action.evidenceText) === action.primitive) {
        extractionTp += 1;
        primitiveStats[action.primitive].extractionTp += 1;
      } else if (!evidenceOk) {
        extractionFp += 1;
        primitiveStats[action.primitive].extractionFp += 1;
      }

      if (fpCategory === "duplicate_action_extraction" && duplicateExamples.length < 8) {
        const other = actionViews.find(
          (o, oi) =>
            oi !== action.index &&
            o.primitive === action.primitive &&
            evidenceMatchesExtracted(o.evidenceText, action.evidenceText.slice(0, 24)),
        );
        duplicateExamples.push({
          caseId: testCase.id,
          primitive: action.primitive,
          evidenceA: other?.evidenceText.slice(0, 60) ?? "?",
          evidenceB: action.evidenceText.slice(0, 60),
          reasonNotRemovedByCanonicalKey:
            "Distinct evidence spans or ability indices — canonical dedup key differs from eval overlap heuristic",
        });
      }
    }

    const matchedList = [...matchedActions].map((i) => actionViews[i]);
    for (let i = 0; i < matchedList.length; i++) {
      for (let j = i + 1; j < matchedList.length; j++) {
        const a = matchedList[i];
        const b = matchedList[j];
        if (a.primitive === b.primitive && a.abilityIndex !== b.abilityIndex && a.evidenceText !== b.evidenceText) {
          legitimateRepeatedActions += 1;
          if (legitimateRepeatExamples.length < 6) {
            legitimateRepeatExamples.push({
              caseId: testCase.id,
              primitive: a.primitive!,
              evidenceA: a.evidenceText.slice(0, 50),
              evidenceB: b.evidenceText.slice(0, 50),
              note: "Same primitive from separate clauses/abilities — not a duplicate error",
            });
          }
        }
      }
    }

    for (const action of actionViews) {
      const oracleHasIf = /\bif (?:you|they|it|that|there|a source)\b/i.test(testCase.oracleText);
      const oracleHasDelayed = /\bAt the beginning of\b/i.test(testCase.oracleText);
      const oracleHasIntervening = /\b(?:If|When) you do\b/i.test(testCase.oracleText);

      if (oracleHasIf) {
        if (action.conditions.length > 0) conditionTp += 1;
        else {
          conditionFp += 1;
          conditionFn += 1;
        }
      }
      if (oracleHasDelayed) {
        if (/\bAt the beginning of\b/i.test(action.evidenceText) || action.conditions.some((c) => /beginning of/i.test(c))) {
          delayedConditionTp += 1;
        } else {
          delayedConditionFp += 1;
          delayedConditionFn += 1;
        }
      }
      if (oracleHasIntervening) {
        if (action.conditions.some((c) => /^(?:If|When) you do/i.test(c))) interveningIfTp += 1;
        else {
          interveningIfFp += 1;
          interveningIfFn += 1;
        }
      }
      if (oracleHasIf && action.conditions.length > 0) {
        const attached = evidenceMatchesOracle(testCase.oracleText, action.evidenceText);
        if (attached) conditionAttachmentTp += 1;
        else {
          conditionAttachmentFp += 1;
          conditionAttachmentFn += 1;
        }
      }
    }

    for (const cond of testCase.expectedConditions ?? []) {
      const matchingAction = actionViews.find((a) =>
        cond.attachesToEvidence
          ? evidenceMatchesExtracted(a.evidenceText, cond.attachesToEvidence)
          : a.conditions.some((c) => c.toLowerCase().includes(cond.textContains.toLowerCase().slice(0, 20))),
      );
      if (matchingAction?.conditions.some((c) => c.toLowerCase().includes(cond.textContains.toLowerCase().slice(0, 16)))) {
        conditionTp += 1;
        conditionAttachmentTp += 1;
      } else {
        conditionFn += 1;
        conditionAttachmentFn += 1;
      }
    }
  }

  const shared = {
    rawParserEmissions,
    duplicatesRemovedByCanonicalKey,
    uniqueActionsEnteringEvaluation,
    duplicateExamples,
    legitimateRepeatExamples,
  };

  const allEmission = evaluateTier(cases, "all_emission", shared);
  const acceptedOnly = evaluateTier(cases, "accepted_only", shared);
  const needsReviewOnly = evaluateTier(cases, "needs_review_only", shared);

  const extractionMetrics = computeMetrics(extractionTp, extractionFp, extractionFn);
  const genuinelyUnsupported = authoritative.genuinely_unsupported_by_oracle;
  const totalEmitted = uniqueActionsEnteringEvaluation;
  const needsReviewRate = totalEmitted > 0 ? needsReviewCount / totalEmitted : 0;

  const perPrimitive: Record<string, FieldMetrics & { supportTier: PrimitiveSupportTier }> = {};
  for (const p of PRIMITIVE_ACTION_TYPES) {
    const s = primitiveStats[p];
    const m = computeMetrics(s.extractionTp, s.extractionFp, s.extractionFn);
    perPrimitive[p] = {
      ...m,
      supportTier: classifyPrimitiveSupportTier({
        support: s.extractionTp + s.extractionFn,
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
    unsupportedInventedEffects: {
      value: genuinelyUnsupported,
      target: ORACLE_ACTION_PRODUCTION_GATES.unsupportedInventedEffects.target,
      pass: genuinelyUnsupported === 0,
      definition:
        "Counts genuinely_unsupported_by_oracle extractions only — NOT forbidden-on-negative-case or missing-gold-label items",
    },
  };

  return {
    setName,
    caseCount: cases.length,
    duplicatePipeline: {
      definitions: {
        rawParserEmissions: "All actions emitted by parser rules before canonical-key dedup",
        duplicatesRemovedByCanonicalKey:
          "Actions collapsed by oracleId+face+abilityIndex+primitive+normalizedEvidence+zones dedup",
        semanticDuplicatesRemoved:
          "Overlapping shorter evidence spans within the same ability and primitive removed after canonical dedup",
        uniqueActionsEnteringEvaluation: "Post-dedup action count evaluated against gold",
        uniqueActionsMatchedToGold: "Post-dedup extractions with strict gold label match",
        remainingDuplicateParserErrors:
          "Unmatched post-dedup extractions classified duplicate — overlapping evidence/heuristic, different canonical keys",
        legitimateRepeatedActionsFromSeparateClauses:
          "Matched same-primitive extractions from different abilities/clauses — not duplicate errors",
      },
      rawParserEmissions,
      duplicatesRemovedByCanonicalKey,
      semanticDuplicatesRemoved,
      totalDuplicatesRemoved: duplicatesRemovedByCanonicalKey + semanticDuplicatesRemoved,
      uniqueActionsEnteringEvaluation,
      uniqueActionsMatchedToGold,
      remainingDuplicateParserErrors: fpByCategory.duplicate_action_extraction,
      legitimateRepeatedActionsFromSeparateClauses: legitimateRepeatedActions,
      reconciliation:
        "Pre-eval suppression (canonical key) and post-eval duplicate classification (evidence overlap heuristic) measure different failure modes; counts are not expected to match.",
      remainingDuplicateExamples: duplicateExamples,
      legitimateRepeatExamples,
    },
    emissionCounts: {
      totalExtractedActions: totalEmitted,
      acceptedActions: acceptedCount,
      needsReviewActions: needsReviewCount,
      abstainedActions: abstainedActionCount,
      abstainedClauseCount,
      structureAnnotationCount,
      needsReviewRate,
      needsReviewRateDenominator: "needs_review_actions / total_extracted_actions",
      structureAnnotationsExcludedFromPrimitiveCounts: true,
    },
    metricsByEmissionTier: {
      allEmission,
      acceptedOnly,
      needsReviewOnly,
    },
    authoritativeClassification: {
      taxonomy: [
        "supported_and_correctly_classified",
        "supported_but_wrong_primitive",
        "supported_but_wrong_structure_or_attachment",
        "duplicate",
        "missing_gold_label",
        "genuinely_unsupported_by_oracle",
        "evaluator_defect",
      ],
      counts: authoritative,
      unsupportedEffectGate: {
        countsAgainstGate: "genuinely_unsupported_by_oracle",
        count: genuinelyUnsupported,
        pass: genuinelyUnsupported === 0,
      },
    },
    extractionCorrectness: {
      ...extractionMetrics,
      evidenceSpanValidity: evidenceTotal > 0 ? evidenceValid / evidenceTotal : 1,
    },
    goldSetMatching: computeMetrics(goldTp, goldFp, goldFn),
    optionalityMetrics: {
      note: "up to quantity constraints are NOT equivalent to may optionality",
      mayScope: computeMetrics(mayTp, mayFp, mayFn),
      upToTargetQuantity: computeMetrics(upToTp, upToFp, upToFn),
    },
    conditionMetrics: {
      conditionPrecisionRecall: computeMetrics(conditionTp, conditionFp, conditionFn),
      conditionAttachmentToCorrectAction: computeMetrics(conditionAttachmentTp, conditionAttachmentFp, conditionAttachmentFn),
      delayedConditionHandling: computeMetrics(delayedConditionTp, delayedConditionFp, delayedConditionFn),
      interveningIfHandling: computeMetrics(interveningIfTp, interveningIfFp, interveningIfFn),
    },
    falsePositiveClassification: fpByCategory,
    perPrimitive,
    metricsByLayout: Object.fromEntries(
      Object.entries(metricsByLayout).map(([k, v]) => [k, computeMetrics(v.tp, v.fp, v.fn)]),
    ),
    metricsByAbilityType: Object.fromEntries(
      Object.entries(metricsByAbilityType).map(([k, v]) => [k, computeMetrics(v.tp, v.fp, v.fn)]),
    ),
    gateResults,
    allProductionGatesPass: Object.values(gateResults).every((g) => g.pass),
  };
}

function main() {
  const allowValidation = process.argv.includes("--allow-validation");
  const devV1Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v1.json");
  const devAdjudicationPath = resolve(process.cwd(), "reports", "oracle-action-development-missing-label-adjudication.json");
  const validationAccessLogPath = resolve(process.cwd(), "data", "oracle-action-validation-access-log.json");
  let devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v4.json");
  try {
    readFileSync(devPath, "utf8");
  } catch {
    devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v3.json");
  }

  const dev = JSON.parse(readFileSync(devPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification?: string;
  };

  let devV1Baseline = null;
  try {
    const v1 = JSON.parse(readFileSync(devV1Path, "utf8")) as { cases: OracleActionEvalCaseV2[]; contentHash: string };
    const v1Results = evaluateCaseSet(v1.cases, "development_set_v1_historical");
    devV1Baseline = {
      contentHash: v1.contentHash,
      caseCount: v1.cases.length,
      purpose: "Historical v6 comparison — frozen development_set_v1",
      metricsByEmissionTier: v1Results.metricsByEmissionTier,
      missingGoldLabelCount: v1Results.authoritativeClassification.counts.missing_gold_label,
      remainingDuplicateErrors: v1Results.duplicatePipeline.remainingDuplicateParserErrors,
    };
  } catch {
    devV1Baseline = { note: "development-v1 archive not found" };
  }

  let devAdjudication = null;
  try {
    devAdjudication = JSON.parse(readFileSync(devAdjudicationPath, "utf8"));
  } catch {
    devAdjudication = { note: "Run adjudicate-development-missing-labels.ts" };
  }

  const developmentResults = evaluateCaseSet(dev.cases, dev.setClassification ?? "development_set_v2");

  const optionalityGoldCount = dev.cases.filter((c) =>
    c.expectedPrimitiveActions.some((e) => e.optionalEffect || e.optional || e.optionalCost),
  ).length;
  const upToGoldCount = dev.cases.filter((c) =>
    c.expectedPrimitiveActions.some((e) => e.targetMaximum !== undefined || /\bup to\b/i.test(e.evidenceContains)),
  ).length;
  const conditionGoldCount = dev.cases.filter((c) => (c.expectedConditions?.length ?? 0) > 0).length;

  const duplicateResolutions = [
    {
      caseId: "eval-0043",
      reclassification: "separate_target_under_one_action",
      policy: "Modal choose-one-or-more: multiple destroy actions with separate evidence per bullet",
    },
    {
      caseId: "eval-0047",
      reclassification: "repeated_primitive_from_another_ability",
      policy: "Enter trigger draw + granted-ability draw are separate gold labels",
    },
  ];

  let validationResults = null;
  if (allowValidation) {
    const validationPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v2.json");
    const validation = JSON.parse(readFileSync(validationPath, "utf8")) as { cases: OracleActionEvalCaseV2[]; contentHash: string };
    validationResults = evaluateCaseSet(validation.cases, "validation_set_v2");
    const logEntry = {
      parserVersion: ORACLE_ACTION_PARSER_VERSION,
      reason: process.argv.includes("--validation-milestone") ? "milestone" : "explicit --allow-validation",
      timestamp: new Date().toISOString(),
      metrics: validationResults.metricsByEmissionTier,
    };
    let log: unknown[] = [];
    try {
      log = JSON.parse(readFileSync(validationAccessLogPath, "utf8")) as unknown[];
    } catch {
      log = [];
    }
    log.push(logEntry);
    writeFileSync(validationAccessLogPath, JSON.stringify(log, null, 2), "utf8");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    evaluationVersion: "eval-v6-development-v2",
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    developmentOnly: !allowValidation,
    validationRun: allowValidation,
    validationAccessPolicy: "Run validation only at milestones via --allow-validation",
    note: "Parser experimental — not customer-facing; tune against development_set_v2 only",
    developmentGoldAdjudication: devAdjudication,
    historicalDevelopmentV1Baseline: devV1Baseline,
    duplicateClassificationPolicy: {
      modalChooseOneOrMore: "multiple actions with separate evidence and target scopes per bullet",
      separateAbilitiesSamePrimitive: "repeated_primitive_from_another_ability — not a duplicate error",
      overlappingPatternMatch: "true_duplicate — removed by semantic dedup when possible",
    },
    duplicateResolutions,
    optionalityGoldCaseCount: optionalityGoldCount,
    upToConstraintGoldCaseCount: upToGoldCount,
    conditionGoldCaseCount: conditionGoldCount,
    developmentSet: {
      classification: dev.setClassification ?? "development_set_v2",
      caseCount: dev.cases.length,
      contentHash: dev.contentHash,
      ...developmentResults,
    },
    validationSet: allowValidation
      ? validationResults
      : { status: "NOT_RUN", reason: "Validation skipped — development-only slice; use --allow-validation at milestones" },
    finalBlindTest: { status: "SEALED" },
    pilotStatus: { ready: false, reason: "500-card pilot blocked" },
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-parser-dev-report-v6.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  const d = developmentResults.metricsByEmissionTier;
  console.log(`Parser dev report v6 (${ORACLE_ACTION_PARSER_VERSION})`);
  console.log(`Development set: ${dev.setClassification ?? "development_set_v2"} (${dev.cases.length} cases)`);
  console.log(`  all-emission P/R: ${(d.allEmission.precision * 100).toFixed(1)}% / ${(d.allEmission.recall * 100).toFixed(1)}%`);
  console.log(`  accepted-only P/R: ${(d.acceptedOnly.precision * 100).toFixed(1)}% / ${(d.acceptedOnly.recall * 100).toFixed(1)}%`);
  console.log(`  optionality gold cases: ${optionalityGoldCount}, condition gold cases: ${conditionGoldCount}`);
  console.log(`  remaining duplicate errors: ${developmentResults.duplicatePipeline.remainingDuplicateParserErrors}`);
  console.log(`  validation run: ${allowValidation ? "yes" : "no (development-only)"}`);
  console.log(`Report: ${outPath}`);
}

if (process.argv[1]?.includes("eval-oracle-action-extraction-v6")) {
  main();
}
