/**
 * Phase 6A.1 — CandidateIntent normalization types (deck-side causal bridge).
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";

export const CANDIDATE_INTENT_TYPES_V1_VERSION = "phase6a1-candidate-intent-types-v1";

export type CausalRole =
  | "ENGINE_ENABLER"
  | "RESOURCE_PROVIDER"
  | "TRIGGER_PROVIDER"
  | "PAYOFF_FOR_COMMANDER_OUTPUT"
  | "REDUNDANCY"
  | "PROTECTION"
  | "CONVERSION_PIECE";

export type IntentPriority = "CORE" | "SECONDARY";

export type CandidateIntent = {
  intentId: string;
  caseId: string;
  causalRole: CausalRole;
  priority: IntentPriority;
  targetMechanic: string;
  commanderMechanismSupported: string;
  oracleEvidence: string;
  causalDefense: string;
  sourceSemanticFields: string[];
  matchConstraints: string[];
  retrievalBucket: RetrievalBucketId;
  linkedSpecField: string;
  retrievalToken: string;
};

export type NoCoreCandidateIntentDeclaration = {
  caseId: string;
  declaration: "NO_CORE_CANDIDATE_INTENT";
  causalJustification: string;
};

export type CaseCandidateIntentProfile = {
  caseId: string;
  commanderMechanismSummary: string;
  coreIntents: CandidateIntent[];
  secondaryIntents: CandidateIntent[];
  noCoreDeclaration?: NoCoreCandidateIntentDeclaration;
};

export function parseLinkedSpecField(linkedSpecField: string): {
  sourceSpecField: keyof RetrievalSpecification;
  sourceSpecValue: string;
} {
  const [field, ...rest] = linkedSpecField.split(":");
  return {
    sourceSpecField: field as keyof RetrievalSpecification,
    sourceSpecValue: rest.join(":"),
  };
}

export function candidateIntentRequirementId(intent: CandidateIntent): string {
  return `candidateIntent_${intent.intentId}`;
}
