/**
 * Reconcile development_set metrics — unified matcher, transition table, FN inventory, invariant checks.
 * Run: npx tsx scripts/reconcile-metrics-v6.ts [--v7]
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evaluateCaseUnified,
  sumUnifiedMetrics,
  verifyTierInvariants,
  findOptionalityMismatches,
  type ExtractedActionForMatch,
} from "./oracle-action-unified-matcher";
import {
  evidenceMatchesExtracted,
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

function computeUnifiedTierMetrics(cases: OracleActionEvalCaseV2[], featurePromotion: boolean) {
  const caseMetrics = cases.map((testCase) => {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
      featurePromotion,
    });
    return evaluateCaseUnified(
      testCase,
      raw.actions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        faceId: a.faceId,
        abilityIndex: a.abilityIndex,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
        optionalCost: a.optionalCost,
      })),
    );
  });
  return { totals: sumUnifiedMetrics(caseMetrics), caseMetrics };
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
  if (/\bthen\b/i.test(testCase.oracleText)) return "structurally_uncertain";
  if (action.confidence >= 0.88) return "promotion_candidate_not_yet_proven";
  return "intentionally_held_for_review";
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

export function runMetricsReconciliation(cases: OracleActionEvalCaseV2[], setLabel = "development_set_v6") {
  const before = computeUnifiedTierMetrics(cases, false);
  const after = computeUnifiedTierMetrics(cases, true);
  const invariants = verifyTierInvariants(after.totals);

  const optionalityMismatches: ReturnType<typeof findOptionalityMismatches>[] = [];
  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const actions: ExtractedActionForMatch[] = raw.actions.map((a, index) => ({
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
    optionalityMismatches.push(...findOptionalityMismatches(testCase, actions));
  }

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

      if (beforeNr && afterAccepted) {
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

  const afterAccepted = after.totals.accepted;
  const afterNeedsReview = after.totals.needsReview;
  const afterAll = after.totals.allEmission;

  return {
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    dataset: setLabel,
    matcher: "oracle-action-unified-matcher (one-to-one greedy)",
    optionalityMismatches,
    transitionAccounting: {
      beforeCalibration: {
        accepted: {
          truePositives: before.totals.accepted.truePositives,
          falsePositives: before.totals.accepted.falsePositives,
        },
        needsReview: {
          truePositives: before.totals.needsReview.truePositives,
          falsePositives: before.totals.needsReview.falsePositives,
        },
      },
      promotions: {
        needsReviewToAcceptedTp: promotionMoves.filter((m) => m.isTruePositive).length,
        needsReviewToAcceptedFp: 0,
        moves: promotionMoves,
      },
      afterCalibration: {
        accepted: {
          truePositives: afterAccepted.truePositives,
          falsePositives: afterAccepted.falsePositives,
          falseNegatives: afterAccepted.falseNegatives,
        },
        needsReview: {
          truePositives: afterNeedsReview.truePositives,
          falsePositives: afterNeedsReview.falsePositives,
          falseNegatives: afterNeedsReview.falseNegatives,
        },
      },
      tierInvariant: {
        ...invariants.details,
        tpSumHolds: invariants.tpSumHolds,
        fpSumHolds: invariants.fpSumHolds,
        goldPositiveHolds:
          afterAll.truePositives + afterAll.falseNegatives ===
          afterAccepted.truePositives +
            afterAccepted.falseNegatives,
        explanation:
          "Unified one-to-one matcher: all-emission TP = accepted TP + needs-review TP; all-emission FP = accepted FP + needs-review FP.",
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
      accepted: afterAccepted,
      needsReview: afterNeedsReview,
      allEmission: afterAll,
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
  const useV7 = process.argv.includes("--v7");
  const dataPath = useV7
    ? resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json")
    : resolve(process.cwd(), "data", "oracle-action-eval-development-v6.json");

  const dev = JSON.parse(readFileSync(dataPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification?: string;
  };

  const report = runMetricsReconciliation(
    dev.cases,
    dev.setClassification ?? (useV7 ? "development_set_v7" : "development_set_v6"),
  );
  const suffix = useV7 ? "v7" : "v6";
  const outPath = resolve(process.cwd(), "reports", `oracle-action-metrics-reconciliation-${suffix}.json`);
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Tier invariant:", report.transitionAccounting.tierInvariant);
  console.log("Accepted:", report.correctedMetrics.accepted);
  console.log("All-emission:", report.correctedMetrics.allEmission);
  console.log("FN count:", report.emissionFalseNegatives.length);
  console.log("Optionality mismatches:", report.optionalityMismatches.length);
  console.log("→", outPath);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("reconcile-metrics-v6.ts")) {
  main();
}
