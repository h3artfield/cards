/**
 * Professor planning contracts v3 — strategic synthesis with grounding evidence, not opportunity whitelist.
 */
import type { MtgKnowledgeEvidence, MtgKnowledgeRetrievalMode } from "../deck-intelligence/mtg-knowledge-service";
import type { PreservedResearchEvidenceV3 } from "./professor-planning-evidence-resolver-v3";
import type { CanonicalOracleEntry } from "../deck-intelligence/canonical-knowledge-service";
import type { IndependentMechanismFact } from "./independent-truth-types-v1";
import type { SemanticOpportunity } from "./semantic-opportunity-types-v1";
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { CausalEdgeV3, StrategicAssertionV3 } from "./strategic-assertion-vocabulary-v3";
import type { ProfessorEvidenceLedgerEntryV3 } from "./professor-v3-evidence-ledger-v1";

export const PROFESSOR_PLANNING_CONTRACTS_V3_VERSION = "professor-planning-contracts-v3";

export type DependencyLevel = "HIGH" | "MEDIUM" | "LOW";

export type ProfessorInitialRetrievalAttemptV3 = {
  tool: string;
  query: string;
  retrievalMode: string;
  resultCount: number;
  status: "SUCCESS" | "EMPTY" | "DISABLED" | "ERROR";
  error?: string;
  sourceEnvironmentIdentity: string;
  returnedEvidenceIds: string[];
};

export type ProfessorLensV3 = "AUTO" | "DEPENDENT_SYNERGY" | "INDEPENDENT_SYNERGY" | "HARMONY";

export type SemanticRelationshipV3 = {
  relationshipId: string;
  producerFactIds: string[];
  consumerFactIds: string[];
  relationshipType: string;
  causalStatement: string;
};

/** Optional high-confidence mechanical hints — not a strategy whitelist. */
export type KnownMechanicalAffordanceV3 = SemanticOpportunity;

export type StrategyPackageV3 = {
  packageId: string;
  purpose: string;
  functionalRoles: string[];
  inputs: string[];
  resourcesRequired: string[];
  outputs: string[];
  resourcesProduced: string[];
  commanderDependency: DependencyLevel;
  worksWithoutCommander: DependencyLevel;
  evidenceRefs: EvidenceRef[];
  dependsOnPackageIds?: string[];
};

export type PackageRelationshipV3 = {
  relationshipId: string;
  producer: string;
  consumer: string;
  relationshipType: string;
  causalReasoning: string;
  evidenceRefs: EvidenceRef[];
};

export type StrategyHypothesisV3 = {
  hypothesisId: string;
  title: string;
  strategicClaim: string;
  causalReasoning: string;
  evidenceRefs: EvidenceRef[];
  /** Machine-groundable strategic claims — primary validator input. */
  strategicAssertions: StrategicAssertionV3[];
  /** Typed causal bridges between validated assertions. */
  causalEdges: CausalEdgeV3[];
  commanderDependency: DependencyLevel;
  lens: ProfessorLensV3;
  packages: StrategyPackageV3[];
  relationships: PackageRelationshipV3[];
  strengths?: string[];
  vulnerabilities?: string[];
};

export type ProfessorPlanOutputV3 = {
  strategyHypotheses: StrategyHypothesisV3[];
};

export type ProfessorPlanningContextV3 = {
  caseId: string;
  commandZone: {
    configuration: string;
    commanders: string[];
    combinedColorIdentity: string[];
    bracket: number;
  };
  canonicalOracle: CanonicalOracleEntry[];
  commanderMechanismFacts: IndependentMechanismFact[];
  semanticRelationships: SemanticRelationshipV3[];
  /** Optional structured affordances — empty list must not block reasoning. */
  knownMechanicalAffordances: KnownMechanicalAffordanceV3[];
  noActionableFactIds: string[];
  colorIdentity: string[];
  bracket: number;
  userConstraints: string[];
  initialRagEvidence: MtgKnowledgeEvidence[];
  initialResearchEvidence: PreservedResearchEvidenceV3[];
  /** Extra pinned ledger entries for rules/research fixtures and tool-loop captures. */
  evidenceLedgerSupplement?: ProfessorEvidenceLedgerEntryV3[];
  /** Initial retrieval attempts from context builder — preserved even when resultCount=0. */
  initialRetrievalAttempts?: ProfessorInitialRetrievalAttemptV3[];
  rulesConstraints?: string[];
};

export type ProfessorPlanToolNameV3 =
  | "searchMtgKnowledge"
  | "inspectCommanderFacts"
  | "inspectMechanicalAffordances"
  | "inspectSemanticRelationships"
  | "getCard"
  | "explainCardSemantics";

export type ProfessorPlanToolBudgetV3 = {
  maxToolCalls: number;
  maxRetrievedEvidenceChunks: number;
  allowedTools: ProfessorPlanToolNameV3[];
  allowedKnowledgeModes: MtgKnowledgeRetrievalMode[];
};

export const DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3: ProfessorPlanToolBudgetV3 = {
  maxToolCalls: 8,
  maxRetrievedEvidenceChunks: 24,
  allowedTools: [
    "searchMtgKnowledge",
    "inspectCommanderFacts",
    "inspectMechanicalAffordances",
    "inspectSemanticRelationships",
    "getCard",
    "explainCardSemantics",
  ],
  allowedKnowledgeModes: ["COMMANDER_PRIMER", "PACKAGE", "RULES", "CARD_ORACLE"],
};

export type GroundingValidationOutcomeV3 =
  | "GROUNDED"
  | "GROUNDED_WITH_CONSTRAINT"
  | "PARTIALLY_GROUNDED"
  | "REJECTED_INVENTED_MECHANIC"
  | "REJECTED_BROADENED_PERMISSION"
  | "REJECTED_EVIDENCE_CONTRADICTION"
  | "REJECTED_UNGROUNDED"
  | "HARMONY_UNDERDETERMINED"
  | "REJECTED_DEPENDENCY_MISCLASSIFICATION";

export type GroundingValidationIssueV3 = {
  issueId: string;
  code: string;
  severity: "ERROR" | "WARNING";
  hypothesisId?: string;
  packageId?: string;
  relationshipId?: string;
  message: string;
  fixable: boolean;
  suggestedRepair?: string;
};

export type GroundingValidationResultV3 = {
  hypothesisId: string;
  outcome: GroundingValidationOutcomeV3;
  issues: GroundingValidationIssueV3[];
  passedChecks: string[];
  failedChecks: string[];
};

export const PROFESSOR_V3_LENS_DEFINITIONS = {
  AUTO: {
    label: "Professor's Choice",
    definition: "Professor's synthesized strategic view spanning commander-centric and independent packages without forcing a single lens classification.",
  },
  DEPENDENT_SYNERGY: {
    label: "Commander Focused",
    definition:
      "Packages whose primary payoff chain requires commander mechanism facts, permissions, or commander-specific resource loops.",
  },
  INDEPENDENT_SYNERGY: {
    label: "Independent Engines",
    definition:
      "Packages that produce/consume resources through non-commander-specific loops; must truthfully declare worksWithoutCommander.",
  },
  HARMONY: {
    label: "Harmony",
    definition:
      "Cross-package relationships where one package's output/resource/function materially enables another; requires explicit causal bridge evidence.",
  },
} as const;

/** Required lens coverage for a complete Commander Professor result. */
export const PROFESSOR_V3_REQUIRED_LENS_COVERAGE_V3: ProfessorLensV3[] = [
  "AUTO",
  "DEPENDENT_SYNERGY",
  "INDEPENDENT_SYNERGY",
  "HARMONY",
];
