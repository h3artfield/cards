/**
 * Professor planning contracts v2 — shared Deck Intelligence + package-portfolio model.
 * Professor PLAN model call remains WAIT.
 */
import type { MtgKnowledgeEvidence, MtgKnowledgeRetrievalMode } from "../deck-intelligence/mtg-knowledge-service";
import type { ResearchEvidence } from "../deck-intelligence/research-service";
import type { SemanticOpportunity } from "./semantic-opportunity-types-v1";
import type { IndependentMechanismFact } from "./independent-truth-types-v1";
import type { CanonicalOracleEntry } from "../deck-intelligence/canonical-knowledge-service";
import type { PlanningEvidence } from "./professor-planning-evidence-v1";

export const PROFESSOR_PLANNING_CONTRACTS_V2_VERSION = "professor-planning-contracts-v2.1";

export type ProvenanceTier =
  | "CANONICAL_FACT"
  | "CURATED_KNOWLEDGE"
  | "CURRENT_EXTERNAL_RESEARCH"
  | "MODEL_INFERENCE";

export type DependencyLevel = "HIGH" | "MEDIUM" | "LOW";

export type SemanticRequirementSlot = {
  slotId: string;
  requirement: string;
  alternatives?: string[];
  satisfiesOpportunityIds?: string[];
};

export type SemanticPackage = {
  packageId: string;
  title: string;
  purpose: string;
  causalChain: string[];
  semanticRequirements: SemanticRequirementSlot[];
  requiredResources: string[];
  producedResources: string[];
  payoffs: string[];
  commanderContribution: string;
  commanderIndependentFunction: string;
  commanderDependency: DependencyLevel;
  worksWithoutCommander: DependencyLevel;
  dependsOnPackageIds: string[];
  overlapsWithPackageIds: string[];
  vulnerabilities: string[];
  evidence: PlanningEvidence[];
  /** No card names at planning phase */
  cardNames?: never;
};

export type StrategyHypothesis = {
  hypothesisId: string;
  title: string;
  thesis: string;
  commanderMechanismFactIds: string[];
  semanticOpportunityIds: string[];
  packages: SemanticPackage[];
  strengths: string[];
  vulnerabilities: string[];
  evidence: PlanningEvidence[];
};

export type ProfessorPlanningContext = {
  caseId: string;
  commandZone: {
    configuration: string;
    commanders: string[];
    combinedColorIdentity: string[];
    bracket: number;
  };
  canonicalOracle: CanonicalOracleEntry[];
  commanderMechanismFacts: IndependentMechanismFact[];
  semanticOpportunities: SemanticOpportunity[];
  /** Frozen facts explicitly marked NO_ACTIONABLE_OPPORTUNITY — may be context, not positive package basis */
  noActionableFactIds?: string[];
  colorIdentity: string[];
  bracket: number;
  userConstraints: string[];
  /** Baseline curated evidence — not the only knowledge access */
  initialRagEvidence: MtgKnowledgeEvidence[];
  initialResearchEvidence: ResearchEvidence[];
  inventoryContext?: { storeSlug: string; inStockOnly: boolean };
};

export type ProfessorPlanToolName =
  | "searchMtgKnowledge"
  | "inspectCommanderFacts"
  | "inspectSemanticOpportunities"
  | "getCard"
  | "explainCardSemantics";

export type ProfessorPlanToolBudget = {
  maxToolCalls: number;
  maxRetrievedEvidenceChunks: number;
  allowedTools: ProfessorPlanToolName[];
  allowedKnowledgeModes: MtgKnowledgeRetrievalMode[];
};

export const DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET: ProfessorPlanToolBudget = {
  maxToolCalls: 8,
  maxRetrievedEvidenceChunks: 24,
  allowedTools: [
    "searchMtgKnowledge",
    "inspectCommanderFacts",
    "inspectSemanticOpportunities",
    "getCard",
    "explainCardSemantics",
  ],
  allowedKnowledgeModes: [
    "RULES",
    "TERMINOLOGY",
    "STRATEGY",
    "COMMANDER_PRIMER",
    "PACKAGE",
    "INTERACTION",
  ],
};

export type ProfessorPlanOutput = {
  caseId: string;
  hypotheses: StrategyHypothesis[];
  /** Validated package universe before three-lens selection */
  validatedPackages: SemanticPackage[];
};

export type ThreeLensObjective = "DEPENDENT_SYNERGY" | "INDEPENDENT_SYNERGY" | "HARMONY";

/** Three paths are package portfolios, not disjoint full deck plans */
export type PackagePortfolioPlan = {
  lens: ThreeLensObjective;
  selectedPackageIds: string[];
  objectiveWeights: Record<string, number>;
  rationale: string;
};

export type ThreeLensPortfolioSelection = {
  caseId: string;
  availablePackageIds: string[];
  dependent: PackagePortfolioPlan;
  independent: PackagePortfolioPlan;
  harmony: PackagePortfolioPlan;
  sharedPackageIds: string[];
  convergenceMode: "DIFFERENTIATED" | "TRUE_CONVERGENCE";
  convergenceJustification?: string;
};

export type ValidationCheckCategory =
  | "PRE_VALIDATION_GATE"
  | "MECHANICAL_VALIDITY"
  | "CAUSAL_COHERENCE"
  | "COLOR_IDENTITY"
  | "COMMANDER_LEGALITY"
  | "BRACKET_COMPATIBILITY"
  | "COMMANDER_DEPENDENCY_CLAIM"
  | "COMMANDER_INDEPENDENCE_CLAIM"
  | "PACKAGE_COMPLETENESS"
  | "BRIDGE_VALIDITY"
  | "EVIDENCE_SUFFICIENCY"
  | "EVIDENCE_RESOLUTION"
  | "NO_ACTIONABLE_BOUNDARY"
  | "PACKAGE_DEPENDENCY_REFERENCE";

export type ValidationSeverity = "ERROR" | "WARNING";

export type StructuredValidationIssue = {
  issueId: string;
  category: ValidationCheckCategory;
  severity: ValidationSeverity;
  packageId?: string;
  hypothesisId?: string;
  message: string;
  missing?: string[];
  suggestedRepair?: string;
  fixable: boolean;
};

export type ProposalValidationOutcome =
  | "VALIDATED"
  | "VALID_WITH_CONSTRAINT"
  | "PARTIALLY_SUPPORTED"
  | "REJECTED_MECHANICALLY"
  | "REJECTED_LEGALITY"
  | "NEEDS_MORE_EVIDENCE"
  | "NORMALIZATION_FAILURE";

export type StrategyPackageValidationResult = {
  hypothesisId: string;
  outcome: ProposalValidationOutcome;
  issues: StructuredValidationIssue[];
  passedChecks: ValidationCheckCategory[];
  failedChecks: ValidationCheckCategory[];
};

export type ProfessorRepairLoopContract = {
  maxRepairIterations: number;
  hardRule: "Professor may never self-certify";
  flow: [
    "Professor proposal",
    "deterministic validator",
    "structured validation feedback",
    "Professor repair",
    "revalidate",
  ];
};

export const PROFESSOR_REPAIR_LOOP_V1: ProfessorRepairLoopContract = {
  maxRepairIterations: 3,
  hardRule: "Professor may never self-certify",
  flow: [
    "Professor proposal",
    "deterministic validator",
    "structured validation feedback",
    "Professor repair",
    "revalidate",
  ],
};

export const BUILD_PATH_V3_DISPOSITION = {
  role: "GOLD_DEV_STRATEGY_REFERENCE",
  compareAgainst: "Future Professor planner output on same 28 cases",
  notProductionCatalog: true,
  gateB: "WAIT",
  retrievalTokenCreation: "WAIT",
} as const;

export const PROFESSOR_TASK_CONTRACTS_V2 = {
  PLAN: { status: "DESIGN" as const, description: "Generate hypotheses + packages via bounded tool loop" },
  CRITIQUE: { status: "WAIT" as const, description: "Evaluate assembled deck" },
  EXPLAIN: { status: "WAIT" as const, description: "Explain graph relationships" },
  PROPOSE_SWAP: { status: "WAIT" as const, description: "Suggest validated swaps" },
};
