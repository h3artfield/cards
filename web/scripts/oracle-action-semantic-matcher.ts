/**
 * Gold↔semantic-action matcher — uses canonical OracleSemanticParse fields directly.
 */
import type { OracleSemanticParse, SemanticAction } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import { optionOrdinalKey } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  countParserFalsePositives,
  faceIdsEquivalent,
  type EmissionTier,
  type ExtractedActionForMatch,
  filterActionsByTier,
  isModalStemGold,
  actionMatchesModalStem,
} from "./oracle-action-unified-matcher";
import { evidenceMatchesExtracted, type ExpectedPrimitiveAction } from "./oracle-action-eval-shared";
import { sortIndicesByKey, stableGoldKey, stableActionKey } from "./lib/semantic-action-identity";

export interface SemanticActionForMatch {
  index: number;
  actionType: string;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
  faceId: string;
  parentAbilityId: string;
  segmentAbilityIndex: number;
  modalOptionId?: string;
  modalOptionKey?: string;
  clauseId?: string;
  loyaltyCost?: string;
  reviewStatus: "accepted" | "needs_review" | "overridden";
  optionalEffect?: boolean;
  optionalCost?: boolean;
  executionContext?: string;
  semanticOwner?: string;
  cardNativeLayer2Eligible?: boolean;
  choiceGroupId?: string;
  choiceAlternativeIndex?: number;
  choiceMutuallyExclusive?: boolean;
}

function abilityForAction(parse: OracleSemanticParse, action: SemanticAction) {
  return parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
}

function modalOptionKey(parse: OracleSemanticParse, action: SemanticAction): string | undefined {
  if (!action.modalOptionId) return undefined;
  for (const ability of parse.abilities) {
    for (const opt of ability.options ?? []) {
      if (opt.optionId === action.modalOptionId) return optionOrdinalKey(opt.ordinal);
    }
  }
  const tail = action.modalOptionId.match(/\.opt-(\d+)$/);
  return tail ? `opt-${tail[1]}` : undefined;
}

export function semanticActionsForMatch(parse: OracleSemanticParse): SemanticActionForMatch[] {
  return parse.actions.map((action, index) => {
    const parent = abilityForAction(parse, action);
    return {
      index,
      actionType: action.actionType,
      evidenceText: action.provenance.actionSpan.text,
      evidenceStart: action.provenance.actionSpan.cardStart,
      evidenceEnd: action.provenance.actionSpan.cardEnd,
      faceId: parent?.faceId ?? "front",
      parentAbilityId: action.parentAbilityId,
      segmentAbilityIndex: action.segmentAbilityIndex,
      modalOptionId: action.modalOptionId,
      modalOptionKey: modalOptionKey(parse, action),
      clauseId: action.clauseId,
      loyaltyCost: parent?.loyaltyCost,
      reviewStatus: action.reviewStatus,
      optionalEffect: action.optionalEffect,
      optionalCost: action.optionalCost,
      executionContext: action.executionContext,
      semanticOwner: action.semanticOwner,
      cardNativeLayer2Eligible: action.cardNativeLayer2Eligible,
      choiceGroupId: action.choiceGroupId,
      choiceAlternativeIndex: action.choiceAlternativeIndex,
      choiceMutuallyExclusive: action.choiceMutuallyExclusive,
    };
  });
}

export function semanticPrimitiveMatchesExpected(
  action: SemanticActionForMatch,
  exp: ExpectedPrimitiveAction,
  parse: OracleSemanticParse,
  options?: { ignoreOptionalEffect?: boolean },
): boolean {
  if (action.actionType !== exp.actionType) return false;
  if (!evidenceMatchesExtracted(action.evidenceText, exp.evidenceContains)) return false;
  if (exp.cardFace && !faceIdsEquivalent(action.faceId, exp.cardFace)) return false;

  if (exp.loyaltyCost) {
    const parent = parse.abilities.find((a) => a.abilityId === action.parentAbilityId);
    if (!parent || parent.loyaltyCost !== exp.loyaltyCost) return false;
  }

  if (exp.optionId) {
    const key = action.modalOptionKey ?? action.modalOptionId;
    if (!key || (key !== exp.optionId && !key.endsWith(`.${exp.optionId}`))) return false;
  }

  if (exp.abilityIndex !== undefined && action.segmentAbilityIndex !== exp.abilityIndex) {
    return false;
  }

  const expectedOptional = exp.optionalEffect ?? exp.optional;
  if (expectedOptional !== undefined && !options?.ignoreOptionalEffect) {
    const gotOptional = action.optionalEffect ?? false;
    if (gotOptional !== expectedOptional) return false;
  }
  if (exp.choiceGroupId !== undefined) {
    if (!action.choiceGroupId) return false;
    if (exp.choiceAlternativeIndex !== undefined && action.choiceAlternativeIndex !== exp.choiceAlternativeIndex) {
      return false;
    }
  } else if (exp.choiceAlternativeIndex !== undefined && action.choiceAlternativeIndex !== exp.choiceAlternativeIndex) {
    return false;
  }
  if (exp.optionalCost !== undefined && action.optionalCost !== exp.optionalCost) return false;

  return true;
}

export interface SemanticTierMatchOutcome {
  matches: Array<{ expectedIndex: number; actionIndex: number | null; matched: boolean }>;
  unmatchedExpectedIndices: number[];
  unmatchedActionIndices: number[];
}

export function matchGoldToSemanticActions(input: {
  expected: ExpectedPrimitiveAction[];
  parse: OracleSemanticParse;
  tier: EmissionTier;
  oracleText?: string;
  caseId?: string;
  ignoreOptionalEffect?: boolean;
}): SemanticTierMatchOutcome {
  const allActions = semanticActionsForMatch(input.parse);
  const tierActions = filterActionsByTier(
    allActions.map((a) => ({
      ...a,
      primitive: a.actionType,
      cardFaceId: a.faceId,
      abilityIndex: a.segmentAbilityIndex,
      modalOptionId: a.modalOptionKey,
      optional: a.optionalEffect,
    })) as ExtractedActionForMatch[],
    input.tier,
  );
  const tierIndices = new Set(tierActions.map((a) => a.index));
  const actions = allActions.filter((a) => tierIndices.has(a.index));

  const matchedActions = new Set<number>();
  const matches: SemanticTierMatchOutcome["matches"] = [];
  const unmatchedExpectedIndices: number[] = [];

  const expectedOrder = sortIndicesByKey(input.expected, (exp, idx) =>
    stableGoldKey(input.caseId ?? "", exp, idx),
  );
  const actionOrder = sortIndicesByKey(actions, (action) => stableActionKey(action));

  for (const expectedIndex of expectedOrder) {
    const exp = input.expected[expectedIndex]!;
    let found: number | null = null;
    for (const actionIdx of actionOrder) {
      const action = actions[actionIdx]!;
      if (matchedActions.has(action.index)) continue;
      if (semanticPrimitiveMatchesExpected(action, exp, input.parse, { ignoreOptionalEffect: input.ignoreOptionalEffect })) {
        found = action.index;
        matchedActions.add(action.index);
        break;
      }
      if (
        input.oracleText &&
        isModalStemGold(exp, input.oracleText) &&
        action.actionType === exp.actionType &&
        actionMatchesModalStem(
          {
            index: action.index,
            primitive: action.actionType,
            evidenceText: action.evidenceText,
            evidenceStart: action.evidenceStart,
            evidenceEnd: action.evidenceEnd,
            cardFaceId: action.faceId,
            abilityIndex: action.segmentAbilityIndex,
            modalOptionId: action.modalOptionKey,
            reviewStatus: action.reviewStatus as "accepted" | "needs_review",
          },
          exp,
        )
      ) {
        found = action.index;
        matchedActions.add(action.index);
        break;
      }
    }
    matches.push({ expectedIndex, actionIndex: found, matched: found !== null });
    if (found === null) unmatchedExpectedIndices.push(expectedIndex);
  }

  matches.sort((a, b) => a.expectedIndex - b.expectedIndex);

  const unmatchedActionIndices = actions.filter((a) => !matchedActions.has(a.index)).map((a) => a.index);
  return { matches, unmatchedExpectedIndices, unmatchedActionIndices };
}

export interface SemanticCaseMetrics {
  caseId: string;
  accepted: { tp: number; fp: number; fn: number };
}

export function evaluateCaseSemantic(
  testCase: OracleActionEvalCaseV2,
  parse: OracleSemanticParse,
  options?: { ignoreOptionalEffect?: boolean },
): SemanticCaseMetrics {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const acceptedOnly = matchGoldToSemanticActions({
    expected,
    parse,
    tier: "accepted",
    oracleText: testCase.oracleText,
    caseId: testCase.id,
    ignoreOptionalEffect: options?.ignoreOptionalEffect,
  });
  const actions = semanticActionsForMatch(parse);
  const acceptedMatchedGold = new Set(
    acceptedOnly.matches.filter((m) => m.matched).map((m) => m.expectedIndex),
  );

  const extractedForFp = actions.map((a) => ({
    index: a.index,
    primitive: a.actionType,
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart,
    evidenceEnd: a.evidenceEnd,
    cardFaceId: a.faceId,
    abilityIndex: a.segmentAbilityIndex,
    loyaltyCost: a.loyaltyCost,
    modalOptionId: a.modalOptionKey,
    reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    optionalEffect: a.optionalEffect,
    optional: a.optionalEffect,
    optionalCost: a.optionalCost,
    cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
    cardStart: a.evidenceStart,
    cardEnd: a.evidenceEnd,
  })) as ExtractedActionForMatch[];

  return {
    caseId: testCase.id,
    accepted: {
      tp: acceptedOnly.matches.filter((m) => m.matched).length,
      fp: countParserFalsePositives(testCase, acceptedOnly.unmatchedActionIndices, extractedForFp),
      fn: expected.length - acceptedMatchedGold.size,
    },
  };
}

export function sumSemanticMetrics(cases: SemanticCaseMetrics[]) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const c of cases) {
    tp += c.accepted.tp;
    fp += c.accepted.fp;
    fn += c.accepted.fn;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  return { tp, fp, fn, precision, recall };
}
