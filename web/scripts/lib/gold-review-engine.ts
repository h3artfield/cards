/**
 * Second-pass catalog-backed gold review — verifies identity + gold completeness per case.
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import type { ExpectedPrimitiveAction } from "../audit-oracle-action-eval-cases";
import { evidenceMatchesOracle } from "../oracle-action-eval-shared";
import type { CatalogEvalCase } from "./eval-provenance-guard";
import { PRODUCTION_GOLD_REVIEW_VERSION } from "./eval-provenance-guard";
import { goldenFaceRecords, type GoldenCatalogIndex } from "./load-golden-catalog-index";
import { auditEvalCaseIdentity } from "./eval-identity-audit-lib";

export const SECOND_PASS_GOLD_REVIEW_VERSION = "gold-review-v2";

export type GoldReviewStatus = "pending" | "reviewed" | "needs_manual_review";

export interface GoldReviewIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface GoldReviewResult {
  caseId: string;
  goldReviewStatus: GoldReviewStatus;
  goldReviewer: string;
  goldReviewedAt: string;
  goldReviewVersion: string;
  identityExact: boolean;
  issues: GoldReviewIssue[];
  abilityCount: number;
  primitiveCount: number;
  evidenceValidCount: number;
  evidenceTotal: number;
}

function verifyPrimitiveEvidence(
  oracleText: string,
  primitive: ExpectedPrimitiveAction,
): GoldReviewIssue[] {
  const issues: GoldReviewIssue[] = [];
  if (primitive.negative) return issues;

  if (!evidenceMatchesOracle(oracleText, primitive.evidenceContains)) {
    issues.push({
      field: "expectedPrimitiveActions",
      message: `Evidence "${primitive.evidenceContains}" not found for ${primitive.actionType}`,
      severity: "error",
    });
    return issues;
  }

  if (primitive.cardFace) {
    const faces = segmentCardFaces(oracleText);
    const face = faces.find((f) => f.faceId === primitive.cardFace);
    if (!face) {
      if (evidenceMatchesOracle(oracleText, primitive.evidenceContains)) {
        issues.push({
          field: "expectedPrimitiveActions",
          message: `cardFace ${primitive.cardFace} not in oracle segmentation; evidence verified on combined oracle text`,
          severity: "warning",
        });
      } else {
        issues.push({
          field: "expectedPrimitiveActions",
          message: `cardFace ${primitive.cardFace} not in oracle segmentation`,
          severity: "error",
        });
      }
    } else if (!evidenceMatchesOracle(face.text, primitive.evidenceContains)) {
      issues.push({
        field: "expectedPrimitiveActions",
        message: `${primitive.actionType} evidence not on face ${primitive.cardFace}`,
        severity: "error",
      });
    }
  }
  return issues;
}

export function reviewCaseGoldSecondPass(input: {
  testCase: CatalogEvalCase;
  catalog: GoldenCatalogIndex;
  cardName?: string;
  reviewer: string;
  reviewedAt: string;
  priorIssues?: GoldReviewIssue[];
}): GoldReviewResult {
  const { testCase, catalog, cardName, reviewer, reviewedAt, priorIssues = [] } = input;
  const issues: GoldReviewIssue[] = [...priorIssues];

  const identity = auditEvalCaseIdentity({
    testCase,
    dataset: "second_pass",
    cardName: testCase.cardName ?? cardName,
    catalog,
  });

  if (!identity.exactMatch) {
    for (const m of identity.mismatches) {
      issues.push({
        field: "identity",
        message: `${m.classification}: ${m.likelyRootCause}`,
        severity: "error",
      });
    }
  }

  const golden = catalog.byOracleId.get(testCase.oracleId);
  if (golden && testCase.faceIndex !== undefined) {
    const faces = goldenFaceRecords(golden);
    const gf = faces[testCase.faceIndex];
    if (gf && testCase.faceName && gf.faceName !== testCase.faceName) {
      issues.push({
        field: "faceName",
        message: `faceName mismatch: stored=${testCase.faceName} catalog=${gf.faceName}`,
        severity: "warning",
      });
    }
  }

  const faces = segmentCardFaces(testCase.oracleText);
  const targetFaces = testCase.cardFace ? faces.filter((f) => f.faceId === testCase.cardFace) : faces;
  const abilitySegmentation = targetFaces.flatMap((face) =>
    segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start),
  );

  let evidenceValidCount = 0;
  let evidenceTotal = 0;
  for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
    evidenceTotal += 1;
    const primIssues = verifyPrimitiveEvidence(testCase.oracleText, exp);
    if (primIssues.length === 0) evidenceValidCount += 1;
    issues.push(...primIssues);
  }

  for (const cond of testCase.expectedConditions ?? []) {
    if (!evidenceMatchesOracle(testCase.oracleText, cond.textContains)) {
      issues.push({
        field: "expectedConditions",
        message: `Condition "${cond.textContains}" not in oracle text`,
        severity: "error",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  const goldReviewStatus: GoldReviewStatus = hasErrors ? "needs_manual_review" : "reviewed";

  return {
    caseId: testCase.id,
    goldReviewStatus,
    goldReviewer: reviewer,
    goldReviewedAt: reviewedAt,
    goldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
    identityExact: identity.exactMatch,
    issues,
    abilityCount: abilitySegmentation.length,
    primitiveCount: testCase.expectedPrimitiveActions.length,
    evidenceValidCount,
    evidenceTotal,
  };
}

export function applyGoldReviewToCase(
  testCase: CatalogEvalCase,
  review: GoldReviewResult,
): CatalogEvalCase {
  return {
    ...testCase,
    goldReviewStatus: review.goldReviewStatus,
    goldReviewer: review.goldReviewer,
    goldReviewedAt: review.goldReviewedAt,
    goldReviewVersion: review.goldReviewVersion,
    identityStatus: review.identityExact ? "catalog_exact" : "identity_mismatch",
  };
}

export function summarizeGoldReview(results: GoldReviewResult[]): {
  total: number;
  reviewed: number;
  needsManualReview: number;
  pending: number;
  identityExact: number;
  reviewRate: number;
} {
  const total = results.length;
  const reviewed = results.filter((r) => r.goldReviewStatus === "reviewed").length;
  const needsManualReview = results.filter((r) => r.goldReviewStatus === "needs_manual_review").length;
  const pending = results.filter((r) => r.goldReviewStatus === "pending").length;
  const identityExact = results.filter((r) => r.identityExact).length;
  return {
    total,
    reviewed,
    needsManualReview,
    pending,
    identityExact,
    reviewRate: total ? reviewed / total : 0,
  };
}

export function assertGoldReviewComplete(results: GoldReviewResult[], setName: string): void {
  const incomplete = results.filter((r) => r.goldReviewStatus !== "reviewed");
  if (incomplete.length > 0) {
    throw new Error(
      `${setName} gold review incomplete: ${incomplete.length}/${results.length} cases not reviewed (${incomplete.slice(0, 5).map((r) => r.caseId).join(", ")}…)`,
    );
  }
}

/** @deprecated Use SECOND_PASS_GOLD_REVIEW_VERSION for production benchmarks. */
export { PRODUCTION_GOLD_REVIEW_VERSION };
