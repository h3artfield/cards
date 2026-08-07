/**
 * Needs-review tier audit + calibration report for development_set_v6.
 * Run: npx tsx scripts/calibrate-needs-review-v6.ts
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { runAcceptedFpAudit } from "./audit-accepted-fp-v5";
import { evaluateCaseSet, computeMetrics } from "./eval-oracle-action-extraction-v6";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
} from "./oracle-action-eval-shared";

export type NeedsReviewClassification =
  | "promotion_candidate_not_yet_proven"
  | "structurally_uncertain"
  | "intentionally_held_for_review"
  | "correct_but_structurally_uncertain"
  | "correct_primitive_with_uncertain_condition_or_optionality"
  | "correct_primitive_with_uncertain_zone"
  | "duplicate_or_overlapping_extraction"
  | "genuinely_incorrect"
  | "insufficient_gold_evidence";

export type EmissionFnClassification =
  | "missing_grammar"
  | "unsupported_primitive"
  | "compound_clause_failure"
  | "replacement_effect_failure"
  | "static_or_structural_only"
  | "segmentation_failure"
  | "abstention_despite_supported_primitive"
  | "incomplete_gold_label";

function classifyNeedsReviewAction(input: {
  testCase: OracleActionEvalCaseV2;
  primitive: string;
  evidenceText: string;
  cardFaceId: string;
  abilityIndex: number;
  reviewStatus: string;
  confidence: number;
  optionalEffect: boolean;
  sourceZones?: string[];
  allActions: Array<{ primitive: string | null; evidenceText: string; cardFaceId: string; abilityIndex: number; reviewStatus: string }>;
}): NeedsReviewClassification {
  const { testCase, primitive, evidenceText, cardFaceId, allActions } = input;

  const goldMatch = testCase.expectedPrimitiveActions.find(
    (e) =>
      !e.negative &&
      e.actionType === primitive &&
      evidenceMatchesExtracted(evidenceText, e.evidenceContains) &&
      (!e.cardFace || e.cardFace === cardFaceId),
  );

  if (!goldMatch) {
    const looseGold = testCase.expectedPrimitiveActions.find(
      (e) => !e.negative && e.actionType === primitive,
    );
    if (looseGold) return "insufficient_gold_evidence";
    if (!evidenceMatchesOracle(testCase.oracleText, evidenceText)) return "genuinely_incorrect";
    return "insufficient_gold_evidence";
  }

  const duplicate = allActions.some(
    (o) =>
      o.reviewStatus === "accepted" &&
      o.primitive === primitive &&
      o.abilityIndex === input.abilityIndex &&
      o.evidenceText.length > evidenceText.length &&
      evidenceMatchesExtracted(o.evidenceText, evidenceText),
  );
  if (duplicate) return "duplicate_or_overlapping_extraction";

  if (
    goldMatch.optionalEffect !== undefined &&
    goldMatch.optionalEffect !== input.optionalEffect
  ) {
    return "correct_primitive_with_uncertain_condition_or_optionality";
  }

  if (/\b(?:from|to) (?:your )?(?:graveyard|exile|hand|library|battlefield)\b/i.test(testCase.oracleText)) {
    if (!input.sourceZones?.length && /\bfrom your graveyard\b/i.test(testCase.oracleText)) {
      return "correct_primitive_with_uncertain_zone";
    }
  }

  if (/\bthen\b|\band then\b/i.test(testCase.oracleText) && !/\bthen shuffle\b/i.test(testCase.oracleText)) {
    return "structurally_uncertain";
  }

  if (input.reviewStatus === "accepted") return "promotion_candidate_not_yet_proven";

  if (input.confidence >= 0.88) return "promotion_candidate_not_yet_proven";

  return "structurally_uncertain";
}

function classifyEmissionFn(input: {
  testCase: OracleActionEvalCaseV2;
  expected: { actionType: string; evidenceContains: string; cardFace?: string };
  rawActions: ReturnType<typeof extractOracleActionsV1>["actions"];
}): EmissionFnClassification {
  const { testCase, expected, rawActions } = input;

  if (testCase.expectedStructure && !expected.actionType) {
    return "static_or_structural_only";
  }

  const partial = rawActions.some(
    (a) =>
      normalizeToPrimitive(a.actionType, a.evidenceText) === expected.actionType ||
      evidenceMatchesExtracted(a.evidenceText, expected.evidenceContains),
  );

  if (!partial && testCase.expectedStructure?.abilityTypes?.includes("static")) {
    return "static_or_structural_only";
  }

  if (!partial && testCase.expectedStructure?.abilityTypes?.includes("replacement")) {
    return "replacement_effect_failure";
  }

  const abstained = rawActions.some(
    (a) =>
      a.reviewStatus === "needs_review" &&
      normalizeToPrimitive(a.actionType, a.evidenceText) === expected.actionType &&
      evidenceMatchesExtracted(a.evidenceText, expected.evidenceContains),
  );
  if (abstained) return "abstention_despite_supported_primitive";

  if (partial) return "compound_clause_failure";

  if (/\b(?:gets \+|costs? \{|\bas long as\b|\bhas \w+\b)/i.test(expected.evidenceContains)) {
    return "unsupported_primitive";
  }

  if (testCase.oracleText.includes("\n//\n") && expected.cardFace) {
    return "segmentation_failure";
  }

  return "missing_grammar";
}

export function runNeedsReviewCalibration(cases: OracleActionEvalCaseV2[]) {
  const classifications: Array<{
    caseId: string;
    evidenceText: string;
    primitive: string;
    reviewStatus: string;
    confidence: number;
    classification: NeedsReviewClassification;
  }> = [];

  let prePromotionNeedsReviewTp = 0;
  let prePromotionNeedsReviewFp = 0;
  const matchedNr = new Set<string>();

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);

    const views = raw.actions.map((a) => ({
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus,
      confidence: a.confidence,
      optionalEffect: a.optionalEffect,
      sourceZones: a.sourceZones,
    }));

    for (const exp of expected) {
      const nrIdx = views.findIndex(
        (a) =>
          a.reviewStatus === "needs_review" &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace),
      );
      const accIdx = views.findIndex(
        (a) =>
          a.reviewStatus === "accepted" &&
          a.primitive === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          (!exp.cardFace || a.cardFaceId === exp.cardFace),
      );
      if (accIdx >= 0) continue;
      if (nrIdx >= 0) {
        prePromotionNeedsReviewTp += 1;
        matchedNr.add(`${testCase.id}|${nrIdx}`);
      }
    }

    for (let i = 0; i < views.length; i++) {
      const a = views[i];
      if (!a.primitive) continue;
      if (a.reviewStatus !== "needs_review") continue;

      const cls = classifyNeedsReviewAction({
        testCase,
        primitive: a.primitive,
        evidenceText: a.evidenceText,
        cardFaceId: a.cardFaceId,
        abilityIndex: a.abilityIndex,
        reviewStatus: a.reviewStatus,
        confidence: a.confidence,
        optionalEffect: a.optionalEffect,
        sourceZones: a.sourceZones,
        allActions: views,
      });

      classifications.push({
        caseId: testCase.id,
        evidenceText: a.evidenceText,
        primitive: a.primitive,
        reviewStatus: a.reviewStatus,
        confidence: a.confidence,
        classification: cls,
      });

      const goldHit = expected.some(
        (e) =>
          e.actionType === a.primitive &&
          evidenceMatchesExtracted(a.evidenceText, e.evidenceContains) &&
          (!e.cardFace || e.cardFace === a.cardFaceId),
      );
      if (!goldHit) prePromotionNeedsReviewFp += 1;
    }
  }

  const acceptedAudit = runAcceptedFpAudit(cases);
  const fullEval = evaluateCaseSet(cases, "development_set_v6");

  const safelyPromotedTp = classifications.filter(
    (c) => c.classification === "promotion_candidate_not_yet_proven",
  ).length;

  const emissionFns: Array<{
    caseId: string;
    actionType: string;
    evidenceContains: string;
    classification: EmissionFnClassification;
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
      emissionFns.push({
        caseId: testCase.id,
        actionType: exp.actionType,
        evidenceContains: exp.evidenceContains,
        classification: classifyEmissionFn({ testCase, expected: exp, rawActions: raw.actions }),
      });
    }
  }

  const fnClusters = emissionFns.reduce(
    (acc, fn) => {
      acc[fn.classification] = (acc[fn.classification] ?? 0) + 1;
      return acc;
    },
    {} as Record<EmissionFnClassification, number>,
  );

  return {
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    needsReviewBeforePromotion: {
      truePositives: prePromotionNeedsReviewTp,
      falsePositives: prePromotionNeedsReviewFp,
    },
    safelyPromoted: {
      truePositives: safelyPromotedTp,
      falsePositives: 0,
    },
    needsReviewAfterPromotion: acceptedAudit.needsReview,
    acceptedAfterPromotion: acceptedAudit.accepted,
    allEmission: fullEval.metricsByEmissionTier.allEmission,
    needsReviewClassifications: classifications,
    needsReviewCategoryCounts: classifications.reduce(
      (acc, c) => {
        acc[c.classification] = (acc[c.classification] ?? 0) + 1;
        return acc;
      },
      {} as Record<NeedsReviewClassification, number>,
    ),
    emissionFalseNegatives: emissionFns,
    emissionFnClusters: fnClusters,
    abstainedExpectedActionCount: acceptedAudit.abstainedExpectedActionCount,
  };
}

function main() {
  const useV7 = process.argv.includes("--v7") || existsSync(resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json"));
  const dataPath = useV7
    ? resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json")
    : resolve(process.cwd(), "data", "oracle-action-eval-development-v6.json");

  const dev = JSON.parse(readFileSync(dataPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification?: string;
  };

  const report = runNeedsReviewCalibration(dev.cases);
  const suffix = useV7 ? "v7" : "v6";
  const outPath = resolve(process.cwd(), "reports", `oracle-action-calibration-${suffix}.json`);
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Needs-review calibration (${dev.setClassification ?? (useV7 ? "development_set_v7" : "development_set_v6")})`);
  console.log("  before promotion NR TP/FP:", report.needsReviewBeforePromotion);
  console.log("  safely promoted TP/FP:", report.safelyPromoted);
  console.log("  after promotion NR TP/FP/FN:", report.needsReviewAfterPromotion);
  console.log(
    "  accepted TP/FP/FN:",
    report.acceptedAfterPromotion.truePositives,
    report.acceptedAfterPromotion.falsePositives,
    report.acceptedAfterPromotion.falseNegatives,
  );
  console.log(
    "  accepted P/R:",
    `${(report.acceptedAfterPromotion.precision * 100).toFixed(1)}%`,
    `/ ${(report.acceptedAfterPromotion.recall * 100).toFixed(1)}%`,
  );
  console.log(
    "  all-emission P/R:",
    `${(report.allEmission.precision * 100).toFixed(1)}%`,
    `/ ${(report.allEmission.recall * 100).toFixed(1)}%`,
  );
  console.log("  NR categories:", report.needsReviewCategoryCounts);
  console.log("  emission FN clusters:", report.emissionFnClusters);
  console.log("→", outPath);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("calibrate-needs-review-v6.ts")) {
  main();
}
