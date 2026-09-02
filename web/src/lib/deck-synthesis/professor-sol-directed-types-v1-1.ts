/**
 * PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_1 — shared types.
 */
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type {
  SolDirectedExperimentReportV1,
  SolDirectedHeadProfessorVerdictV1,
  SolDirectedModelCallRecordV1,
  SolDirectedRepairActionV1,
  SolDirectedValidationV1,
} from "./professor-sol-directed-types-v1";

export const PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION = "professor-sol-directed-types-v1-1";

/** Immutable complete Sol Architect response — no field stripping. */
export type ArchitectRawPlanV11 = Record<string, unknown>;

export type PreferredExampleResolutionV11 = {
  exampleName: string;
  requirementId: string;
  oracleId: string | null;
  canonicalName: string | null;
  resolved: boolean;
  commanderLegal: boolean;
  colorLegal: boolean;
  excludedByGuardrail: boolean;
  exclusionReason: string | null;
};

export type RetrievalContractRequirementV11 = {
  requirementId: string;
  requestedCount: number;
  primaryRole: string;
  naturalLanguageRequirements: string[];
  preferredExamples: string[];
};

export type RetrievalContractV11 = {
  version: typeof PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION;
  strategicThesis: string;
  earlyGamePlan: string[];
  midGamePlan: string[];
  lateGamePlan: string[];
  winLines: unknown[];
  failureRecoveryPlan: string[];
  nonlandSlotsRequired: number;
  landSlotsRequired: number;
  cardRequirements: RetrievalContractRequirementV11[];
  landPlan: Record<string, unknown>;
  comboAndPowerGuardrails: Record<string, unknown>;
  retrievalRules: string[];
  tutorPolicy: Record<string, unknown> | null;
  manaValueTargets: Record<string, unknown> | null;
  preservedTopLevelFields: string[];
};

export type IngestedArchitectPlanV11 = {
  architectRawPlan: ArchitectRawPlanV11;
  retrievalContract: RetrievalContractV11;
};

export type { SemanticOracleFactsV111 } from "./professor-semantic-oracle-facts-v1-1-1";

export type CanonicalCardFactsV11 = {
  oracleId: string;
  name: string;
  manaValue: number | null;
  typeLine: string;
  colorIdentity: string[];
  oracleText: string;
  /** Regex/heuristic tags — supplementary only; prefer semanticOracle when present. */
  semanticFunctions: string[];
  /** RC8 Semantic Oracle from semantic map — authoritative functional evidence. */
  semanticOracle: SemanticOracleFactsV111 | null;
  commanderLegal: boolean;
  isLand: boolean;
};

export type RequirementPoolV11 = {
  requirementId: string;
  primaryRole: string;
  requestedCount: number;
  targetPoolSize: number;
  oracleIds: string[];
  seedOracleIds: string[];
  semanticOracleIds: string[];
};

export type LandPoolEntryV11 = {
  name: string;
  oracleId: string;
  isBasic: boolean;
  basicKind: "forest" | "swamp" | null;
  maxCopies: number;
  category: "basic" | "dual" | "fetch" | "utility" | "other";
  resolved: boolean;
};

export type LandPoolV11 = {
  targetCount: number;
  basicForestSlots: number;
  basicSwampSlots: number;
  entries: LandPoolEntryV11[];
  nonBasicOracleIds: string[];
};

export type RetrievalResultV11 = {
  version: typeof PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
  landPool: LandPoolV11;
  uniqueNonlandOracleIds: string[];
  uniqueNonlandCount: number;
  exactResolutionHits: PreferredExampleResolutionV11[];
  expansionPasses: number;
  prohibitedOracleIds: string[];
};

export type ConstructorSupplyGateV11 = {
  pass: boolean;
  failure: "CONSTRUCTOR_INPUT_INSUFFICIENT" | null;
  reasons: string[];
  uniqueNonlandCount: number;
  requiredNonlandSlots: number;
  preferredUniqueTarget: number;
  perRequirement: Array<{
    requirementId: string;
    requestedCount: number;
    availableCount: number;
    targetPoolSize: number;
    satisfied: boolean;
  }>;
};

export type ConstructorInputBundleV11 = {
  systemPrompt: string;
  userPrompt: string;
  architectRawPlan: ArchitectRawPlanV11;
  retrievalContract: RetrievalContractV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
  landPool: LandPoolV11;
  supplyGate: ConstructorSupplyGateV11;
};

export type ConstructorInputAcceptanceV11 = {
  pass: boolean;
  failures: string[];
  checks: Record<string, boolean>;
};

export type SolDirectedSelectedNonlandV11 = {
  oracleId: string;
  name: string;
  typeLine?: string;
  primaryArchitectRequirement: string;
  primaryRole: string;
  secondaryRoles: string[];
  packageMembership: string[];
  whyInThisDeck: string;
  structuralNecessity: "REQUIRED" | "FLEX";
};

export type SolDirectedConstructedDeckV11 = {
  commander: CommanderBlueprintV417;
  landCount: number;
  lands: Array<{ name: string; copies: number }>;
  nonlands: SolDirectedSelectedNonlandV11[];
  primaryWinPaths: string[];
  secondaryWinPaths: string[];
  expectedPlayPattern: string;
  structuralNecessities: string[];
  replaceableFlex: string[];
};

export type SolDirectedExperimentReportV11 = Omit<
  SolDirectedExperimentReportV1,
  "version" | "decision" | "plan" | "candidatePools"
> & {
  version: typeof PROFESSOR_SOL_DIRECTED_TYPES_V1_1_VERSION;
  decision: "PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_1_PLAN_PRESERVATION_RETRIEVAL_SUFFICIENCY_AND_SECOND_PROSPECTIVE_CHATTERFANG_V1_AUTHORIZED";
  architectRawPlan: ArchitectRawPlanV11 | null;
  retrievalContract: RetrievalContractV11 | null;
  retrieval: RetrievalResultV11 | null;
  exactResolutionHits: PreferredExampleResolutionV11[];
  supplyGate: ConstructorSupplyGateV11 | null;
  constructorInputAcceptance: ConstructorInputAcceptanceV11 | null;
  constructorPromptBytes: number | null;
  constructedDeck: SolDirectedConstructedDeckV11 | null;
  validation: SolDirectedValidationV1 | null;
  repair: { actions: SolDirectedRepairActionV1[]; validationAfter: SolDirectedValidationV1 | null } | null;
  headProfessor: SolDirectedHeadProfessorVerdictV1 | null;
  architectFixtureUsed: boolean;
};
