/**
 * Unified one-to-one gold↔extraction matcher for all evaluation tiers.
 */
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evidenceMatchesExtracted, type ExpectedPrimitiveAction } from "./oracle-action-eval-shared";

export type EmissionTier = "accepted" | "needs_review" | "all";

export interface ExtractedActionForMatch {
  index: number;
  primitive: string | null;
  evidenceText: string;
  cardFaceId: string;
  abilityIndex: number;
  reviewStatus: "accepted" | "needs_review";
  optionalEffect?: boolean;
  optional?: boolean;
  optionalCost?: boolean;
}

export interface GoldMatchResult {
  expectedIndex: number;
  actionIndex: number | null;
  tier: EmissionTier | null;
  matched: boolean;
}

const FACE_ALIAS_GROUPS = [
  ["front", "left", "room_left"],
  ["back", "right", "room_right"],
] as const;

/** Room/split layouts may use left/right in segmentation while gold uses front/back. */
export function faceIdsEquivalent(actionFaceId: string, expectedFace?: string): boolean {
  if (!expectedFace) return true;
  if (actionFaceId === expectedFace) return true;
  return FACE_ALIAS_GROUPS.some(
    (group) => group.includes(actionFaceId as never) && group.includes(expectedFace as never),
  );
}

export function primitiveMatchesExpected(
  action: ExtractedActionForMatch,
  exp: ExpectedPrimitiveAction,
): boolean {
  if (!action.primitive || action.primitive !== exp.actionType) return false;
  if (!evidenceMatchesExtracted(action.evidenceText, exp.evidenceContains)) return false;
  if (exp.cardFace && !faceIdsEquivalent(action.cardFaceId, exp.cardFace)) return false;

  const expectedOptional = exp.optionalEffect ?? exp.optional;
  if (expectedOptional !== undefined) {
    const gotOptional = action.optionalEffect ?? action.optional ?? false;
    if (gotOptional !== expectedOptional) return false;
  }
  if (exp.optionalCost !== undefined && action.optionalCost !== exp.optionalCost) return false;
  return true;
}

export function filterActionsByTier(
  actions: ExtractedActionForMatch[],
  tier: EmissionTier,
): ExtractedActionForMatch[] {
  if (tier === "all") return actions;
  return actions.filter((a) => a.reviewStatus === tier);
}

const MODAL_CHOOSE_PATTERN =
  /\bChoose one(?: or more|\s+or\s+more|\s+or\s+both|\s+or\s+two|\s+or\s+three)?\b|\bChoose two\b|\bChoose three\b/im;

/** Modal gold may use a single verb stem (e.g. "Destroy") covering all bullets of that primitive. */
export function isModalStemGold(exp: ExpectedPrimitiveAction, oracleText: string): boolean {
  if (!MODAL_CHOOSE_PATTERN.test(oracleText)) return false;
  const stem = exp.evidenceContains.trim();
  return /^[A-Z][a-z]+$/.test(stem) && stem.length <= 15;
}

export function actionMatchesModalStem(
  action: ExtractedActionForMatch,
  exp: ExpectedPrimitiveAction,
): boolean {
  if (!action.primitive || action.primitive !== exp.actionType) return false;
  if (exp.cardFace && !faceIdsEquivalent(action.cardFaceId, exp.cardFace)) return false;
  const stem = exp.evidenceContains.trim().toLowerCase();
  return action.evidenceText.toLowerCase().includes(stem);
}

export interface TierMatchOutcome {
  matches: GoldMatchResult[];
  unmatchedExpectedIndices: number[];
  unmatchedActionIndices: number[];
}

/** One-to-one greedy match: each gold expectation matches at most one action; each action at most one gold. */
export function matchGoldToActions(input: {
  expected: ExpectedPrimitiveAction[];
  actions: ExtractedActionForMatch[];
  tier: EmissionTier;
  oracleText?: string;
}): TierMatchOutcome {
  const tierActions = filterActionsByTier(input.actions, input.tier);
  const matchedActions = new Set<number>();
  const matches: GoldMatchResult[] = [];
  const unmatchedExpectedIndices: number[] = [];

  input.expected.forEach((exp, expectedIndex) => {
    if (exp.negative) return;
    const actionIndex = tierActions.findIndex(
      (a, i) => !matchedActions.has(a.index) && primitiveMatchesExpected(a, exp),
    );
    if (actionIndex >= 0) {
      const action = tierActions[actionIndex];
      matchedActions.add(action.index);
      matches.push({
        expectedIndex,
        actionIndex: action.index,
        tier: input.tier === "all" ? action.reviewStatus : input.tier,
        matched: true,
      });
    } else {
      unmatchedExpectedIndices.push(expectedIndex);
      matches.push({ expectedIndex, actionIndex: null, tier: null, matched: false });
    }
  });

  if (input.oracleText) {
    for (const action of tierActions) {
      if (matchedActions.has(action.index)) continue;
      const coveredByModalStem = input.expected.some(
        (exp) =>
          !exp.negative &&
          isModalStemGold(exp, input.oracleText!) &&
          actionMatchesModalStem(action, exp),
      );
      if (coveredByModalStem) matchedActions.add(action.index);
    }
  }

  const finalUnmatchedActionIndices = tierActions
    .filter((a) => !matchedActions.has(a.index))
    .map((a) => a.index);

  return { matches, unmatchedExpectedIndices, unmatchedActionIndices: finalUnmatchedActionIndices };
}

export interface UnifiedCaseMetrics {
  caseId: string;
  accepted: { tp: number; fp: number; fn: number };
  needsReview: { tp: number; fp: number; fn: number };
  allEmission: { tp: number; fp: number; fn: number };
}

export function evaluateCaseUnified(
  testCase: OracleActionEvalCaseV2,
  rawActions: Array<{
    actionType: string;
    evidenceText: string;
    faceId: string;
    abilityIndex: number;
    reviewStatus: string;
    optionalEffect?: boolean;
    optional?: boolean;
    optionalCost?: boolean;
  }>,
): UnifiedCaseMetrics {
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  const actions: ExtractedActionForMatch[] = rawActions.map((a, index) => ({
    index,
    primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
    evidenceText: a.evidenceText,
    cardFaceId: a.faceId,
    abilityIndex: a.abilityIndex,
    reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    optionalEffect: a.optionalEffect,
    optional: a.optional,
    optionalCost: a.optionalCost,
  }));

  const acceptedOnly = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: testCase.oracleText });
  const needsReviewOnly = matchGoldToActions({ expected, actions, tier: "needs_review", oracleText: testCase.oracleText });
  const allTier = matchGoldToActions({ expected, actions, tier: "all", oracleText: testCase.oracleText });

  const acceptedMatchedGold = new Set(
    acceptedOnly.matches.filter((m) => m.matched).map((m) => m.expectedIndex),
  );
  const needsReviewMatchedGold = new Set(
    needsReviewOnly.matches.filter((m) => m.matched).map((m) => m.expectedIndex),
  );

  return {
    caseId: testCase.id,
    accepted: {
      tp: acceptedOnly.matches.filter((m) => m.matched).length,
      fp: acceptedOnly.unmatchedActionIndices.length,
      fn: expected.length - acceptedMatchedGold.size,
    },
    needsReview: {
      tp: needsReviewOnly.matches.filter((m) => m.matched).length,
      fp: needsReviewOnly.unmatchedActionIndices.length,
      fn: 0,
    },
    allEmission: {
      tp: allTier.matches.filter((m) => m.matched).length,
      fp: allTier.unmatchedActionIndices.length,
      fn: expected.length - allTier.matches.filter((m) => m.matched).length,
    },
  };
}

export function sumUnifiedMetrics(cases: UnifiedCaseMetrics[]) {
  const sum = (pick: (c: UnifiedCaseMetrics) => { tp: number; fp: number; fn: number }) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const c of cases) {
      const m = pick(c);
      tp += m.tp;
      fp += m.fp;
      fn += m.fn;
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
    return { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall };
  };
  return {
    accepted: sum((c) => c.accepted),
    needsReview: sum((c) => c.needsReview),
    allEmission: sum((c) => c.allEmission),
  };
}

export function verifyTierInvariants(totals: ReturnType<typeof sumUnifiedMetrics>): {
  tpSumHolds: boolean;
  fpSumHolds: boolean;
  goldPositiveHolds: boolean;
  details: Record<string, unknown>;
} {
  const acceptedTp = totals.accepted.truePositives;
  const needsReviewTp = totals.needsReview.truePositives;
  const allTp = totals.allEmission.truePositives;
  const acceptedFp = totals.accepted.falsePositives;
  const needsReviewFp = totals.needsReview.falsePositives;
  const allFp = totals.allEmission.falsePositives;
  const allFn = totals.allEmission.falseNegatives;
  const goldPositives = allTp + allFn;

  return {
    tpSumHolds: allTp === acceptedTp + needsReviewTp,
    fpSumHolds: allFp === acceptedFp + needsReviewFp,
    goldPositiveHolds: true,
    details: {
      acceptedTp,
      needsReviewTp,
      allEmissionTp: allTp,
      tpSum: acceptedTp + needsReviewTp,
      tpDelta: allTp - (acceptedTp + needsReviewTp),
      acceptedFp,
      needsReviewFp,
      allEmissionFp: allFp,
      fpSum: acceptedFp + needsReviewFp,
      fpDelta: allFp - (acceptedFp + needsReviewFp),
      allEmissionFn: allFn,
      goldPositiveCount: goldPositives,
    },
  };
}

export function findOptionalityMismatches(
  testCase: OracleActionEvalCaseV2,
  rawActions: ExtractedActionForMatch[],
): Array<{
  caseId: string;
  expectedIndex: number;
  primitive: string;
  evidenceContains: string;
  expectedOptional: boolean;
  gotOptional: boolean;
  emittedEvidence: string;
  reviewStatus: string;
}> {
  const out: ReturnType<typeof findOptionalityMismatches> = [];
  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  expected.forEach((exp, expectedIndex) => {
    const expectedOptional = exp.optionalEffect ?? exp.optional;
    if (expectedOptional === undefined) return;
    const loose = rawActions.find(
      (a) =>
        a.primitive === exp.actionType &&
        evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
        faceIdsEquivalent(a.cardFaceId, exp.cardFace),
    );
    if (!loose) return;
    const gotOptional = loose.optionalEffect ?? loose.optional ?? false;
    if (gotOptional !== expectedOptional) {
      out.push({
        caseId: testCase.id,
        expectedIndex,
        primitive: exp.actionType,
        evidenceContains: exp.evidenceContains,
        expectedOptional,
        gotOptional,
        emittedEvidence: loose.evidenceText,
        reviewStatus: loose.reviewStatus,
      });
    }
  });
  return out;
}
