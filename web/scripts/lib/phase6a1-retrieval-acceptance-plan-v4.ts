/**
 * Phase 6A.1 — Retrieval acceptance plan v4 (CandidateIntent bridge for Gate B).
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { SemanticCandidateRetrievalReportV11 } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { FunctionalSemanticRequirement } from "./phase6a-calibration-v2-types";
import {
  getCoreCandidateIntents,
  getCandidateIntentProfile,
} from "./phase6a1-candidate-intent-adjudication-v1";
import {
  candidateIntentRequirementId,
  parseLinkedSpecField,
  type CandidateIntent,
} from "./phase6a1-candidate-intent-types-v1";
import {
  classifyProductProvenance,
  type ProductRequirementProvenance,
} from "./phase6a1-retrieval-acceptance-plan-v1";
import { predictBucketForLinkedField } from "./phase6a1-retrieval-bucket-map-v1";

export const RETRIEVAL_ACCEPTANCE_PLAN_V4_VERSION = "phase6a1-retrieval-acceptance-plan-v4";

export type ProductAcceptanceRequirementV4 = FunctionalSemanticRequirement & {
  caseId: string;
  intentId: string;
  causalRole: CandidateIntent["causalRole"];
  priority: "CORE";
  bucketId: RetrievalBucketId | "NON_BUCKET_CONTEXT";
  sourceSpecField: keyof RetrievalSpecification;
  sourceSpecValue: string;
  linkedSpecField: string;
  retrievalToken: string;
  requirementProvenance: ProductRequirementProvenance;
  executedBucket: boolean;
  bucketInvariantPass: boolean;
  bridge: "CandidateIntent";
};

export type CandidateIntentReconciliationV4 = {
  caseId: string;
  coreIntentCount: number;
  noCoreDeclaration: boolean;
  noCoreJustification?: string;
  acceptanceEvaluatedRequirements: ProductAcceptanceRequirementV4[];
  uncoveredCoreIntents: string[];
  bucketInvariantFailures: string[];
  executedRetrievalBuckets: RetrievalBucketId[];
  reconciliationPass: boolean;
  legacyFieldNameOnlyIntents: string[];
};

export function buildCandidateIntentAcceptanceV4(input: {
  caseId: string;
  frozenSpec: RetrievalSpecification;
  effectiveSpec: RetrievalSpecification;
  v11Report: SemanticCandidateRetrievalReportV11;
  upstreamGapApplied: boolean;
  contaminationCorrectionApplied: boolean;
}): CandidateIntentReconciliationV4 {
  const profile = getCandidateIntentProfile(input.caseId);
  if (!profile) {
    return {
      caseId: input.caseId,
      coreIntentCount: 0,
      noCoreDeclaration: false,
      acceptanceEvaluatedRequirements: [],
      uncoveredCoreIntents: [`missing profile for ${input.caseId}`],
      bucketInvariantFailures: [],
      executedRetrievalBuckets: [],
      reconciliationPass: false,
      legacyFieldNameOnlyIntents: [],
    };
  }

  const executedBuckets = Object.keys(input.v11Report.poolStats.candidatesPerBucket ?? {}) as RetrievalBucketId[];
  const executedBucketSet = new Set(executedBuckets);
  const acceptanceEvaluated: ProductAcceptanceRequirementV4[] = [];
  const bucketInvariantFailures: string[] = [];
  const uncoveredCoreIntents: string[] = [];

  for (const intent of profile.coreIntents) {
    const { sourceSpecField, sourceSpecValue } = parseLinkedSpecField(intent.linkedSpecField);
    const bucketPred = predictBucketForLinkedField(intent.linkedSpecField, input.effectiveSpec);
    const bucketId = intent.retrievalBucket ?? bucketPred.predictedBucket;
    const executedBucket = bucketId !== "NON_BUCKET_CONTEXT" && executedBucketSet.has(bucketId as RetrievalBucketId);

    if (bucketId !== "NON_BUCKET_CONTEXT" && !executedBucket) {
      bucketInvariantFailures.push(`${intent.intentId} → ${bucketId} (executedBucket=false)`);
    }

    acceptanceEvaluated.push({
      caseId: input.caseId,
      intentId: intent.intentId,
      requirementId: candidateIntentRequirementId(intent),
      description: `CandidateIntent CORE: ${intent.targetMechanic}`,
      linkedSpecFields: [intent.linkedSpecField, ...intent.sourceSemanticFields.filter((f) => f !== intent.linkedSpecField)],
      linkedSpecField: intent.linkedSpecField,
      sourceSpecField,
      sourceSpecValue,
      retrievalToken: intent.retrievalToken,
      causalRole: intent.causalRole,
      priority: "CORE",
      bucketId: bucketId as RetrievalBucketId | "NON_BUCKET_CONTEXT",
      executedBucket,
      bucketInvariantPass: bucketId === "NON_BUCKET_CONTEXT" || executedBucket,
      minViableAlternatives: 2,
      bridge: "CandidateIntent",
      requirementProvenance: classifyProductProvenance({
        caseId: input.caseId,
        linkedSpecField: intent.linkedSpecField,
        frozenSpec: input.frozenSpec,
        effectiveSpec: input.effectiveSpec,
        upstreamGapApplied: input.upstreamGapApplied,
        contaminationCorrectionApplied: input.contaminationCorrectionApplied,
      }),
    });
  }

  for (const intent of profile.coreIntents) {
    const req = acceptanceEvaluated.find((r) => r.intentId === intent.intentId);
    if (!req) {
      uncoveredCoreIntents.push(intent.intentId);
      continue;
    }
    if (req.bucketId !== "NON_BUCKET_CONTEXT" && !req.executedBucket) {
      uncoveredCoreIntents.push(intent.intentId);
    }
  }

  const legacyFieldNameOnlyIntents = profile.coreIntents
    .filter((i) => i.linkedSpecField.startsWith("requiredFunctions:"))
    .map((i) => i.intentId);

  const reconciliationPass =
    bucketInvariantFailures.length === 0 &&
    uncoveredCoreIntents.length === 0 &&
    (profile.coreIntents.length > 0 || Boolean(profile.noCoreDeclaration));

  return {
    caseId: input.caseId,
    coreIntentCount: profile.coreIntents.length,
    noCoreDeclaration: Boolean(profile.noCoreDeclaration),
    noCoreJustification: profile.noCoreDeclaration?.causalJustification,
    acceptanceEvaluatedRequirements: acceptanceEvaluated,
    uncoveredCoreIntents,
    bucketInvariantFailures,
    executedRetrievalBuckets: executedBuckets,
    reconciliationPass,
    legacyFieldNameOnlyIntents,
  };
}

export function rankCandidatesForAcceptanceRequirementV4(
  report: SemanticCandidateRetrievalReportV11,
  requirement: ProductAcceptanceRequirementV4,
) {
  const token =
    report.requirementTokens.find((t) => t.linkedSpecField === requirement.linkedSpecField) ??
    report.requirementTokens.find((t) => t.requirementToken === requirement.retrievalToken) ??
    report.requirementTokens.find((t) => t.requirementToken === requirement.sourceSpecValue);
  const rankKey = token?.requirementId ?? requirement.retrievalToken;
  return [...report.candidates].sort(
    (a, b) =>
      (a.rankForRequirement[rankKey] ?? Number.MAX_SAFE_INTEGER) -
      (b.rankForRequirement[rankKey] ?? Number.MAX_SAFE_INTEGER),
  );
}

export function getCoreCandidateIntentsForCase(caseId: string): CandidateIntent[] {
  return getCoreCandidateIntents(caseId);
}
