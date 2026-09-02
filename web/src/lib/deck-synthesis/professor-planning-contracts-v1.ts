/**
 * Professor planning contracts v1 — DESIGN ONLY.
 * Runtime Professor PLAN implementation remains WAIT until architecture audit complete.
 */
export const PROFESSOR_PLANNING_CONTRACTS_V1_VERSION = "professor-planning-contracts-v1";

export type ProvenanceTier =
  | "CANONICAL_FACT"
  | "CURATED_KNOWLEDGE"
  | "CURRENT_EXTERNAL_RESEARCH"
  | "MODEL_INFERENCE";

export type RagEvidenceRef = {
  chunkId: string;
  corpus: string;
  authorityTier: string;
  citationLabel: string;
  provenanceTier: "CURATED_KNOWLEDGE";
  retrievalMethod: "alias_exact" | "vector";
};

export type ResearchEvidenceRef = {
  sourceUrl?: string;
  sourceTitle: string;
  provenanceTier: "CURRENT_EXTERNAL_RESEARCH";
  retrievedAt: string;
  summary: string;
};

export type ProfessorPlanningContext = {
  commandZone: {
    configuration: string;
    commanders: string[];
    combinedColorIdentity: string[];
    bracket: number;
  };
  canonicalOracle: Array<{ name: string; oracleText: string; sourceOracleId: string }>;
  commanderMechanismFacts: unknown[];
  semanticOpportunities: unknown[];
  colorIdentity: string[];
  bracket: number;
  userConstraints: string[];
  ragEvidence: RagEvidenceRef[];
  researchEvidence: ResearchEvidenceRef[];
  inventoryContext?: {
    storeSlug: string;
    inStockOnly: boolean;
  };
};

export type SemanticPackage = {
  packageId: string;
  purpose: string;
  causalChain: string[];
  requiredFunctions: string[];
  requiredResources: string[];
  producedResources: string[];
  payoffs: string[];
  commanderContribution: string;
  commanderIndependentFunction: string;
  overlapsWithPackageIds: string[];
  evidence: Array<{ tier: ProvenanceTier; statement: string }>;
};

export type StrategyProposal = {
  proposalId: string;
  title: string;
  thesis: string;
  commanderMechanismsUsed: string[];
  semanticOpportunitiesUsed: string[];
  dependencyProfile: {
    commanderDependency: "HIGH" | "MEDIUM" | "LOW";
    commanderRemovalSensitivity: "HIGH" | "MEDIUM" | "LOW";
  };
  packages: SemanticPackage[];
  strengths: string[];
  vulnerabilities: string[];
  evidence: Array<{ tier: ProvenanceTier; statement: string }>;
};

export type ProposalValidationOutcome =
  | "VALIDATED"
  | "VALID_WITH_CONSTRAINT"
  | "PARTIALLY_SUPPORTED"
  | "REJECTED_MECHANICALLY"
  | "REJECTED_LEGALITY"
  | "NEEDS_MORE_EVIDENCE";

export type ProposalValidationResult = {
  proposalId: string;
  outcome: ProposalValidationOutcome;
  checks: Array<{ checkId: string; passed: boolean; message: string }>;
};

export type ThreeLensObjective = "DEPENDENT_SYNERGY" | "INDEPENDENT_SYNERGY" | "HARMONY";

export type ThreeLensSelectionPlan = {
  caseId: string;
  dependent: { selectedProposalIds: string[]; selectedPackageIds: string[]; objective: ThreeLensObjective };
  independent: { selectedProposalIds: string[]; selectedPackageIds: string[]; objective: ThreeLensObjective };
  harmony: { selectedProposalIds: string[]; selectedPackageIds: string[]; objective: ThreeLensObjective };
  unresolvedStatuses: string[];
};

export type ProfessorTaskContract = "PLAN" | "CRITIQUE" | "EXPLAIN" | "PROPOSE_SWAP";

export const PROFESSOR_TASK_CONTRACTS_V1: Record<
  ProfessorTaskContract,
  { status: "DESIGN" | "WAIT"; description: string }
> = {
  PLAN: {
    status: "DESIGN",
    description: "Generate 6–12 StrategyProposal hypotheses with SemanticPackages from ProfessorPlanningContext",
  },
  CRITIQUE: { status: "WAIT", description: "Evaluate assembled deck against plans — not implemented" },
  EXPLAIN: { status: "WAIT", description: "Explain graph/intent relationships — not implemented" },
  PROPOSE_SWAP: { status: "WAIT", description: "Suggest card swaps with validation — not implemented" },
};

export const PROFESSOR_PLANNING_PIPELINE_V1 = [
  "GOLDEN ORACLE / RULES",
  "SEMANTIC FACT ENGINE",
  "SEMANTIC OPPORTUNITY MODEL",
  "PROFESSOR STRATEGY PLANNER + MTG RAG + optional research",
  "STRATEGY / PACKAGE HYPOTHESES",
  "DETERMINISTIC VALIDATION",
  "THREE-LENS SELECTION",
  "PATH CANDIDATE INTENTS",
  "CARD RETRIEVAL",
  "DECK OPTIMIZER",
  "PROFESSOR CRITIC",
  "2D DECK GRAPH",
] as const;

export const BUILD_PATH_V3_DISPOSITION = {
  role: "GOLD_DEV_STRATEGY_REFERENCE",
  compareAgainst: "Future Professor planner output on same 28 cases",
  notProductionCatalog: true,
  gateB: "WAIT",
  retrievalTokenCreation: "WAIT — do not build 55 NO_EXISTING_TOKEN mappings yet",
} as const;
