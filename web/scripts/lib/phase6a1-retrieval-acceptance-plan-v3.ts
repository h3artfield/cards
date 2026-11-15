/**
 * Phase 6A.1 — Retrieval acceptance plan v3 (intent classes + Gate B).
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { SemanticCandidateRetrievalReportV11 } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import { extractRequirementTokensFromSpec } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { FunctionalSemanticRequirement } from "./phase6a-calibration-v2-types";
import {
  getSemanticRoleAdjudicationsForCase,
} from "./phase6a1-semantic-role-correction-overlay-v1";
import {
  classifyProductProvenance,
  type ProductRequirementProvenance,
} from "./phase6a1-retrieval-acceptance-plan-v1";
import {
  predictBucketForLinkedField,
} from "./phase6a1-retrieval-bucket-map-v1";
import type { SemanticIntentClass } from "./phase6a1-semantic-role-types-v1";

export const RETRIEVAL_ACCEPTANCE_PLAN_V3_VERSION = "phase6a1-retrieval-acceptance-plan-v3";

export type AcceptanceBucketKind = RetrievalBucketId | "NON_BUCKET_CONTEXT";

export type SemanticIntentRecordV3 = {
  linkedSpecField: string;
  sourceSpecField: keyof RetrievalSpecification;
  sourceSpecValue: string;
  intentClass: SemanticIntentClass;
  predictedBucket: AcceptanceBucketKind;
  drivesRetrievalQuery: boolean;
  coveredByAcceptance: boolean;
  semanticRole: string;
};

export type ProductAcceptanceRequirementV3 = FunctionalSemanticRequirement & {
  caseId: string;
  bucketId: AcceptanceBucketKind;
  intentClass: "CANDIDATE_GENERATING_REQUIREMENT";
  sourceSpecField: keyof RetrievalSpecification;
  sourceSpecValue: string;
  requirementProvenance: ProductRequirementProvenance;
  linkedSpecField: string;
  executedBucket: boolean;
  bucketInvariantPass: boolean;
};

export type MatchConstraintRecordV3 = {
  caseId: string;
  linkedSpecField: string;
  intentClass: "CANDIDATE_MATCH_CONSTRAINT";
  semanticRole: string;
  evaluationContract: string;
};

export type RetrievalPlanReconciliationV3 = {
  effectiveSemanticIntents: SemanticIntentRecordV3[];
  candidateGeneratingIntents: SemanticIntentRecordV3[];
  matchConstraints: MatchConstraintRecordV3[];
  contextIntents: SemanticIntentRecordV3[];
  executedRetrievalBuckets: RetrievalBucketId[];
  acceptanceEvaluatedRequirements: ProductAcceptanceRequirementV3[];
  uncoveredCandidateGeneratingIntents: string[];
  bucketInvariantFailures: string[];
  reconciliationPass: boolean;
};

function acceptanceRequirementId(linkedSpecField: string): string {
  return linkedSpecField.replace(/:/g, "_");
}

function intentFromSpecField(
  caseId: string,
  field: keyof RetrievalSpecification,
  value: string,
  spec: RetrievalSpecification,
  oracleBlob: string,
): SemanticIntentRecordV3 {
  const linkedSpecField = `${field}:${value}`;
  const bucketPred = predictBucketForLinkedField(linkedSpecField, spec);
  const adj = getSemanticRoleAdjudicationsForCase(caseId, spec, oracleBlob).find(
    (a) => {
      const effField = a.effectiveField ?? a.originalField;
      const effValue = a.effectiveValue ?? a.originalValue;
      return effField === field && effValue === value && a.disposition !== "REMOVE";
    },
  );
  const intentClass = adj?.intentClass ?? "GENERIC_SUPPORT_CONTEXT";
  return {
    linkedSpecField,
    sourceSpecField: field,
    sourceSpecValue: value,
    intentClass,
    predictedBucket: bucketPred.predictedBucket,
    drivesRetrievalQuery: bucketPred.drivesRetrievalQuery,
    coveredByAcceptance: false,
    semanticRole: adj?.semanticRole ?? "CONTEXT_ONLY",
  };
}

export function buildProductAcceptanceRequirementsV3(input: {
  caseId: string;
  frozenSpec: RetrievalSpecification;
  effectiveSpec: RetrievalSpecification;
  v11Report: SemanticCandidateRetrievalReportV11;
  oracleBlob: string;
  upstreamGapApplied: boolean;
  contaminationCorrectionApplied: boolean;
  oracleGroundedOverlayV2Applied: boolean;
  semanticRoleCorrectionApplied: boolean;
}): RetrievalPlanReconciliationV3 {
  const executedBuckets = Object.keys(input.v11Report.poolStats.candidatesPerBucket ?? {}) as RetrievalBucketId[];
  const executedBucketSet = new Set(executedBuckets);
  const acceptanceEvaluated: ProductAcceptanceRequirementV3[] = [];
  const matchConstraints: MatchConstraintRecordV3[] = [];
  const bucketInvariantFailures: string[] = [];

  const allIntents: SemanticIntentRecordV3[] = [];
  const seen = new Set<string>();

  for (const { field, value } of extractRequirementTokensFromSpec(input.effectiveSpec).map((t) => {
    const [f, v] = t.linkedSpecField.split(":") as [keyof RetrievalSpecification, string];
    return { field: f, value: v };
  })) {
    if (!value || seen.has(`${field}:${value}`)) continue;
    if (!(input.effectiveSpec[field] as string[]).includes(value)) continue;
    seen.add(`${field}:${value}`);
    allIntents.push(intentFromSpecField(input.caseId, field, value, input.effectiveSpec, input.oracleBlob));
  }

  for (const intent of allIntents) {
    if (intent.intentClass === "CANDIDATE_MATCH_CONSTRAINT") {
      matchConstraints.push({
        caseId: input.caseId,
        linkedSpecField: intent.linkedSpecField,
        intentClass: "CANDIDATE_MATCH_CONSTRAINT",
        semanticRole: intent.semanticRole,
        evaluationContract: `FunctionalMatch ranking constraint for ${intent.linkedSpecField}`,
      });
      intent.coveredByAcceptance = true;
      continue;
    }

    if (
      intent.intentClass === "OUTPUT_OR_PAYOFF_CONTEXT" ||
      intent.intentClass === "STATE_OR_ZONE_CONTEXT" ||
      intent.intentClass === "GENERIC_SUPPORT_CONTEXT"
    ) {
      intent.coveredByAcceptance = true;
      continue;
    }

    if (intent.intentClass !== "CANDIDATE_GENERATING_REQUIREMENT") continue;

    const bucketId = intent.predictedBucket;
    const executedBucket = bucketId !== "NON_BUCKET_CONTEXT" && executedBucketSet.has(bucketId as RetrievalBucketId);
    const bucketInvariantPass =
      bucketId === "NON_BUCKET_CONTEXT" || (executedBucket && executedBucketSet.has(bucketId as RetrievalBucketId));

    if (bucketId !== "NON_BUCKET_CONTEXT" && !executedBucket) {
      bucketInvariantFailures.push(`${intent.linkedSpecField} → ${bucketId} (executedBucket=false)`);
    }

    intent.coveredByAcceptance = true;
    acceptanceEvaluated.push({
      caseId: input.caseId,
      requirementId: acceptanceRequirementId(intent.linkedSpecField),
      description: `Product acceptance v3: ${intent.linkedSpecField}`,
      linkedSpecFields: [intent.linkedSpecField],
      linkedSpecField: intent.linkedSpecField,
      sourceSpecField: intent.sourceSpecField,
      sourceSpecValue: intent.sourceSpecValue,
      bucketId,
      intentClass: "CANDIDATE_GENERATING_REQUIREMENT",
      executedBucket,
      bucketInvariantPass,
      minViableAlternatives: 2,
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

  const candidateGeneratingIntents = allIntents.filter((i) => i.intentClass === "CANDIDATE_GENERATING_REQUIREMENT");
  const contextIntents = allIntents.filter(
    (i) =>
      i.intentClass === "OUTPUT_OR_PAYOFF_CONTEXT" ||
      i.intentClass === "STATE_OR_ZONE_CONTEXT" ||
      i.intentClass === "GENERIC_SUPPORT_CONTEXT",
  );
  const uncoveredCandidateGeneratingIntents = candidateGeneratingIntents
    .filter((i) => {
      const req = acceptanceEvaluated.find((r) => r.linkedSpecField === i.linkedSpecField);
      if (!req) return true;
      if (req.bucketId !== "NON_BUCKET_CONTEXT" && !req.executedBucket) return true;
      return false;
    })
    .map((i) => i.linkedSpecField);

  const reconciliationPass =
    bucketInvariantFailures.length === 0 &&
    uncoveredCandidateGeneratingIntents.length === 0 &&
    candidateGeneratingIntents.every((i) => i.coveredByAcceptance);

  return {
    effectiveSemanticIntents: allIntents,
    candidateGeneratingIntents,
    matchConstraints,
    contextIntents,
    executedRetrievalBuckets: executedBuckets,
    acceptanceEvaluatedRequirements: acceptanceEvaluated,
    uncoveredCandidateGeneratingIntents,
    bucketInvariantFailures,
    reconciliationPass,
  };
}

export function rankCandidatesForAcceptanceRequirementV3(
  report: SemanticCandidateRetrievalReportV11,
  requirement: ProductAcceptanceRequirementV3,
) {
  const token =
    report.requirementTokens.find((t) => t.linkedSpecField === requirement.linkedSpecField) ??
    report.requirementTokens.find((t) => t.requirementToken === requirement.sourceSpecValue);
  const rankKey = token?.requirementId ?? requirement.sourceSpecValue;
  return [...report.candidates].sort(
    (a, b) =>
      (a.rankForRequirement[rankKey] ?? Number.MAX_SAFE_INTEGER) -
      (b.rankForRequirement[rankKey] ?? Number.MAX_SAFE_INTEGER),
  );
}
