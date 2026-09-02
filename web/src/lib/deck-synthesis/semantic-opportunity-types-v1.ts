/**
 * SemanticOpportunityModel types v1 — mechanical leverage above commander facts.
 * No named archetypes; no deck strategies at this layer.
 */
import type { SemanticEvidence } from "./build-path-semantic-types-v3";

export const SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION = "semantic-opportunity-types-v1.1";

export type OpportunityDerivationClass =
  | "DIRECT_MECHANICAL"
  | "NECESSARY_PREREQUISITE"
  | "DERIVED_AMPLIFICATION"
  | "OPTIONAL_EXPLOIT";

export type OpportunityConfidenceClass = "HIGH" | "MEDIUM" | "LOW";

export type SemanticOpportunityRecordKind =
  | "OPPORTUNITY"
  | "RISK_CONSTRAINT"
  | "STATE_MAINTENANCE_CONSTRAINT";

export type SemanticOpportunityType =
  | "INPUT_AMPLIFICATION"
  | "ACTIVATION_REPETITION"
  | "TRIGGER_FREQUENCY"
  | "OUTPUT_EXPLOITATION"
  | "RESOURCE_CONVERSION"
  | "REDUNDANCY"
  | "PROTECTION"
  | "STATE_MANIPULATION"
  | "ZONE_ENABLEMENT"
  | "STRUCTURAL_SUPPORT";

export type SemanticOpportunity = {
  opportunityId: string;
  /** @deprecated use sourceFactIds — kept for backward compatibility */
  sourceMechanismFactIds: string[];
  sourceFactIds: string[];
  opportunityType: SemanticOpportunityType;
  derivationClass: OpportunityDerivationClass;
  opportunityConfidence: OpportunityConfidenceClass;
  causalStatement: string;
  requiredStateOrAction: string;
  expectedMechanicalEffect: string;
  causalProof: string[];
  prerequisites: string[];
  mutuallyRelevantWith: string[];
  evidence: SemanticEvidence;
  commanderMember?: string;
  /** Exact actor/object/zone/timing scopes preserved from frozen facts */
  exactScopes?: Record<string, string | string[]>;
  /** v3: semantic edge label from fact graph */
  semanticEdge?: string;
  /** v3.2.2: distinguish constraints from positive opportunities at planner consumption */
  recordKind?: SemanticOpportunityRecordKind;
};

export type CommandZoneOpportunityModel = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  mechanismFactCount: number;
  opportunities: SemanticOpportunity[];
  opportunityCountByType: Record<SemanticOpportunityType, number>;
  derivationSource: "phase6a1-commander-mechanism-facts-v4-implemented";
  adjudicationStatus: "DERIVED_FROM_FROZEN_FACTS";
};

export type SemanticOpportunityModelCatalog = {
  version: string;
  generatedAt: string;
  population: { cases: number; totalOpportunities: number };
  note: string;
  cases: CommandZoneOpportunityModel[];
};
