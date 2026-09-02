/**
 * Sol-directed GUI build job types (v1.1.1).
 */
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "./professor-sol-directed-head-professor-v1-1-1";
import type { SolDirectedDeckEnrichmentV111 } from "./professor-sol-directed-deck-enrichment-v1-1-1";
import type { SolDirectedCriticVerdictV111 } from "./professor-sol-directed-critic-v1-1-1";
import type { SolDirectedValidationV111 } from "./professor-sol-directed-pre-head-professor-gate-v1-1-1";
import type {
  ArchitectRawPlanV11,
  RetrievalContractV11,
  RetrievalResultV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";
import type { SolDirectedModelCallRecordV1 } from "./professor-sol-directed-types-v1";
import {
  normalizeUserSemanticPreferencesV111,
  type UserSemanticPreferencesV111,
} from "./professor-user-semantic-preferences-v1-1-1";
import type { ProfessorImportedDeckCardV111 } from "./professor-imported-decklist-v1-1-1";

export const PROFESSOR_SOL_DIRECTED_BUILD_TYPES_V1_1_1_VERSION =
  "professor-sol-directed-build-types-v1-1-1";

export type SolDirectedBuildStatusV111 =
  | "CREATED"
  | "ARCHITECTING"
  | "RETRIEVING_CANDIDATES"
  | "CONSTRUCTING_DECK"
  | "VALIDATING"
  | "CRITIC_REFINING"
  | "HEAD_PROFESSOR_REVIEW"
  | "COMPLETE"
  | "FAILED";

export type SolDirectedBuildModeV111 = "build" | "optimize";

export type SolDirectedBuildUserInputsV111 = {
  commanderOracleId: string;
  bracket: number;
  playstyle: string;
  deckTheme: string;
  winPreference: string;
  commanderStyle: string;
  deckPreferences?: string;
  userSemanticPreferences?: UserSemanticPreferencesV111;
  budgetConstraints?: string[];
  inventoryConstraints?: string[];
  mode?: SolDirectedBuildModeV111;
  importedCards?: ProfessorImportedDeckCardV111[];
};

/** Firestore rejects undefined field values — GUI omits optional constraint arrays. */
export function normalizeSolDirectedBuildUserInputsV111(
  inputs: SolDirectedBuildUserInputsV111,
): SolDirectedBuildUserInputsV111 {
  return {
    commanderOracleId: inputs.commanderOracleId,
    bracket: inputs.bracket,
    playstyle: inputs.playstyle,
    deckTheme: inputs.deckTheme?.trim() ?? "",
    winPreference: inputs.winPreference?.trim() ?? "",
    commanderStyle: inputs.commanderStyle,
    deckPreferences: inputs.deckPreferences?.trim() ?? "",
    userSemanticPreferences: normalizeUserSemanticPreferencesV111(inputs.userSemanticPreferences),
    budgetConstraints: inputs.budgetConstraints ?? [],
    inventoryConstraints: inputs.inventoryConstraints ?? [],
    mode: inputs.mode === "optimize" ? "optimize" : "build",
    importedCards: Array.isArray(inputs.importedCards)
      ? inputs.importedCards
          .map((card) => ({
            name: String(card.name ?? "").trim(),
            copies: Math.max(1, Number(card.copies) || 1),
          }))
          .filter((card) => card.name)
      : [],
  };
}

export type SolDirectedBuildProofChainV111 = {
  buildInputHash: string;
  architectRawHash: string | null;
  retrievalContractHash: string | null;
  candidateUniverseHash: string | null;
  constructorInputHash: string | null;
  constructorRawHash: string | null;
  canonicalizedDeckHash: string | null;
  validationHash: string | null;
  headProfessorInputDeckHash: string | null;
  headProfessorResponseHash: string | null;
  headProfessorDeckMatch: boolean | null;
};

export type SolDirectedBuildTelemetryV111 = {
  modelCallCount: number;
  architectTokens: number | null;
  constructorTokens: number | null;
  criticTokens: number | null;
  headProfessorTokens: number | null;
  latencyMsByStage: Partial<Record<SolDirectedBuildStatusV111, number>>;
  candidateUniqueCount: number | null;
  nonlandCount: number | null;
  landCount: number | null;
};

export type SolDirectedBuildActivityDirectionV111 = "out" | "in" | "status";

export type SolDirectedBuildActivityEntryV111 = {
  at: string;
  status: SolDirectedBuildStatusV111;
  direction?: SolDirectedBuildActivityDirectionV111;
  message: string;
};

export type SolDirectedBuildJobRecordV111 = {
  buildId: string;
  userId: string | null;
  storeId: string;
  storeSlug: string;
  status: SolDirectedBuildStatusV111;
  statusLabel: string;
  commanderOracleId: string;
  commanderName: string;
  bracket: number;
  playstyle: string;
  deckTheme: string;
  winPreference: string;
  commanderStyle: string;
  userInputs: SolDirectedBuildUserInputsV111;
  activityLog: SolDirectedBuildActivityEntryV111[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  validationPass: boolean | null;
  finalClassification: string | null;
  finalGrade: string | null;
  artifactStoragePrefix: string | null;
  proofChain: SolDirectedBuildProofChainV111 | null;
  telemetry: SolDirectedBuildTelemetryV111 | null;
};

export type SolDirectedBuildResultV111 = {
  buildId: string;
  status: SolDirectedBuildStatusV111;
  commander: CommanderBlueprintV417;
  userInputs: SolDirectedBuildUserInputsV111;
  architectPlan: ArchitectRawPlanV11 | null;
  retrievalSummary: {
    uniqueCandidateCount: number;
    requirementPoolCounts: Record<string, number>;
    supplyGatePass: boolean;
  } | null;
  constructedDeck: SolDirectedConstructedDeckV11 | null;
  validation: SolDirectedValidationV111 | null;
  critic: SolDirectedCriticVerdictV111 | null;
  headProfessor: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
  retrievalContract: RetrievalContractV11 | null;
  /** True when a post-grade Critic repair pass applied swaps from requiredChanges. */
  professorRepairApplied?: boolean;
  /** Prefetched Scryfall art + store inventory for instant deck list rendering. */
  deckEnrichment?: SolDirectedDeckEnrichmentV111 | null;
  telemetry: SolDirectedBuildTelemetryV111;
  modelCalls: SolDirectedModelCallRecordV1[];
  proofChain: SolDirectedBuildProofChainV111;
  failureCode: string | null;
  failureMessage: string | null;
};

export type SolDirectedBuildJobViewV111 = {
  job: SolDirectedBuildJobRecordV111;
  result?: SolDirectedBuildResultV111;
};

export const SOL_DIRECTED_BUILD_STATUS_LABELS: Record<SolDirectedBuildStatusV111, string> = {
  CREATED: "Starting build…",
  ARCHITECTING: "Designing your deck strategy…",
  RETRIEVING_CANDIDATES: "Finding cards that fit the plan…",
  CONSTRUCTING_DECK: "Building your Commander deck…",
  VALIDATING: "Checking cards and Commander legality…",
  CRITIC_REFINING: "Refining with staples and synergy upgrades…",
  HEAD_PROFESSOR_REVIEW: "Professor is grading the finished deck…",
  COMPLETE: "Deck complete",
  FAILED: "Build failed",
};

export const SOL_DIRECTED_BUILD_FAILURE_MESSAGES: Record<string, string> = {
  CONSTRUCTOR_INPUT_INSUFFICIENT: "I couldn't find enough suitable cards to complete this build.",
  VALIDATION_FAILED: "The proposed deck didn't pass the final Commander rules check.",
  OUT_OF_CANDIDATE_SELECTION: "One or more selected cards couldn't be verified against the build's card pool.",
  ARCHITECT_INGESTION_FAILED: "Professor couldn't interpret the deck strategy plan.",
  ARCHITECT_DEFECT: "Professor couldn't produce a coherent deck strategy.",
  CONSTRUCTOR_DEFECT: "Professor couldn't complete the deck list.",
  CONSTRUCTION_DEFECT:
    "Professor couldn't bring this deck up to quality standards. Try adjusting bracket, playstyle, or deck preferences and build again.",
  MODEL_FAILURE: "Professor couldn't finish this deck build.",
  P0_TRUTH_REGRESSIONS_NOT_PASSING: "Card catalog truth checks failed before building.",
  IMPORT_UNRESOLVED: "I couldn't recognize enough cards in this list to optimize it.",
  IMPORT_IDENTITY: "This list has cards outside the commander's colors.",
};
