/**
 * BuildPath semantic types v3 — FACT vs STRATEGY separation.
 * CommanderMechanismFacts are oracle-grounded only.
 * Strategy hypotheses are explicitly derived and pending independent adjudication.
 */
import type { RetrievalBucketId } from "./semantic-candidate-retrieval-v1";
import type { CausalRole } from "./build-path-types-v1";
import type { CommandZoneConfiguration } from "./command-zone-composition-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";

export const BUILD_PATH_SEMANTIC_TYPES_V3_VERSION = "build-path-semantic-types-v3";

export type EvidenceType =
  | "COMMANDER_ORACLE"
  | "DERIVED_CAUSAL_INFERENCE"
  | "STRATEGY_HYPOTHESIS";

export type SemanticEvidence = {
  type: EvidenceType;
  sourceOracleId?: string;
  sourceCommander?: string;
  oracleSpan?: string;
  rationale?: string;
};

export type MechanismFact = {
  factId: string;
  sourceOracleId: string;
  commanderName: string;
  trigger: string | null;
  action: string | null;
  subject: string | null;
  condition: string | null;
  object: string | null;
  zoneFrom: string | null;
  zoneTo: string | null;
  resourceConsumed: string | null;
  output: string | null;
  evidenceSpan: string;
  evidence: SemanticEvidence;
};

export type CommanderMemberFacts = {
  sourceOracleId: string;
  commanderName: string;
  oracleText: string;
  colorIdentity: string[];
  mechanisms: MechanismFact[];
};

export type CrossMemberRelationship = {
  relationshipId: string;
  memberAOracleId: string;
  memberBOracleId: string;
  relationshipType: "PARTNER" | "BACKGROUND_GRANT" | "EMBLEM_GRANT" | "OTHER";
  description: string;
  evidence: SemanticEvidence;
};

export type CommanderMechanismFactsEntry = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: CommandZoneConfiguration;
  combinedColorIdentity: string[];
  bracket: CommanderBracket;
  commanderOracleTexts: Array<{ sourceOracleId: string; name: string; oracleText: string }>;
  memberFacts: CommanderMemberFacts[];
  crossMemberRelationships: CrossMemberRelationship[];
  adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION";
};

export type StrategyHypothesisKind =
  | "DEPENDENT_INPUT"
  | "DEPENDENT_OUTPUT_EXPLOIT"
  | "INDEPENDENT_ENGINE"
  | "HARMONY_BRIDGE"
  | "PATH_NARRATIVE";

export type SemanticSlotRef = {
  targetMechanic: string;
  linkedSpecField: string;
  retrievalToken: string;
  retrievalBucket: RetrievalBucketId;
  causalRole: CausalRole;
  matchConstraints: string[];
  evidence: SemanticEvidence;
};

export type IndependentEngineHypothesis = {
  hypothesisId: string;
  enabler: SemanticSlotRef;
  causalRelation: string;
  payoff: SemanticSlotRef;
  worksWithoutCommander: boolean;
  colorIdentityLegal: boolean | null;
  causalDefense: string;
  hypothesisProvenance: EvidenceType;
  adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION";
};

export type BridgeHypothesis = {
  hypothesisId: string;
  label: string;
  candidateMechanic: SemanticSlotRef;
  commanderSideJob: {
    description: string;
    commanderMechanismFactIds: string[];
    causalProof: string;
    evidence: SemanticEvidence;
  };
  independentSideJob: {
    description: string;
    independentEngineHypothesisId: string | null;
    causalProof: string;
    evidence: SemanticEvidence;
  };
  adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION";
};

export type StrategyHypothesisEntry = {
  caseId: string;
  commanders: string[];
  dependentInputs: SemanticSlotRef[];
  dependentOutputExploits: SemanticSlotRef[];
  independentEngines: IndependentEngineHypothesis[];
  bridgeHypotheses: BridgeHypothesis[];
  failureWithoutCommander: string | null;
  functionWithoutCommander: string | null;
  adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION";
};

export type SemanticCatalogFailureCategory =
  | "FACTUAL_ORACLE_FAILURE"
  | "UNSUPPORTED_STRATEGY_HYPOTHESIS"
  | "NON_CAUSAL_INDEPENDENT_ENGINE"
  | "ILLEGAL_OR_COLOR_INVALID_HYPOTHESIS"
  | "BRIDGE_MISSING_CAUSAL_SIDE"
  | "MULTI_MEMBER_FLATTENING_ERROR"
  | "SEMANTIC_SLOT_RETRIEVAL_TOKEN_MISMATCH"
  | "STRATEGY_PRESENTED_AS_ORACLE_EVIDENCE"
  | "HARMONY_ZERO_MEANINGFUL_OVERLAP";

export type SemanticCatalogFailure = {
  category: SemanticCatalogFailureCategory;
  caseId: string;
  subjectId: string;
  message: string;
  detail?: Record<string, unknown>;
};
