/**
 * Phase 6A.1 — Retrieval acceptance plan v2 (strict Gate B).
 * Semantic intent coverage, executed-bucket invariant, product acceptance surface.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { SemanticCandidateRetrievalReportV11 } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import { extractRequirementTokensFromSpec } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { FunctionalSemanticRequirement } from "./phase6a-calibration-v2-types";
import {
  predictRetrievalDrivingFields,
  type LinkedFieldBucketPrediction,
} from "./phase6a1-retrieval-bucket-map-v1";
import {
  classifyProductProvenance,
  type ProductRequirementProvenance,
} from "./phase6a1-retrieval-acceptance-plan-v1";

export const RETRIEVAL_ACCEPTANCE_PLAN_V2_VERSION = "phase6a1-retrieval-acceptance-plan-v2";

export type AcceptanceBucketKind = RetrievalBucketId | "NON_BUCKET_CONTEXT";

export type ProductAcceptanceRequirementV2 = FunctionalSemanticRequirement & {
  caseId: string;
  bucketId: AcceptanceBucketKind;
  sourceSpecField: keyof RetrievalSpecification;
  sourceSpecValue: string;
  requirementProvenance: ProductRequirementProvenance;
  linkedSpecField: string;
  executedBucket: boolean;
  bucketInvariantPass: boolean;
};

export type SemanticIntentRecord = {
  linkedSpecField: string;
  sourceSpecField: keyof RetrievalSpecification;
  sourceSpecValue: string;
  predictedBucket: AcceptanceBucketKind;
  drivesRetrievalQuery: boolean;
  coveredByAcceptance: boolean;
};

export type RetrievalPlanReconciliationV2 = {
  effectiveSemanticIntents: SemanticIntentRecord[];
  effectiveRetrievalDrivingFields: string[];
  executedRetrievalBuckets: RetrievalBucketId[];
  acceptanceEvaluatedRequirements: ProductAcceptanceRequirementV2[];
  nonBucketContextFields: Array<{
    linkedSpecField: string;
    sourceSpecField: keyof RetrievalSpecification;
    sourceSpecValue: string;
    reason: string;
  }>;
  uncoveredSemanticIntents: string[];
  bucketInvariantFailures: string[];
  acceptanceSurfaceFailures: string[];
  reconciliationPass: boolean;
  noProductCandidateRequirement?: {
    classification: "NO_PRODUCT_CANDIDATE_REQUIREMENT";
    justification: string;
  };
};

const ACCEPTANCE_SCALAR_FIELDS: Array<"requiredFunctions" | "requiredInputs" | "outputsToExploit"> = [
  "requiredFunctions",
  "requiredInputs",
  "outputsToExploit",
];

function acceptanceRequirementId(linkedSpecField: string): string {
  return linkedSpecField.replace(/:/g, "_");
}

function isAcceptanceEvaluatedField(field: keyof RetrievalSpecification): boolean {
  return (ACCEPTANCE_SCALAR_FIELDS as string[]).includes(field);
}

function semanticIntentFromPrediction(p: LinkedFieldBucketPrediction): SemanticIntentRecord {
  return {
    linkedSpecField: p.linkedSpecField,
    sourceSpecField: p.sourceSpecField,
    sourceSpecValue: p.sourceSpecValue,
    predictedBucket: p.predictedBucket,
    drivesRetrievalQuery: p.drivesRetrievalQuery,
    coveredByAcceptance: false,
  };
}

function collectSemanticIntents(spec: RetrievalSpecification): SemanticIntentRecord[] {
  const predictions = predictRetrievalDrivingFields(spec);
  const tokenFields = new Set(extractRequirementTokensFromSpec(spec).map((t) => t.linkedSpecField));
  const seen = new Set<string>();
  const intents: SemanticIntentRecord[] = [];

  for (const p of predictions) {
    if (seen.has(p.linkedSpecField)) continue;
    seen.add(p.linkedSpecField);
    intents.push(semanticIntentFromPrediction(p));
  }

  for (const tokenField of tokenFields) {
    if (seen.has(tokenField)) continue;
    const [rawField, value] = tokenField.split(":") as [keyof RetrievalSpecification, string];
    if (!value) continue;
    if (!isAcceptanceEvaluatedField(rawField)) {
      intents.push({
        linkedSpecField: tokenField,
        sourceSpecField: rawField,
        sourceSpecValue: value,
        predictedBucket: "NON_BUCKET_CONTEXT",
        drivesRetrievalQuery: false,
        coveredByAcceptance: false,
      });
      seen.add(tokenField);
    }
  }

  return intents;
}

export function buildProductAcceptanceRequirementsV2(input: {
  caseId: string;
  frozenSpec: RetrievalSpecification;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  v11Report: SemanticCandidateRetrievalReportV11;
  upstreamGapApplied: boolean;
  contaminationCorrectionApplied: boolean;
  oracleGroundedOverlayV2Applied: boolean;
}): RetrievalPlanReconciliationV2 {
  const executedBuckets = Object.keys(input.v11Report.poolStats.candidatesPerBucket ?? {}) as RetrievalBucketId[];
  const executedBucketSet = new Set(executedBuckets);
  const tokenByField = new Map(
    extractRequirementTokensFromSpec(input.effectiveSpec).map((t) => [t.linkedSpecField, t]),
  );

  const semanticIntents = collectSemanticIntents(input.effectiveSpec);
  const acceptanceEvaluated: ProductAcceptanceRequirementV2[] = [];
  const nonBucketContext: RetrievalPlanReconciliationV2["nonBucketContextFields"] = [];
  const bucketInvariantFailures: string[] = [];
  const acceptanceSurfaceFailures: string[] = [];
  const drivingFields: string[] = [];

  const pushAcceptance = (field: "requiredFunctions" | "requiredInputs" | "outputsToExploit", value: string) => {
    const linkedSpecField = `${field}:${value}`;
    drivingFields.push(linkedSpecField);
    const intent = semanticIntents.find((s) => s.linkedSpecField === linkedSpecField);
    const bucketId = (intent?.predictedBucket ?? "NON_BUCKET_CONTEXT") as AcceptanceBucketKind;
    const requirementId = acceptanceRequirementId(linkedSpecField);
    const executedBucket = bucketId !== "NON_BUCKET_CONTEXT" && executedBucketSet.has(bucketId as RetrievalBucketId);
    const bucketInvariantPass =
      bucketId === "NON_BUCKET_CONTEXT" || (executedBucket && executedBucketSet.has(bucketId as RetrievalBucketId));

    if (bucketId !== "NON_BUCKET_CONTEXT" && !executedBucket) {
      bucketInvariantFailures.push(`${linkedSpecField} → ${bucketId} (executedBucket=false)`);
    }
    if (bucketId !== "NON_BUCKET_CONTEXT" && !executedBucketSet.has(bucketId as RetrievalBucketId)) {
      bucketInvariantFailures.push(`${linkedSpecField} → ${bucketId} not in executedRetrievalBuckets`);
    }

    if (bucketId === "NON_BUCKET_CONTEXT") {
      nonBucketContext.push({
        linkedSpecField,
        sourceSpecField: field,
        sourceSpecValue: value,
        reason: "Typed semantic intent does not resolve to an executed retrieval bucket query.",
      });
    }

    if (intent) intent.coveredByAcceptance = true;

    acceptanceEvaluated.push({
      caseId: input.caseId,
      requirementId,
      description: `Product acceptance v2: ${linkedSpecField} under effective Phase-6 retrieval plan.`,
      linkedSpecFields: [linkedSpecField],
      linkedSpecField,
      sourceSpecField: field,
      sourceSpecValue: value,
      bucketId,
      executedBucket,
      bucketInvariantPass,
      minViableAlternatives: 2,
      requirementProvenance: classifyProductProvenance({
        caseId: input.caseId,
        linkedSpecField,
        frozenSpec: input.frozenSpec,
        effectiveSpec: input.effectiveSpec,
        upstreamGapApplied: input.upstreamGapApplied,
        contaminationCorrectionApplied: input.contaminationCorrectionApplied,
      }),
    });
  };

  for (const fn of input.effectiveSpec.requiredFunctions) pushAcceptance("requiredFunctions", fn);
  for (const inputNeed of input.effectiveSpec.requiredInputs) pushAcceptance("requiredInputs", inputNeed);
  for (const output of input.effectiveSpec.outputsToExploit) pushAcceptance("outputsToExploit", output);

  const materialDrivingIntents = semanticIntents.filter(
    (s) =>
      s.drivesRetrievalQuery ||
      isAcceptanceEvaluatedField(s.sourceSpecField),
  );
  const uncoveredSemanticIntents = materialDrivingIntents
    .filter((s) => !s.coveredByAcceptance && s.drivesRetrievalQuery)
    .map((s) => s.linkedSpecField);

  if (acceptanceEvaluated.length === 0) {
    acceptanceSurfaceFailures.push("zero acceptance requirements — requires NO_PRODUCT_CANDIDATE_REQUIREMENT classification");
  }

  const reconciliationPass =
    bucketInvariantFailures.length === 0 &&
    uncoveredSemanticIntents.length === 0 &&
    acceptanceSurfaceFailures.length === 0;

  return {
    effectiveSemanticIntents: semanticIntents,
    effectiveRetrievalDrivingFields: drivingFields,
    executedRetrievalBuckets: executedBuckets,
    acceptanceEvaluatedRequirements: acceptanceEvaluated,
    nonBucketContextFields: nonBucketContext,
    uncoveredSemanticIntents,
    bucketInvariantFailures,
    acceptanceSurfaceFailures,
    reconciliationPass,
  };
}

export function rankCandidatesForAcceptanceRequirementV2(
  report: SemanticCandidateRetrievalReportV11,
  requirement: ProductAcceptanceRequirementV2,
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
