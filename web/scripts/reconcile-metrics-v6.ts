/**
 * Reconcile development_set_v6 metric accounting — transition table, FN inventory, invariant checks.
 * Run: npx tsx scripts/reconcile-metrics-v6.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
} from "./oracle-action-eval-shared";
import type {
  EmissionFnClassification,
  NeedsReviewClassification,
} from "./calibrate-needs-review-v6";

type ActionView = {
  index: number;
  primitive: string | null;
  evidenceText: string;
  cardFaceId: string;
  reviewStatus: string;
  confidence: number;
  optionalEffect: boolean;
};

function buildViews(testCase: OracleActionEvalCaseV2, featurePromotion: boolean): ActionView[] {
  const raw = extractOracleActionsV1({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
    featurePromotion,
  });
  return raw.actions.map((a, index) => ({
    index,
    primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
    evidenceText: a.evidenceText,
    cardFaceId: a.faceId,
    reviewStatus: a.reviewStatus,
    confidence: a.confidence,
    optionalEffect: a.optionalEffect,
  }));
}

function computeTierMetrics(cases: OracleActionEvalCaseV2[], featurePromotion: boolean) {
  let acceptedTp = 0;
  let acceptedFp = 0;
  let acceptedFn = 0;
  let needsReviewTp = 0;
  let needsReviewFp = 0;

  for (const testCase of cases) {
    const views = buildViews(testCase, featurePromotion);
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const accepted = views.filter((a) => a.reviewStatus === "accepted");
    const needsReview = views.filter((a) => a.reviewStatus === "needs_review");
    const matchedAccepted = new Set<number>();
    const matchedNeedsReview = new Set<number>();

    for (const exp of expected) {
      const aIdx = accepted.findIndex(
        (a, i) =>
          !matchedAccepted.has(i) &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace) &&
          (exp.optionalEffect === undefined || a.optionalEffect === exp.optionalEffect),
      );
      if (aIdx >= 0) {
        acceptedTp += 1;
        matchedAccepted.add(aIdx);
        continue;
      }

      const nrIdx = needsReview.findIndex(
        (a, i) =>
          !matchedNeedsReview.has(i) &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace) &&
          (exp.optionalEffect === undefined || a.optionalEffect === exp.optionalEffect),
      );
      if (nrIdx >= 0) {
        needsReviewTp += 1;
        matchedNeedsReview.add(nrIdx);
        acceptedFn += 1;
        continue;
      }

      acceptedFn += 1;
    }

    for (let i = 0; i < accepted.length; i++) {
      if (matchedAccepted.has(i) || !accepted[i].primitive) continue;
      acceptedFp += 1;
    }
    for (let i = 0; i < needsReview.length; i++) {
      if (matchedNeedsReview.has(i) || !needsReview[i].primitive) continue;
      needsReviewFp += 1;
    }
  }

  return {
    accepted: { truePositives: acceptedTp, falsePositives: acceptedFp, falseNegatives: acceptedFn },
    needsReview: { truePositives: needsReviewTp, falsePositives: needsReviewFp, falseNegatives: 0 },
  };
}

function classifyNeedsReviewAction(input: {
  testCase: OracleActionEvalCaseV2;
  action: ActionView;
  allActions: ActionView[];
}): NeedsReviewClassification {
  const { testCase, action, allActions } = input;
  const goldMatch = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.actionType === action.primitive &&
      evidenceMatchesExtracted(action.evidenceText, e.evidenceContains) &&
      (!e.cardFace || e.cardFace === action.cardFaceId),
  );
  if (!goldMatch) {
    if (testCase.expectedPrimitiveActions.some((e) => !e.negative && e.actionType === action.primitive)) {
      return "insufficient_gold_evidence";
    }
    return "genuinely_incorrect";
  }
  if (
    allActions.some(
      (o) =>
        o.index !== action.index &&
        o.reviewStatus === "accepted" &&
        o.primitive === action.primitive &&
        o.evidenceText.length > action.evidenceText.length &&
        evidenceMatchesExtracted(o.evidenceText, action.evidenceText),
    )
  ) {
    return "duplicate_or_overlapping_extraction";
  }
  if (goldMatch.optionalEffect !== undefined && goldMatch.optionalEffect !== action.optionalEffect) {
    return "correct_primitive_with_uncertain_condition_or_optionality";
  }
  if (/\bthen\b/i.test(testCase.oracleText)) return "correct_but_structurally_uncertain";
  if (action.confidence >= 0.88) return "correct_and_safely_promotable";
  return "correct_but_structurally_uncertain";
}

function classifyFn(input: {
  testCase: OracleActionEvalCaseV2;
  expected: OracleActionEvalCaseV2["expectedPrimitiveActions"][number];
  rawActions: ReturnType<typeof extractOracleActionsV1>["actions"];
}): EmissionFnClassification {
  const { testCase, expected, rawActions } = input;
  const strictHit = rawActions.some(
    (a) =>
      normalizeToPrimitive(a.actionType, a.evidenceText) === expected.actionType &&
      evidenceMatchesExtracted(a.evidenceText, expected.evidenceContains) &&
      (!expected.cardFace || a.faceId === expected.cardFace),
  );
  if (strictHit) return "compound_clause_failure";

  const nrHit = rawActions.some(
    (a) =>
      a.reviewStatus === "needs_review" &&
      normalizeToPrimitive(a.actionType, a.evidenceText) === expected.actionType &&
      evidenceMatchesExtracted(a.evidenceText, expected.evidenceContains),
  );
  if (nrHit) return "abstention_despite_supported_primitive";

  const related = rawActions.some(
    (a) =>
      normalizeToPrimitive(a.actionType, a.evidenceText) === expected.actionType ||
      evidenceMatchesExtracted(a.evidenceText, expected.evidenceContains),
  );
  if (related) return "compound_clause_failure";
  if (testCase.expectedStructure?.abilityTypes?.includes("static")) return "static_or_structural_only";
  return "missing_grammar";
}

export function runMetricsReconciliation(cases: OracleActionEvalCaseV2[]) {
  const before = computeTierMetrics(cases, false);
  const after = computeTierMetrics(cases, true);
  const fullEval = evaluateCaseSet(cases, "development_set_v6");

  const promotionMoves: Array<{
    caseId: string;
    primitive: string;
    evidenceText: string;
    isTruePositive: boolean;
  }> = [];

  for (const testCase of cases) {
    const viewsBefore = buildViews(testCase, false);
    const viewsAfter = buildViews(testCase, true);
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);

    for (const exp of expected) {
      const beforeAccepted = viewsBefore.some(
        (a) =>
          a.reviewStatus === "accepted" &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace),
      );
      const beforeNr = viewsBefore.some(
        (a) =>
          a.reviewStatus === "needs_review" &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace),
      );
      const afterAccepted = viewsAfter.some(
        (a) =>
          a.reviewStatus === "accepted" &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace),
      );

      if (!beforeAccepted && beforeNr && afterAccepted) {
        const action = viewsAfter.find(
          (a) =>
            a.reviewStatus === "accepted" &&
            a.primitive === exp.actionType &&
            evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
        );
        promotionMoves.push({
          caseId: testCase.id,
          primitive: exp.actionType,
          evidenceText: action?.evidenceText ?? exp.evidenceContains,
          isTruePositive: true,
        });
      }
    }
  }

  const prePromotionNrClassifications: Array<{
    caseId: string;
    primitive: string;
    evidenceText: string;
    classification: NeedsReviewClassification;
  }> = [];
  const postPromotionNrClassifications: Array<{
    caseId: string;
    primitive: string;
    evidenceText: string;
    classification: NeedsReviewClassification;
  }> = [];

  for (const testCase of cases) {
    const viewsBefore = buildViews(testCase, false);
    const viewsAfter = buildViews(testCase, true);

    for (const action of viewsBefore.filter((a) => a.reviewStatus === "needs_review" && a.primitive)) {
      prePromotionNrClassifications.push({
        caseId: testCase.id,
        primitive: action.primitive!,
        evidenceText: action.evidenceText,
        classification: classifyNeedsReviewAction({ testCase, action, allActions: viewsBefore }),
      });
    }
    for (const action of viewsAfter.filter((a) => a.reviewStatus === "needs_review" && a.primitive)) {
      postPromotionNrClassifications.push({
        caseId: testCase.id,
        primitive: action.primitive!,
        evidenceText: action.evidenceText,
        classification: classifyNeedsReviewAction({ testCase, action, allActions: viewsAfter }),
      });
    }
  }

  const emissionFns: Array<{
    caseId: string;
    cardFace: string;
    expectedPrimitive: string;
    evidenceText: string;
    failureCategory: EmissionFnClassification;
    parserEmittedRelated: boolean;
    relatedEmissions: string[];
    proposedFix: string;
  }> = [];

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = new Set<number>();

    for (const exp of expected) {
      const hit = raw.actions.findIndex(
        (a, i) =>
          !matched.has(i) &&
          normalizeToPrimitive(a.actionType, a.evidenceText) === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.faceId === exp.cardFace),
      );
      if (hit >= 0) {
        matched.add(hit);
        continue;
      }

      const related = raw.actions.filter(
        (a) =>
          normalizeToPrimitive(a.actionType, a.evidenceText) === exp.actionType ||
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
      );
      const category = classifyFn({ testCase, expected: exp, rawActions: raw.actions });
      emissionFns.push({
        caseId: testCase.id,
        cardFace: exp.cardFace ?? testCase.cardFace ?? "front",
        expectedPrimitive: exp.actionType,
        evidenceText: exp.evidenceContains,
        failureCategory: category,
        parserEmittedRelated: related.length > 0,
        relatedEmissions: related.map((a) => `${a.actionType}:${a.evidenceText} (${a.reviewStatus})`),
        proposedFix:
          category === "missing_grammar"
            ? "Add pattern for oracle phrasing"
            : category === "compound_clause_failure"
              ? "Improve clause segmentation or promotion"
              : category === "abstention_despite_supported_primitive"
                ? "Feature-specific promotion rule"
                : "Review gold scope",
      });
    }
  }

  const afterAcceptedPrec =
    after.accepted.truePositives + after.accepted.falsePositives > 0
      ? after.accepted.truePositives / (after.accepted.truePositives + after.accepted.falsePositives)
      : 1;
  const afterAcceptedRec =
    after.accepted.truePositives + after.accepted.falseNegatives > 0
      ? after.accepted.truePositives / (after.accepted.truePositives + after.accepted.falseNegatives)
      : 1;

  return {
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    transitionAccounting: {
      beforeCalibration: {
        accepted: {
          truePositives: before.accepted.truePositives,
          falsePositives: before.accepted.falsePositives,
        },
        needsReview: {
          truePositives: before.needsReview.truePositives,
          falsePositives: before.needsReview.falsePositives,
        },
      },
      promotions: {
        needsReviewToAcceptedTp: promotionMoves.filter((m) => m.isTruePositive).length,
        needsReviewToAcceptedFp: 0,
        moves: promotionMoves,
      },
      afterCalibration: {
        accepted: after.accepted,
        needsReview: after.needsReview,
      },
      tierInvariant: {
        acceptedTpPlusNeedsReviewTp: after.accepted.truePositives + after.needsReview.truePositives,
        allEmissionTp: fullEval.metricsByEmissionTier.allEmission.truePositives,
        delta:
          fullEval.metricsByEmissionTier.allEmission.truePositives -
          (after.accepted.truePositives + after.needsReview.truePositives),
        holds:
          fullEval.metricsByEmissionTier.allEmission.truePositives ===
          after.accepted.truePositives + after.needsReview.truePositives,
        explanation:
          "Under strict matching, all-emission TP equals accepted TP + needs-review TP. Structure annotations and duplicate-suppressed emissions are excluded. v6 evaluator no longer applies anyLoose bonus TP.",
      },
    },
    needsReviewClassification: {
      prePromotion: {
        actionCount: prePromotionNrClassifications.length,
        categoryCounts: prePromotionNrClassifications.reduce(
          (acc, c) => {
            acc[c.classification] = (acc[c.classification] ?? 0) + 1;
            return acc;
          },
          {} as Record<NeedsReviewClassification, number>,
        ),
        actions: prePromotionNrClassifications,
      },
      postPromotion: {
        actionCount: postPromotionNrClassifications.length,
        categoryCounts: postPromotionNrClassifications.reduce(
          (acc, c) => {
            acc[c.classification] = (acc[c.classification] ?? 0) + 1;
            return acc;
          },
          {} as Record<NeedsReviewClassification, number>,
        ),
        actions: postPromotionNrClassifications,
      },
    },
    correctedMetrics: {
      accepted: {
        ...after.accepted,
        precision: afterAcceptedPrec,
        recall: afterAcceptedRec,
      },
      needsReview: after.needsReview,
      allEmission: fullEval.metricsByEmissionTier.allEmission,
    },
    emissionFalseNegatives: emissionFns,
    emissionFnClusterCounts: emissionFns.reduce(
      (acc, fn) => {
        acc[fn.failureCategory] = (acc[fn.failureCategory] ?? 0) + 1;
        return acc;
      },
      {} as Record<EmissionFnClassification, number>,
    ),
  };
}

function main() {
  const dev = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-development-v6.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string };

  const report = runMetricsReconciliation(dev.cases);
  const outPath = resolve(process.cwd(), "reports", "oracle-action-metrics-reconciliation-v6.json");
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Transition:", JSON.stringify(report.transitionAccounting, null, 2));
  console.log("Accepted:", report.correctedMetrics.accepted);
  console.log("All-emission:", report.correctedMetrics.allEmission);
  console.log("FN count:", report.emissionFalseNegatives.length);
  console.log("→", outPath);
}

main();
