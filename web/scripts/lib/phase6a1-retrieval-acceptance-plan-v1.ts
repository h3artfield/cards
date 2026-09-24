/**
 * Phase 6A.1 — Retrieval acceptance plan: bucket reconciliation + product requirements.
 * Canonical product surface derives from effective spec requiredFunctions + requiredInputs,
 * mapped to executed retrieval buckets (or NON_BUCKET_CONTEXT).
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { SemanticCandidateRetrievalReportV11 } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import { extractRequirementTokensFromSpec } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { FunctionalSemanticRequirement } from "./phase6a-calibration-v2-types";

export const RETRIEVAL_ACCEPTANCE_PLAN_V1_VERSION = "phase6a1-retrieval-acceptance-plan-v1";

export type ProductRequirementProvenance =
  | "ACTIVE_EFFECTIVE_SPEC_REQUIREMENT"
  | "DERIVED_EFFECTIVE_SPEC_REQUIREMENT"
  | "UPSTREAM_SPEC_GAP_DERIVED_REQUIREMENT"
  | "CONTAMINATION_CORRECTION_DERIVED_REQUIREMENT";

export type AcceptanceBucketKind = RetrievalBucketId | "NON_BUCKET_CONTEXT";

export type ProductAcceptanceRequirement = FunctionalSemanticRequirement & {
  caseId: string;
  bucketId: AcceptanceBucketKind;
  sourceSpecField: keyof RetrievalSpecification;
  sourceSpecValue: string;
  requirementProvenance: ProductRequirementProvenance;
  linkedSpecField: string;
  executedBucket: boolean;
};

export type RetrievalPlanReconciliation = {
  effectiveRetrievalDrivingFields: string[];
  executedRetrievalBuckets: RetrievalBucketId[];
  acceptanceEvaluatedRequirements: ProductAcceptanceRequirement[];
  nonBucketContextFields: Array<{
    linkedSpecField: string;
    sourceSpecField: keyof RetrievalSpecification;
    sourceSpecValue: string;
    reason: string;
  }>;
  reconciliationPass: boolean;
  omittedFromAcceptance: string[];
};

const FUNCTION_TO_BUCKET: Record<string, RetrievalBucketId> = {
  ramp: "MANA_SUPPORT",
  mana_generation: "MANA_SUPPORT",
  card_draw: "CARD_ADVANTAGE",
  card_advantage: "CARD_ADVANTAGE",
  removal: "INTERACTION",
  countermagic: "INTERACTION",
  board_wipe: "INTERACTION",
  tutor: "ENABLERS",
  recursion: "RECURSION",
  reanimation: "RECURSION",
  token_generation: "ENGINE_PIECES",
  sacrifice_outlet: "RESOURCE_CONSUMERS",
  sacrifice_payoff: "PAYOFFS",
  protection: "PROTECTION",
  combat_payoff: "PAYOFFS",
  graveyard_setup: "STATE_BUILDERS",
  blink_flicker: "ENABLERS",
  cost_reduction: "MANA_SUPPORT",
  combat_manipulation: "INTERACTION",
  mill: "MANA_SUPPORT",
  opponent_mill_amplification: "MANA_SUPPORT",
  graveyard_to_library_top: "RECURSION",
};

const ROLE_ALIASES: Record<string, string> = {
  reanimation: "recursion",
  recursion: "recursion",
  graveyard_setup: "graveyard_setup",
  mill: "mill",
  sacrifice_outlet: "sacrifice_outlet",
  sacrifice_payoff: "sacrifice_payoff",
  token_generation: "token_generation",
  combat_payoff: "combat_payoff",
  card_draw: "card_draw",
  ramp: "ramp",
};

function resolveRole(token: string): string | null {
  const lower = token.toLowerCase();
  if (ROLE_ALIASES[lower]) return ROLE_ALIASES[lower]!;
  if (ROLE_ALIASES[token]) return ROLE_ALIASES[token]!;
  return null;
}

export function bucketForSpecToken(field: keyof RetrievalSpecification, value: string): AcceptanceBucketKind {
  if (field === "requiredInputs" || field === "outputsToExploit") {
    const role = resolveRole(value);
    if (!role) return "NON_BUCKET_CONTEXT";
    if (field === "outputsToExploit") return "PAYOFFS";
    return "STATE_BUILDERS";
  }
  if (field === "requiredFunctions" || field === "desiredFunctions") {
    if (FUNCTION_TO_BUCKET[value]) return FUNCTION_TO_BUCKET[value]!;
    if (value.includes("ramp") || value.includes("mana")) return "MANA_SUPPORT";
    if (value.includes("draw")) return "CARD_ADVANTAGE";
    if (value.includes("sacrifice")) return "RESOURCE_CONSUMERS";
    if (value.includes("token")) return "ENGINE_PIECES";
    if (value.includes("recursion") || value.includes("graveyard")) return "RECURSION";
    if (value.includes("payoff") || value.includes("damage")) return "PAYOFFS";
    const role = resolveRole(value);
    if (!role) return "NON_BUCKET_CONTEXT";
    return FUNCTION_TO_BUCKET[role] ?? "STRUCTURAL_SUPPORT";
  }
  return "NON_BUCKET_CONTEXT";
}

function acceptanceRequirementId(linkedSpecField: string): string {
  return linkedSpecField.replace(/:/g, "_");
}

function frozenScalarSet(spec: RetrievalSpecification): Set<string> {
  const out = new Set<string>();
  for (const fn of spec.requiredFunctions) out.add(`requiredFunctions:${fn}`);
  for (const input of spec.requiredInputs) out.add(`requiredInputs:${input}`);
  return out;
}

export function classifyProductProvenance(input: {
  caseId: string;
  linkedSpecField: string;
  frozenSpec: RetrievalSpecification;
  effectiveSpec: RetrievalSpecification;
  upstreamGapApplied: boolean;
  contaminationCorrectionApplied: boolean;
}): ProductRequirementProvenance {
  if (!frozenScalarSet(input.frozenSpec).has(input.linkedSpecField)) {
    if (input.upstreamGapApplied) return "UPSTREAM_SPEC_GAP_DERIVED_REQUIREMENT";
    if (input.contaminationCorrectionApplied) return "CONTAMINATION_CORRECTION_DERIVED_REQUIREMENT";
    return "DERIVED_EFFECTIVE_SPEC_REQUIREMENT";
  }
  return "ACTIVE_EFFECTIVE_SPEC_REQUIREMENT";
}

export function buildProductAcceptanceRequirements(input: {
  caseId: string;
  frozenSpec: RetrievalSpecification;
  effectiveSpec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  v11Report: SemanticCandidateRetrievalReportV11;
  upstreamGapApplied: boolean;
  contaminationCorrectionApplied: boolean;
}): RetrievalPlanReconciliation {
  const executedBuckets = Object.keys(input.v11Report.poolStats.candidatesPerBucket ?? {}) as RetrievalBucketId[];
  const executedBucketSet = new Set(executedBuckets);
  const tokenByField = new Map(
    extractRequirementTokensFromSpec(input.effectiveSpec).map((t) => [t.linkedSpecField, t]),
  );

  const acceptanceEvaluated: ProductAcceptanceRequirement[] = [];
  const nonBucketContext: RetrievalPlanReconciliation["nonBucketContextFields"] = [];
  const drivingFields: string[] = [];

  const pushScalar = (field: "requiredFunctions" | "requiredInputs", value: string) => {
    const linkedSpecField = `${field}:${value}`;
    drivingFields.push(linkedSpecField);
    const bucketId = bucketForSpecToken(field, value);
    const token = tokenByField.get(linkedSpecField);
    const requirementId = acceptanceRequirementId(linkedSpecField);
    const executedBucket = bucketId !== "NON_BUCKET_CONTEXT" && executedBucketSet.has(bucketId as RetrievalBucketId);

    if (bucketId === "NON_BUCKET_CONTEXT") {
      nonBucketContext.push({
        linkedSpecField,
        sourceSpecField: field,
        sourceSpecValue: value,
        reason: "Influences functional-match ranking but does not resolve to a catalog role bucket query.",
      });
    }

    acceptanceEvaluated.push({
      caseId: input.caseId,
      requirementId,
      description: `Product acceptance: ${linkedSpecField} under effective Phase-6 retrieval plan.`,
      linkedSpecFields: [linkedSpecField],
      linkedSpecField,
      sourceSpecField: field,
      sourceSpecValue: value,
      bucketId,
      executedBucket,
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

  for (const fn of input.effectiveSpec.requiredFunctions) pushScalar("requiredFunctions", fn);
  for (const inputNeed of input.effectiveSpec.requiredInputs) pushScalar("requiredInputs", inputNeed);

  const expectedFieldSet = new Set(drivingFields);
  const evaluatedFieldSet = new Set(acceptanceEvaluated.map((r) => r.linkedSpecField));
  const omittedFromAcceptance = [...expectedFieldSet].filter((f) => !evaluatedFieldSet.has(f));

  const allSpecTokens = extractRequirementTokensFromSpec(input.effectiveSpec).map((t) => t.linkedSpecField);
  for (const field of allSpecTokens) {
    if (field.startsWith("requiredFunctions:") || field.startsWith("requiredInputs:")) continue;
    if (!drivingFields.includes(field)) {
      const [sourceSpecField, sourceSpecValue] = field.split(":") as [keyof RetrievalSpecification, string];
      nonBucketContext.push({
        linkedSpecField: field,
        sourceSpecField,
        sourceSpecValue,
        reason: "Spec token outside requiredFunctions/requiredInputs acceptance enumeration — tracked as non-bucket context.",
      });
    }
  }

  return {
    effectiveRetrievalDrivingFields: drivingFields,
    executedRetrievalBuckets: executedBuckets,
    acceptanceEvaluatedRequirements: acceptanceEvaluated,
    nonBucketContextFields: nonBucketContext,
    reconciliationPass: omittedFromAcceptance.length === 0,
    omittedFromAcceptance,
  };
}

export function rankCandidatesForAcceptanceRequirement(
  report: SemanticCandidateRetrievalReportV11,
  requirement: ProductAcceptanceRequirement,
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
