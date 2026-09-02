/**
 * PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1 — shared types.
 */
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { CanonicalCardTruthV4164 } from "./professor-canonical-card-truth-v4-16-4-v1";

export const PROFESSOR_SOL_DIRECTED_TYPES_V1_VERSION = "professor-sol-directed-types-v1";

export type SolDirectedBudgetObligationV1 = "REQUIRED_MINIMUM" | "PREFERRED_TARGET" | "OPTIONAL";

export type SolDirectedFunctionalBudgetV1 = {
  category: string;
  minimum: number;
  preferred?: number;
  maximum?: number;
  obligation: SolDirectedBudgetObligationV1;
};

export type SolDirectedCardRequirementV1 = {
  requirementId: string;
  label: string;
  description: string;
  minimumCount?: number;
  preferredCount?: number;
  requiredCharacteristics: string[];
  mechanics?: string[];
  avoid?: string[];
};

export type DeckConstructionPlanV1 = {
  deckThesis: string;
  primaryPlan: string;
  secondaryPlan: string;
  earlyGamePlan: string;
  midgamePlan: string;
  closingPlan: string;
  explicitWinLines: string[];
  failureRecoveryPlan: string;
  manaCurveTarget: string;
  desiredLandRange: { min: number; preferred: number; max: number };
  functionalBudgets: SolDirectedFunctionalBudgetV1[];
  strategicPackages: Array<{
    packageId: string;
    name: string;
    purpose: string;
    minimumCards?: number;
    preferredCards?: number;
  }>;
  cardRequirements: SolDirectedCardRequirementV1[];
  tutorAccessTargets: string[];
  protectionRequirements: string[];
  interactionRequirements: string[];
  redundancyRequirements: string[];
  cardsToAvoid: string[];
  bracketPowerExpectations: string;
};

export type SolDirectedCandidatePoolV1 = {
  requirementId: string;
  label: string;
  recallQuality: "GOOD" | "THIN" | "POOR";
  candidates: Array<{
    oracleId: string;
    name: string;
    truth: CanonicalCardTruthV4164;
  }>;
};

export type SolDirectedSelectedNonlandV1 = {
  oracleId: string;
  name: string;
  primaryRole: string;
  secondaryRoles: string[];
  packageMembership: string[];
  whyInThisDeck: string;
  structuralNecessity: "REQUIRED" | "FLEX";
};

export type SolDirectedConstructedDeckV1 = {
  commander: CommanderBlueprintV417;
  landCount: number;
  lands: string[];
  nonlands: SolDirectedSelectedNonlandV1[];
  primaryWinPaths: string[];
  secondaryWinPaths: string[];
  expectedPlayPattern: string;
  structuralNecessities: string[];
  replaceableFlex: string[];
};

export type SolDirectedValidationV1 = {
  pass: boolean;
  libraryCount: number;
  landCount: number;
  nonlandCount: number;
  violations: string[];
  auditCounts: {
    ramp: number;
    draw: number;
    interaction: number;
    protection: number;
    tutorsAccess: number;
    averageMv: number;
  };
};

export type SolDirectedModelCallRecordV1 = {
  purpose: "ARCHITECT" | "CONSTRUCTOR" | "REPAIR" | "CRITIC" | "HEAD_PROFESSOR";
  systemPrompt: string;
  userPrompt: string;
  rawResponse: unknown;
  model: string;
  callId: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
};

export type SolDirectedRepairActionV1 = {
  action: "REMOVE" | "ADD";
  card: string;
  why: string;
  expectedEffect: string;
};

export type SolDirectedHeadProfessorVerdictV1 = {
  executesPlan: boolean;
  bracketAppropriate: boolean;
  offPlanCards: string[];
  manaCorrect: boolean;
  winConditionsCredible: boolean;
  tutorTargetsCoherent: boolean;
  deadPackages: string[];
  redundancySufficient: boolean;
  highestValueSwaps: Array<{ cut: string; add: string; reason: string }>;
  verdict: "CONSTRUCTION_SUCCESS" | "OPTIONAL_REFINEMENT" | "CONSTRUCTION_DEFECT";
  narrative: string;
};

export type SolDirectedExperimentReportV1 = {
  version: typeof PROFESSOR_SOL_DIRECTED_TYPES_V1_VERSION;
  decision: "PROFESSOR_SOL_DIRECTED_DECK_CONSTRUCTION_V1_AUTHORIZED";
  caseId: string;
  commander: string;
  bracket: number;
  playstyle: string;
  p0TruthPass: boolean;
  modelCallBudget: { max: 3; used: number };
  plan: DeckConstructionPlanV1 | null;
  candidatePools: SolDirectedCandidatePoolV1[];
  constructedDeck: SolDirectedConstructedDeckV1 | null;
  validation: SolDirectedValidationV1 | null;
  repair: { actions: SolDirectedRepairActionV1[]; validationAfter: SolDirectedValidationV1 | null } | null;
  headProfessor: SolDirectedHeadProfessorVerdictV1 | null;
  modelCalls: SolDirectedModelCallRecordV1[];
  failure: string | null;
  summary: string;
};
