/**
 * Fail-closed provenance checks before parser evaluation runs.
 */
import { createHash } from "node:crypto";
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  goldenFaceRecords,
  lookupGoldenByName,
  normalizeOracleTextForCompare,
  type GoldenCatalogIndex,
} from "./load-golden-catalog-index";

export const PRODUCTION_GOLD_REVIEW_VERSION = "gold-review-v1";
export const SECOND_PASS_GOLD_REVIEW_VERSION = "gold-review-v2";
export const SYNTHETIC_ORACLE_ID_PATTERN =
  /^(eval-oracle-|held-oracle-|dev-v9-oracle-|dev-exp-oracle-|dev-opt-oracle-|dev-cond-oracle-|blind-oracle-)/;

export type GoldReviewStatus = "pending" | "reviewed" | "needs_manual_review";
export type GoldCompletenessStatus = "complete" | "incomplete";
export type IdentityStatus = "catalog_exact" | "identity_mismatch" | "synthetic_excluded";

export interface EvalDatasetEnvelope {
  setClassification?: string;
  contentHash?: string;
  taxonomyVersion?: string;
  evaluationSetVersion?: string;
  goldReviewVersion?: string;
  benchmarkStatus?: string;
  usableForParserEvaluation?: boolean;
  sealed?: boolean;
  parserExecutionCount?: number;
  cases: OracleActionEvalCaseV2[];
}

export interface CatalogEvalCase extends OracleActionEvalCaseV2 {
  cardName?: string;
  goldenCatalogVersion?: string;
  goldenOracleTextHash?: string;
  taxonomyVersion?: string;
  evaluationSetVersion?: string;
  goldReviewVersion?: string;
  goldReviewedAt?: string;
  goldReviewer?: string;
  goldReviewStatus?: GoldReviewStatus;
  goldCompletenessStatus?: GoldCompletenessStatus;
  identityStatus?: IdentityStatus;
  faceIndex?: number;
  faceName?: string;
  componentType?: string;
  expectedMechanicContext?: import("./gold-reminder-text-policy").ExpectedMechanicContext;
  invalidPriorTextDisposition?: "superseded_complete" | "gold_incomplete";
  goldCompletedAt?: string;
  goldCompleter?: string;
}

export class EvalProvenanceError extends Error {
  constructor(
    message: string,
    readonly caseId?: string,
  ) {
    super(message);
    this.name = "EvalProvenanceError";
  }
}

export function assertProductionOracleId(oracleId: string, caseId: string): void {
  if (SYNTHETIC_ORACLE_ID_PATTERN.test(oracleId)) {
    throw new EvalProvenanceError(
      `Case ${caseId} uses prohibited synthetic oracleId "${oracleId}"`,
      caseId,
    );
  }
  if (!oracleId || oracleId.length < 8) {
    throw new EvalProvenanceError(`Case ${caseId} missing valid catalog oracleId`, caseId);
  }
}

export function assertDatasetUsable(envelope: EvalDatasetEnvelope): void {
  if (envelope.benchmarkStatus === "invalid_identity") {
    throw new EvalProvenanceError(
      `Dataset ${envelope.setClassification ?? "unknown"} is marked invalid_identity and cannot be used for parser evaluation`,
    );
  }
  if (envelope.benchmarkStatus !== "catalog_clean") {
    throw new EvalProvenanceError(
      `Dataset ${envelope.setClassification ?? "unknown"} requires benchmarkStatus=catalog_clean (got ${envelope.benchmarkStatus ?? "unset"})`,
    );
  }
  if (envelope.usableForParserEvaluation === false) {
    throw new EvalProvenanceError(
      `Dataset ${envelope.setClassification ?? "unknown"} has usableForParserEvaluation=false`,
    );
  }
}

export function assertCaseGoldReviewed(testCase: CatalogEvalCase, caseId?: string): void {
  const id = caseId ?? testCase.id;
  if (testCase.goldReviewStatus !== "reviewed") {
    throw new EvalProvenanceError(
      `Case ${id} goldReviewStatus=${testCase.goldReviewStatus ?? "unset"} — second-pass review required`,
      id,
    );
  }
  if (
    testCase.goldReviewVersion &&
    testCase.goldReviewVersion !== SECOND_PASS_GOLD_REVIEW_VERSION
  ) {
    throw new EvalProvenanceError(
      `Case ${id} goldReviewVersion=${testCase.goldReviewVersion} — expected ${SECOND_PASS_GOLD_REVIEW_VERSION}`,
      id,
    );
  }
  if (testCase.goldCompletenessStatus !== "complete") {
    throw new EvalProvenanceError(
      `Case ${id} goldCompletenessStatus=${testCase.goldCompletenessStatus ?? "unset"} — catalog-backed gold completion required`,
      id,
    );
  }
  if (testCase.invalidPriorTextDisposition === "gold_incomplete") {
    throw new EvalProvenanceError(
      `Case ${id} has incomplete gold (invalid_prior_text category B)`,
      id,
    );
  }
}

export function assertCaseIdentityExact(testCase: CatalogEvalCase, caseId?: string): void {
  const id = caseId ?? testCase.id;
  if (testCase.identityStatus && testCase.identityStatus !== "catalog_exact") {
    throw new EvalProvenanceError(`Case ${id} identityStatus=${testCase.identityStatus}`, id);
  }
}

export function assertCaseProvenance(
  testCase: CatalogEvalCase,
  catalog: GoldenCatalogIndex,
  expected: {
    taxonomyVersion?: string;
    evaluationSetVersion?: string;
    goldReviewVersion?: string;
  },
): void {
  assertProductionOracleId(testCase.oracleId, testCase.id);

  const golden =
    catalog.byOracleId.get(testCase.oracleId) ??
    (testCase.cardName ? lookupGoldenByName(catalog, testCase.cardName) : null);

  if (!golden) {
    throw new EvalProvenanceError(
      `Catalog lookup failed for oracleId ${testCase.oracleId} (${testCase.id})`,
      testCase.id,
    );
  }

  if (testCase.cardName && golden.canonicalName !== testCase.cardName) {
    throw new EvalProvenanceError(
      `cardName mismatch on ${testCase.id}: stored="${testCase.cardName}" catalog="${golden.canonicalName}"`,
      testCase.id,
    );
  }

  const catalogText = combinedGoldenOracleText(golden);
  if (normalizeOracleTextForCompare(testCase.oracleText) !== normalizeOracleTextForCompare(catalogText)) {
    throw new EvalProvenanceError(
      `Oracle text differs from catalog on ${testCase.id}`,
      testCase.id,
    );
  }

  const storedHash = testCase.goldenOracleTextHash;
  const catalogHash = goldenOracleTextHash(catalogText);
  if (storedHash && storedHash !== catalogHash) {
    throw new EvalProvenanceError(
      `goldenOracleTextHash mismatch on ${testCase.id}`,
      testCase.id,
    );
  }

  if (testCase.layout && golden.layout && testCase.layout !== golden.layout) {
    throw new EvalProvenanceError(
      `layout mismatch on ${testCase.id}: stored=${testCase.layout} catalog=${golden.layout}`,
      testCase.id,
    );
  }

  if (expected.taxonomyVersion && testCase.taxonomyVersion && testCase.taxonomyVersion !== expected.taxonomyVersion) {
    throw new EvalProvenanceError(
      `taxonomyVersion mismatch on ${testCase.id}`,
      testCase.id,
    );
  }

  if (
    expected.goldReviewVersion &&
    testCase.goldReviewVersion &&
    testCase.goldReviewVersion !== expected.goldReviewVersion
  ) {
    throw new EvalProvenanceError(
      `goldReviewVersion mismatch on ${testCase.id}`,
      testCase.id,
    );
  }

  const faces = goldenFaceRecords(golden);
  if (testCase.expectedFaces?.length) {
    for (const ef of testCase.expectedFaces) {
      const gf = faces[ef.faceIndex];
      if (gf && ef.faceName && gf.faceName !== ef.faceName) {
        throw new EvalProvenanceError(
          `Face name mismatch on ${testCase.id} index ${ef.faceIndex}`,
          testCase.id,
        );
      }
    }
  }
}

export function assertDatasetManifestHash(
  envelope: EvalDatasetEnvelope,
  manifestHash?: string,
): void {
  if (!manifestHash || !envelope.contentHash) return;
  if (manifestHash !== envelope.contentHash) {
    throw new EvalProvenanceError(
      `Dataset contentHash ${envelope.contentHash.slice(0, 12)}… differs from manifest ${manifestHash.slice(0, 12)}…`,
    );
  }
}

export function computeDatasetContentHash(cases: OracleActionEvalCaseV2[]): string {
  const canonical = JSON.stringify(
    cases.map((c) => ({
      id: c.id,
      category: c.category,
      layout: c.layout,
      oracleId: c.oracleId,
      oracleText: c.oracleText,
      cardFace: c.cardFace,
      expectedStructure: c.expectedStructure,
      expectedPrimitiveActions: c.expectedPrimitiveActions,
      expectedConditions: c.expectedConditions,
      expectedRoles: c.expectedRoles,
      forbiddenPrimitiveActions: c.forbiddenPrimitiveActions,
      expectedMechanicContext: (c as CatalogEvalCase).expectedMechanicContext,
      goldCompletenessStatus: (c as CatalogEvalCase).goldCompletenessStatus,
    })),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export function guardEvaluationDataset(input: {
  envelope: EvalDatasetEnvelope;
  catalog: GoldenCatalogIndex;
  manifestContentHash?: string;
  requireGoldReviewVersion?: string;
  requireGoldReviewComplete?: boolean;
  /** When true, skip usableForParserEvaluation check (identity-only, e.g. blind set). */
  identityOnly?: boolean;
}): void {
  if (!input.identityOnly) {
    assertDatasetUsable(input.envelope);
  } else if (input.envelope.benchmarkStatus === "invalid_identity") {
    throw new EvalProvenanceError(
      `Dataset ${input.envelope.setClassification ?? "unknown"} is marked invalid_identity`,
    );
  }
  assertDatasetManifestHash(input.envelope, input.manifestContentHash);

  const requireReview =
    input.requireGoldReviewComplete ?? (!input.identityOnly && input.envelope.usableForParserEvaluation !== false);

  for (const testCase of input.envelope.cases) {
    const c = testCase as CatalogEvalCase;
    assertCaseProvenance(c, input.catalog, {
      taxonomyVersion: input.envelope.taxonomyVersion,
      evaluationSetVersion: input.envelope.evaluationSetVersion,
      goldReviewVersion: input.requireGoldReviewVersion ?? input.envelope.goldReviewVersion,
    });
    if (requireReview) {
      assertCaseGoldReviewed(c);
      assertCaseIdentityExact(c);
    }
  }
}

/** Fail closed for official benchmark reports — no bypass. */
export function guardOfficialBenchmarkDataset(input: {
  envelope: EvalDatasetEnvelope;
  catalog: GoldenCatalogIndex;
  manifestContentHash?: string;
}): void {
  guardEvaluationDataset({
    ...input,
    requireGoldReviewComplete: true,
    requireGoldReviewVersion: SECOND_PASS_GOLD_REVIEW_VERSION,
  });
}
