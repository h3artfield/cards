/**
 * Application service — generic Sol-directed Commander build (v1.1.1 GUI path).
 * Architect → Retrieval → Constructor → Validation → Critic swaps → Head Professor grade.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "./professor-commander-catalog-v4-17-v1";
import { runSolDirectedArchitectV11 } from "./professor-sol-directed-architect-v1-1";
import { evaluateArchitectIngestionGateV111 } from "./professor-sol-directed-ingestion-gate-v1-1-1";
import { runSolDirectedRetrievalV11 } from "./professor-sol-directed-retrieval-v1-1";
import {
  isProfessorSolDirectedBracketAttainmentEnabled,
  isProfessorSolDirectedBracketCeilingEnabled,
  isProfessorSolDirectedBracketPowerRankingEnabled,
  isProfessorSolDirectedNeighborExpansionEnabled,
} from "./professor-sol-directed-gui-flag-v1-1-1";
import { loadSemanticMapNeighbors } from "@/lib/semantic-visualization/artifact-loader";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { loadPlayRateIndex } from "@/lib/deck-swap/v1/play-rate-server";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";
import {
  evaluateConstructorSupplyGateMandatoryV11,
} from "./professor-sol-directed-supply-gate-v1-1";
import { buildConstructorInputBundleV11 } from "./professor-sol-directed-constructor-input-v1-1";
import {
  isConstructorOutputCatastrophicallyIncompleteV11,
  runSolDirectedConstructorV11,
} from "./professor-sol-directed-constructor-v1-1";
import {
  evaluatePreHeadProfessorGateV111,
  validateSolDirectedDeckV111,
} from "./professor-sol-directed-pre-head-professor-gate-v1-1-1";
import { applyBracketAttainmentV111 } from "./professor-sol-directed-bracket-attainment-apply-v1-1-1";
import { applyBracketCeilingV111 } from "./professor-sol-directed-bracket-ceiling-apply-v1-1-1";
import { createDeckValidatorV111 } from "./professor-sol-directed-validated-deck-v1-1-1";
import {
  formatHeadProfessorQualityFailureDetailV111,
  isSolDirectedHeadProfessorShippableV111,
  shouldRunProfessorRepairCriticV111,
  runSolDirectedHeadProfessorWholeDeckV111,
  type SolDirectedHeadProfessorWholeDeckVerdictV111,
} from "./professor-sol-directed-head-professor-v1-1-1";
import { runSolDirectedCriticV111, type SolDirectedCriticVerdictV111 } from "./professor-sol-directed-critic-v1-1-1";
import { auditSemanticRoleAssignmentsV111 } from "./professor-semantic-role-audit-v1-1-1";
import {
  userSemanticPreferencesForPromptV111,
  type UserSemanticPreferencesV111,
} from "./professor-user-semantic-preferences-v1-1-1";
import { repairSolDirectedConstructedDeckCountsV111 } from "./professor-sol-directed-deck-count-repair-v1-1-1";
import { repairSolDirectedDeckSingletonViolationsV111 } from "./professor-sol-directed-deck-singleton-repair-v1-1-1";
import { enrichSolDirectedDeckForDisplayV111 } from "./professor-sol-directed-deck-enrichment-v1-1-1";
import {
  isSolDirectedHeadProfessorBestEffortShippableV111,
  headProfessorDisplayLetter,
  prepareHeadProfessorVerdictForCustomerV111,
} from "./professor-sol-directed-deck-grade-v1-1-1";
import {
  isDeckPreferencesSetConstrained,
  repairDeckSetPreferenceViolationsV111,
} from "./professor-sol-directed-deck-preferences-v1-1-1";
import {
  isLandBaseProfessorDefectV111,
  repairSolDirectedLandBaseV111,
} from "./professor-sol-directed-land-base-repair-v1-1-1";
import { repairOffPlanNonlandsV111 } from "./professor-sol-directed-off-plan-repair-v1-1-1";
import { repairArchitectRequirementCountsV111 } from "./professor-sol-directed-architect-count-repair-v1-1-1";
import {
  candidateHydrationContextFromBundle,
  repairConstructorHydrationFailuresV111,
  rehydrateRepairedConstructedDeckV111,
  findLandPoolMatches,
} from "./professor-sol-directed-candidate-hydration-v1-1-1";
import { buildProofChainV111 } from "./professor-sol-directed-build-proof-v1-1-1";
import { persistSolDirectedBuildArtifactsV111 } from "./professor-sol-directed-build-artifacts-v1-1-1";
import {
  createSolDirectedBuildJobV111,
  saveSolDirectedBuildResultV111,
  updateSolDirectedBuildJobStatusV111,
  appendSolDirectedBuildActivityV111,
} from "./professor-sol-directed-build-job-store-v1-1-1";
import { createSolDirectedAgentFeed } from "./professor-sol-directed-build-activity-v1-1-1";
import {
  PROFESSOR_SOL_DIRECTED_FRONTIER_MODEL_V111,
  resolveSolDirectedReasoningEffort,
} from "./professor-sol-directed-model-config-v1-1-1";
import {
  normalizeSolDirectedBuildUserInputsV111,
  SOL_DIRECTED_BUILD_STATUS_LABELS,
  type SolDirectedBuildJobRecordV111,
  type SolDirectedBuildResultV111,
  type SolDirectedBuildStatusV111,
  type SolDirectedBuildUserInputsV111,
} from "./professor-sol-directed-build-types-v1-1-1";
import {
  SOL_DIRECTED_BUILD_FAILURE_MESSAGES,
} from "./professor-sol-directed-build-types-v1-1-1";
import type { SolDirectedModelCallRecordV1 } from "./professor-sol-directed-types-v1";
import type {
  ArchitectRawPlanV11,
  CanonicalCardFactsV11,
  LandPoolV11,
  RequirementPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";
import type { IdentityResolutionLedgerEntryV111 } from "./professor-sol-directed-candidate-hydration-v1-1-1";
import type { SolDirectedValidationV111 } from "./professor-sol-directed-pre-head-professor-gate-v1-1-1";
import type { ProfessorImportedDeckCardV111 } from "./professor-imported-decklist-v1-1-1";
import { runSolDirectedImportedDeckOptimize } from "./professor-sol-directed-imported-optimize-v1-1-1";

export const PROFESSOR_SOL_DIRECTED_COMMANDER_BUILD_SERVICE_V1_1_1_VERSION =
  "professor-sol-directed-commander-build-service-v1-1-1";

const MAX_MODEL_CALLS = 10;
const MAX_PROFESSOR_REPAIR_PASSES = 2;

function clipThought(text: string, max = 240): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

export function solDirectedBuildLiveEnabled(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_LIVE === "1" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

export type RunSolDirectedCommanderBuildArgs = {
  commanderOracleId: string;
  commanderName: string;
  bracket: number;
  playstyle: string;
  deckTheme?: string;
  winPreference?: string;
  commanderStyle: string;
  deckPreferences?: string;
  userSemanticPreferences?: UserSemanticPreferencesV111;
  budgetConstraints?: string[];
  inventoryConstraints?: string[];
  storeId: string;
  storeSlug: string;
  userId?: string | null;
  buildId?: string;
  existingJob?: SolDirectedBuildJobRecordV111;
  catalog: DeckResolutionCatalog;
  p0TruthPass?: boolean;
  onStatus?: (status: SolDirectedBuildStatusV111) => void | Promise<void>;
  mode?: "build" | "optimize";
  importedCards?: ProfessorImportedDeckCardV111[];
};

/**
 * The requested bracket arrives as a plain number from the GUI. Anything
 * outside 1-5 has no policy to consult, so power ranking simply stays off.
 */
function asCommanderBracketV111(bracket: number): CommanderBracket | null {
  return bracket === 1 || bracket === 2 || bracket === 3 || bracket === 4 || bracket === 5
    ? bracket
    : null;
}

function loadPlayRateMapV111(): ReadonlyMap<string, number> {
  return new Map(
    Object.entries(loadPlayRateIndex().cards).map(([oracleId, stat]) => [oracleId, stat.rate]),
  );
}

function userFacingFailure(code: string, detail?: string): string {
  const base = SOL_DIRECTED_BUILD_FAILURE_MESSAGES[code] ?? detail ?? "Professor couldn't finish this deck build.";
  if (code === "VALIDATION_FAILED" && detail && SOL_DIRECTED_BUILD_FAILURE_MESSAGES[code]) {
    const preview = detail.split(";").slice(0, 5).join("; ");
    return `${base} ${preview}${detail.split(";").length > 5 ? "…" : ""}`;
  }
  if (code === "ARCHITECT_INGESTION_FAILED" && detail) {
    const preview = detail.split(";").slice(0, 3).join("; ");
    return `${base} (${preview})`;
  }
  if (code === "CONSTRUCTION_DEFECT" && detail) {
    return `${base} ${detail}`;
  }
  return base;
}

type SolDirectedFailureContextV111 = {
  architectPlan?: ArchitectRawPlanV11 | null;
  retrievalSummary?: SolDirectedBuildResultV111["retrievalSummary"];
  constructedDeck?: SolDirectedConstructedDeckV11 | null;
  validation?: SolDirectedValidationV111 | null;
  retrievalContract?: RetrievalContractV11 | null;
  critic?: SolDirectedCriticVerdictV111 | null;
  headProfessor?: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
  telemetryPatch?: Partial<SolDirectedBuildResultV111["telemetry"]>;
};

function sumTokens(calls: SolDirectedModelCallRecordV1[], purpose: SolDirectedModelCallRecordV1["purpose"]): number | null {
  const call = calls.find((c) => c.purpose === purpose);
  return call?.totalTokens ?? null;
}

function sumTokensByPurposes(
  calls: SolDirectedModelCallRecordV1[],
  purposes: SolDirectedModelCallRecordV1["purpose"][],
): number | null {
  const total = purposes.reduce((sum, purpose) => sum + (sumTokens(calls, purpose) ?? 0), 0);
  return total > 0 ? total : null;
}
function mergeCriticVerdictsV111(
  base: SolDirectedCriticVerdictV111,
  repair: SolDirectedCriticVerdictV111,
): SolDirectedCriticVerdictV111 {
  return {
    summary: `${base.summary} Repair: ${repair.summary}`,
    proposedSwaps: [...base.proposedSwaps, ...repair.proposedSwaps],
    appliedSwaps: [...base.appliedSwaps, ...repair.appliedSwaps],
    rejectedSwaps: [...base.rejectedSwaps, ...repair.rejectedSwaps],
  };
}

function applyDeckPreferenceRepairsV111(args: {
  deck: SolDirectedConstructedDeckV11;
  deckPreferences?: string;
  catalog: DeckResolutionCatalog;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
  landPool: LandPoolV11;
}): { deck: SolDirectedConstructedDeckV11; repairs: string[] } {
  const deckPreferences = args.deckPreferences ?? "";
  if (!isDeckPreferencesSetConstrained(deckPreferences)) {
    return { deck: args.deck, repairs: [] };
  }
  return repairDeckSetPreferenceViolationsV111({
    deck: args.deck,
    catalog: args.catalog,
    deckPreferences,
    candidateDictionary: args.candidateDictionary,
    requirementPools: args.requirementPools,
    landPool: args.landPool,
  });
}

function normalizeDeckBeforeValidationV111(args: {
  deck: SolDirectedConstructedDeckV11;
  contract: RetrievalContractV11;
  landPool: LandPoolV11;
  catalog: DeckResolutionCatalog;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
  identityLedger: IdentityResolutionLedgerEntryV111[];
  prohibitedOracleIds?: string[];
}): {
  deck: SolDirectedConstructedDeckV11;
  validation: SolDirectedValidationV111;
  repairs: string[];
} {
  let deck = args.deck;
  const repairs: string[] = [];

  const countRepair = repairSolDirectedConstructedDeckCountsV111({
    deck,
    contract: args.contract,
    landPool: args.landPool,
  });
  deck = countRepair.deck;
  repairs.push(...countRepair.repairs);

  const architectCountRepair = repairArchitectRequirementCountsV111({
    deck,
    contract: args.contract,
    candidateDictionary: args.candidateDictionary,
    requirementPools: args.requirementPools,
  });
  deck = architectCountRepair.deck;
  repairs.push(...architectCountRepair.repairs);

  if (architectCountRepair.repairs.length > 0) {
    const countAgain = repairSolDirectedConstructedDeckCountsV111({
      deck,
      contract: args.contract,
      landPool: args.landPool,
    });
    deck = countAgain.deck;
    repairs.push(...countAgain.repairs);
  }

  const singletonRepair = repairSolDirectedDeckSingletonViolationsV111({
    deck,
    contract: args.contract,
    landPool: args.landPool,
    candidateDictionary: args.candidateDictionary,
  });
  deck = singletonRepair.deck;
  repairs.push(...singletonRepair.repairs);

  const validation = validateSolDirectedDeckV111({
    deck,
    catalog: args.catalog,
    contract: args.contract,
    candidateDictionary: args.candidateDictionary,
    landPool: args.landPool,
    identityLedger: args.identityLedger,
    prohibitedOracleIds: args.prohibitedOracleIds,
  });

  return { deck, validation, repairs };
}

function applyLandBaseRepairStepV111(args: {
  deck: SolDirectedConstructedDeckV11;
  landPool: LandPoolV11;
  contract: RetrievalContractV11;
  catalog: DeckResolutionCatalog;
  identityLedger: IdentityResolutionLedgerEntryV111[];
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  requirementPools: RequirementPoolV11[];
  prohibitedOracleIds?: string[];
  professorVerdict?: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
}): {
  deck: SolDirectedConstructedDeckV11;
  validation: SolDirectedValidationV111;
  repairs: string[];
} {
  const priorValidation = validateSolDirectedDeckV111({
    deck: args.deck,
    catalog: args.catalog,
    contract: args.contract,
    candidateDictionary: args.candidateDictionary,
    landPool: args.landPool,
    identityLedger: args.identityLedger,
    prohibitedOracleIds: args.prohibitedOracleIds,
  });

  const landRepair = repairSolDirectedLandBaseV111({
    deck: args.deck,
    landPool: args.landPool,
    contract: args.contract,
    catalog: args.catalog,
    professorVerdict: args.professorVerdict,
  });
  if (landRepair.repairs.length === 0) {
    return { deck: args.deck, validation: priorValidation, repairs: [] };
  }

  const countRepair = repairSolDirectedConstructedDeckCountsV111({
    deck: landRepair.deck,
    contract: args.contract,
    landPool: args.landPool,
  });
  const singletonRepair = repairSolDirectedDeckSingletonViolationsV111({
    deck: countRepair.deck,
    contract: args.contract,
    landPool: args.landPool,
    candidateDictionary: args.candidateDictionary,
  });
  const architectCountRepair = repairArchitectRequirementCountsV111({
    deck: singletonRepair.deck,
    contract: args.contract,
    candidateDictionary: args.candidateDictionary,
    requirementPools: args.requirementPools,
  });
  const validation = validateSolDirectedDeckV111({
    deck: architectCountRepair.deck,
    catalog: args.catalog,
    contract: args.contract,
    candidateDictionary: args.candidateDictionary,
    landPool: args.landPool,
    identityLedger: args.identityLedger,
    prohibitedOracleIds: args.prohibitedOracleIds,
  });
  // A mana-base tune is discretionary; it may never turn a legal deck into an illegal one.
  if (!validation.pass && priorValidation.pass) {
    return { deck: args.deck, validation: priorValidation, repairs: [] };
  }
  return {
    deck: architectCountRepair.deck,
    validation,
    repairs: [
      ...landRepair.repairs,
      ...countRepair.repairs,
      ...singletonRepair.repairs,
      ...architectCountRepair.repairs,
    ],
  };
}

function isArchitectCountsOnlyValidationFailureV111(validation: SolDirectedValidationV111): boolean {
  if (validation.pass) return false;
  const nonArchitect = validation.violations.filter((violation) => !violation.startsWith("ARCHITECT_COUNTS:"));
  return nonArchitect.length === 0 && validation.identityLedgerErrors.length === 0;
}

function applyCriticDeckIfValidV111(args: {
  deck: SolDirectedConstructedDeckV11;
  criticVerdict: SolDirectedCriticVerdictV111;
  fallbackDeck: SolDirectedConstructedDeckV11;
  catalog: DeckResolutionCatalog;
  contract: RetrievalContractV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  landPool: LandPoolV11;
  requirementPools: RequirementPoolV11[];
  identityLedger: IdentityResolutionLedgerEntryV111[];
  prohibitedOracleIds?: string[];
  validation: SolDirectedValidationV111;
}): {
  deck: SolDirectedConstructedDeckV11;
  criticVerdict: SolDirectedCriticVerdictV111;
  validation: SolDirectedValidationV111;
} {
  if (args.criticVerdict.appliedSwaps.length === 0) {
    return { deck: args.deck, criticVerdict: args.criticVerdict, validation: args.validation };
  }

  const countRepair = repairSolDirectedConstructedDeckCountsV111({
    deck: args.deck,
    contract: args.contract,
    landPool: args.landPool,
  });

  const singletonRepair = repairSolDirectedDeckSingletonViolationsV111({
    deck: countRepair.deck,
    contract: args.contract,
    landPool: args.landPool,
    candidateDictionary: args.candidateDictionary,
  });

  const architectCountRepair = repairArchitectRequirementCountsV111({
    deck: singletonRepair.deck,
    contract: args.contract,
    candidateDictionary: args.candidateDictionary,
    requirementPools: args.requirementPools,
  });

  const postCriticValidation = validateSolDirectedDeckV111({
    deck: architectCountRepair.deck,
    catalog: args.catalog,
    contract: args.contract,
    candidateDictionary: args.candidateDictionary,
    landPool: args.landPool,
    identityLedger: args.identityLedger,
    prohibitedOracleIds: args.prohibitedOracleIds,
  });
  const postGate = evaluatePreHeadProfessorGateV111(postCriticValidation);
  if (postGate.pass && postCriticValidation.pass) {
    return { deck: architectCountRepair.deck, criticVerdict: args.criticVerdict, validation: postCriticValidation };
  }

  const hardViolations = postCriticValidation.violations.filter(
    (violation) =>
      !violation.startsWith("ARCHITECT_COUNTS:") &&
      !violation.includes("!=") &&
      !violation.startsWith("ARCHITECT_REQUIREMENT") &&
      !violation.startsWith("MISSING_PRIMARY_REQUIREMENT"),
  );
  if (
    hardViolations.length === 0 &&
    postCriticValidation.identityLedgerErrors.length === 0 &&
    args.criticVerdict.appliedSwaps.length > 0
  ) {
    return { deck: architectCountRepair.deck, criticVerdict: args.criticVerdict, validation: postCriticValidation };
  }

  return {
    deck: args.fallbackDeck,
    criticVerdict: {
      ...args.criticVerdict,
      appliedSwaps: [],
      rejectedSwaps: [
        ...args.criticVerdict.rejectedSwaps,
        ...args.criticVerdict.appliedSwaps.map((swap) => ({
          swap,
          reason: "POST_CRITIC_VALIDATION_FAILED",
        })),
      ],
    },
    validation: args.validation,
  };
}

export async function runSolDirectedCommanderBuild(
  args: RunSolDirectedCommanderBuildArgs,
): Promise<SolDirectedBuildResultV111> {
  if (args.mode === "optimize") {
    return runSolDirectedImportedDeckOptimize({
      ...args,
      importedCards: args.importedCards ?? [],
    });
  }

  const started = Date.now();
  const latencyMsByStage: Partial<Record<SolDirectedBuildStatusV111, number>> = {};
  const modelCalls: SolDirectedModelCallRecordV1[] = [];

  const userInputs: SolDirectedBuildUserInputsV111 = normalizeSolDirectedBuildUserInputsV111({
    commanderOracleId: args.commanderOracleId,
    bracket: args.bracket,
    playstyle: args.playstyle,
    deckTheme: args.deckTheme ?? "",
    winPreference: args.winPreference ?? "",
    commanderStyle: args.commanderStyle,
    deckPreferences: args.deckPreferences,
    userSemanticPreferences: args.userSemanticPreferences,
    budgetConstraints: args.budgetConstraints,
    inventoryConstraints: args.inventoryConstraints,
  });

  const commander = resolveCommanderBlueprintFromCatalogV417({
    catalog: args.catalog,
    commanderName: args.commanderName,
  });

  if (commander.oracleId !== args.commanderOracleId) {
    throw new Error(
      `Commander oracle mismatch: expected ${args.commanderOracleId}, catalog resolved ${commander.oracleId}`,
    );
  }

  const job =
    args.existingJob ??
    createSolDirectedBuildJobV111({
      storeId: args.storeId,
      storeSlug: args.storeSlug,
      userId: args.userId,
      commanderOracleId: args.commanderOracleId,
      commanderName: args.commanderName,
      userInputs,
    });

  const setStatus = async (status: SolDirectedBuildStatusV111, thought?: string) => {
    latencyMsByStage[status] = Date.now() - started;
    await updateSolDirectedBuildJobStatusV111({ buildId: job.buildId, status });
    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status,
      message: thought ?? SOL_DIRECTED_BUILD_STATUS_LABELS[status],
    });
    await args.onStatus?.(status);
  };

  const fail = async (
    code: string,
    detail: string,
    context: SolDirectedFailureContextV111 = {},
  ): Promise<SolDirectedBuildResultV111> => {
    if (code === "VALIDATION_FAILED") {
      console.error("[sol-directed-build] validation failed:", detail);
    }
    const result: SolDirectedBuildResultV111 = {
      buildId: job.buildId,
      status: "FAILED",
      commander,
      userInputs,
      architectPlan: context.architectPlan ?? null,
      retrievalSummary: context.retrievalSummary ?? null,
      constructedDeck: context.constructedDeck ?? null,
      validation: context.validation ?? null,
      critic: context.critic ?? null,
      headProfessor: context.headProfessor ?? null,
      retrievalContract: context.retrievalContract ?? null,
      telemetry: {
        modelCallCount: modelCalls.length,
        architectTokens: sumTokens(modelCalls, "ARCHITECT"),
        constructorTokens: sumTokens(modelCalls, "CONSTRUCTOR"),
        criticTokens: sumTokens(modelCalls, "CRITIC"),
        headProfessorTokens: sumTokens(modelCalls, "HEAD_PROFESSOR"),
        latencyMsByStage,
        candidateUniqueCount: context.telemetryPatch?.candidateUniqueCount ?? null,
        nonlandCount: context.telemetryPatch?.nonlandCount ?? null,
        landCount: context.telemetryPatch?.landCount ?? null,
      },
      modelCalls,
      proofChain: buildProofChainV111({
        buildInput: userInputs,
        architectRaw: modelCalls.find((c) => c.purpose === "ARCHITECT")?.rawResponse ?? null,
        retrievalContract: null,
        candidateDictionary: null,
        constructorInput: null,
        constructorRaw: modelCalls.find((c) => c.purpose === "CONSTRUCTOR")?.rawResponse ?? null,
        canonicalizedDeck: null,
        validation: null,
        headProfessorInputDeck: null,
        headProfessorResponse: null,
      }),
      failureCode: code,
      failureMessage: userFacingFailure(code, detail),
    };
    await saveSolDirectedBuildResultV111({ job, result });
    await setStatus("FAILED");
    return result;
  };

  if (args.p0TruthPass === false) {
    return fail("P0_TRUTH_REGRESSIONS_NOT_PASSING", "P0 truth selftest did not pass.");
  }

  if (!solDirectedBuildLiveEnabled()) {
    return fail("MODEL_FAILURE", "Set PROFESSOR_SOL_DIRECTED_LIVE=1 and OPENAI_API_KEY for live builds.");
  }

  let architectRawPlan: ArchitectRawPlanV11 | null = null;
  let retrievalContract: RetrievalContractV11 | null = null;

  try {
    await setStatus("ARCHITECTING");
    const architectFeed = createSolDirectedAgentFeed({ buildId: job.buildId, status: "ARCHITECTING" });
    const architectArgs = {
      commander,
      bracket: args.bracket,
      playstyle: userInputs.playstyle,
      deckTheme: userInputs.deckTheme || undefined,
      winPreference: userInputs.winPreference || undefined,
      commanderStyle: userInputs.commanderStyle,
      deckPreferences: userInputs.deckPreferences,
      userSemanticPreferences: userSemanticPreferencesForPromptV111(userInputs.userSemanticPreferences),
      budgetConstraints: args.budgetConstraints,
      inventoryConstraints: args.inventoryConstraints,
      onFeed: architectFeed,
    };

    let architect = await runSolDirectedArchitectV11(architectArgs);
    modelCalls.push(architect.record);

    let ingestion = evaluateArchitectIngestionGateV111(architect.rawPlan);
    if (ingestion.repairs.length > 0) {
      await appendSolDirectedBuildActivityV111({
        buildId: job.buildId,
        status: "ARCHITECTING",
        message: `Adjusted strategy plan slot counts: ${ingestion.repairs.join("; ")}`,
      });
    }
    if (!ingestion.pass && modelCalls.length < MAX_MODEL_CALLS) {
      const retryReasoning = resolveSolDirectedReasoningEffort("ARCHITECT", false);
      await appendSolDirectedBuildActivityV111({
        buildId: job.buildId,
        status: "ARCHITECTING",
        message: `Plan incomplete (${ingestion.failures.slice(0, 2).join("; ")}) — retrying strategy plan…`,
      });
      architect = await runSolDirectedArchitectV11({
        ...architectArgs,
        ingestionFailures: ingestion.failures,
        modelOverride: {
          modelIdentifierOverride: PROFESSOR_SOL_DIRECTED_FRONTIER_MODEL_V111,
          reasoningEffortOverride: retryReasoning,
          liveFast: false,
        },
      });
      modelCalls.push(architect.record);
      ingestion = evaluateArchitectIngestionGateV111(architect.rawPlan);
      if (ingestion.repairs.length > 0) {
        await appendSolDirectedBuildActivityV111({
          buildId: job.buildId,
          status: "ARCHITECTING",
          message: `Adjusted strategy plan slot counts: ${ingestion.repairs.join("; ")}`,
        });
      }
    }

    if (!ingestion.pass) {
      return fail("ARCHITECT_INGESTION_FAILED", ingestion.failures.join("; "));
    }

    architectRawPlan = ingestion.ingested.architectRawPlan;
    retrievalContract = ingestion.ingested.retrievalContract;

    await setStatus("RETRIEVING_CANDIDATES");
    const neighborExpansionEnabled = isProfessorSolDirectedNeighborExpansionEnabled();
    const requestedBracket = asCommanderBracketV111(args.bracket);
    const bracketPowerRankingEnabled =
      isProfessorSolDirectedBracketPowerRankingEnabled() && requestedBracket != null;
    const retrieval = runSolDirectedRetrievalV11({
      contract: retrievalContract,
      catalog: args.catalog,
      commander,
      deckPreferences: userInputs.deckPreferences,
      userSemanticPreferences: userInputs.userSemanticPreferences,
      semanticNeighborExpansionEnabled: neighborExpansionEnabled,
      semanticNeighbors: neighborExpansionEnabled ? await loadSemanticMapNeighbors() : null,
      bracketPowerRankingEnabled,
      requestedBracket,
      gameChangerOracleIds: bracketPowerRankingEnabled
        ? gameChangerOracleIdSet(loadCommanderGameChangerSnapshot())
        : null,
      playRateByOracleId: bracketPowerRankingEnabled ? loadPlayRateMapV111() : null,
    });

    const supplyGate = evaluateConstructorSupplyGateMandatoryV11({
      contract: retrievalContract,
      retrieval,
    });
    if (!supplyGate.pass) {
      return fail("CONSTRUCTOR_INPUT_INSUFFICIENT", supplyGate.reasons.join("; "));
    }

    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status: "RETRIEVING_CANDIDATES",
      message: `Candidate pool ready — ${retrieval.uniqueNonlandCount} nonlands across ${retrieval.requirementPools.length} architect slots.`,
    });

    const bundle = buildConstructorInputBundleV11({
      architectRawPlan,
      retrievalContract,
      retrieval,
      commander,
      bracket: args.bracket,
      playstyle: userInputs.playstyle,
      deckTheme: userInputs.deckTheme || undefined,
      winPreference: userInputs.winPreference || undefined,
      commanderStyle: userInputs.commanderStyle,
      deckPreferences: userInputs.deckPreferences,
      userSemanticPreferences: userInputs.userSemanticPreferences,
      supplyGate,
    });

    await setStatus("CONSTRUCTING_DECK");
    const constructor = await runSolDirectedConstructorV11({
      bundle,
      commander,
      catalog: args.catalog,
      onFeed: createSolDirectedAgentFeed({ buildId: job.buildId, status: "CONSTRUCTING_DECK" }),
    });
    modelCalls.push(constructor.record);

    const incomplete = isConstructorOutputCatastrophicallyIncompleteV11({
      deck: constructor.deck,
      requiredNonlands: retrievalContract.nonlandSlotsRequired,
      requiredLands: retrievalContract.landSlotsRequired,
    });
    if (incomplete.incomplete) {
      return fail("CONSTRUCTOR_DEFECT", incomplete.reason ?? "Constructor output incomplete.");
    }

    let constructedFromConstructor = constructor.deck;
    let constructorIdentityLedger = constructor.identityLedger;
    const hydrationContext = candidateHydrationContextFromBundle(bundle, {
      catalog: args.catalog,
      commanderColorIdentity: commander.colorIdentity,
    });

    const needsHydrationRepair =
      constructor.hydrationErrors.length > 0 ||
      constructor.deck.nonlands.some((card) => !card.oracleId) ||
      constructor.deck.lands.some(
        (land) => findLandPoolMatches(land.name, hydrationContext.landPool).length === 0,
      );

    if (needsHydrationRepair) {
      const hydrationRepair = repairConstructorHydrationFailuresV111({
        deck: constructor.deck,
        ledger: constructor.identityLedger,
        context: hydrationContext,
      });
      if (hydrationRepair.repairs.length > 0) {
        await appendSolDirectedBuildActivityV111({
          buildId: job.buildId,
          status: "CONSTRUCTING_DECK",
          message: `Recovered ${hydrationRepair.repairs.length} card(s) from pool: ${hydrationRepair.repairs.slice(0, 3).join("; ")}${hydrationRepair.repairs.length > 3 ? "…" : ""}`,
        });
      }
      if (hydrationRepair.errors.length > 0) {
        return fail(
          "OUT_OF_CANDIDATE_SELECTION",
          [...constructor.hydrationErrors, ...hydrationRepair.errors].join("; "),
        );
      }

      const rehydrated = rehydrateRepairedConstructedDeckV111({
        deck: hydrationRepair.deck,
        context: hydrationContext,
      });
      if (rehydrated.errors.length > 0) {
        const secondRepair = repairConstructorHydrationFailuresV111({
          deck: rehydrated.deck,
          ledger: rehydrated.ledger,
          context: hydrationContext,
        });
        if (secondRepair.errors.length > 0) {
          return fail("OUT_OF_CANDIDATE_SELECTION", secondRepair.errors.join("; "));
        }
        constructedFromConstructor = secondRepair.deck;
        const secondRehydrated = rehydrateRepairedConstructedDeckV111({
          deck: secondRepair.deck,
          context: hydrationContext,
        });
        if (secondRehydrated.errors.length > 0) {
          return fail("OUT_OF_CANDIDATE_SELECTION", secondRehydrated.errors.join("; "));
        }
        constructedFromConstructor = secondRehydrated.deck;
        constructorIdentityLedger = secondRehydrated.ledger;
      } else {
        constructedFromConstructor = rehydrated.deck;
        constructorIdentityLedger = rehydrated.ledger;
      }
    }

    const normalized = normalizeDeckBeforeValidationV111({
      deck: constructedFromConstructor,
      contract: retrievalContract,
      landPool: retrieval.landPool,
      catalog: args.catalog,
      candidateDictionary: retrieval.candidateDictionary,
      requirementPools: retrieval.requirementPools,
      identityLedger: constructorIdentityLedger,
      prohibitedOracleIds: retrieval.prohibitedOracleIds,
    });
    let constructedDeck = normalized.deck;
    if (normalized.repairs.length > 0) {
      await appendSolDirectedBuildActivityV111({
        buildId: job.buildId,
        status: "CONSTRUCTING_DECK",
        message: `Adjusted deck slots: ${normalized.repairs.slice(0, 3).join("; ")}${normalized.repairs.length > 3 ? "…" : ""}`,
      });
    }

    const preLandCount = constructedDeck.lands.reduce((s, l) => s + l.copies, 0);
    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status: "CONSTRUCTING_DECK",
      message: `Draft complete — ${constructedDeck.nonlands.length} nonlands, ${preLandCount} lands.`,
    });

    await setStatus("VALIDATING");
    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status: "VALIDATING",
      message: "Checking Commander legality, color identity, and architect slot counts…",
    });
    let validation = normalized.validation;

    if (!validation.pass && isArchitectCountsOnlyValidationFailureV111(validation)) {
      const retryNormalized = normalizeDeckBeforeValidationV111({
        deck: constructedDeck,
        contract: retrievalContract,
        landPool: retrieval.landPool,
        catalog: args.catalog,
        candidateDictionary: retrieval.candidateDictionary,
        requirementPools: retrieval.requirementPools,
        identityLedger: constructorIdentityLedger,
        prohibitedOracleIds: retrieval.prohibitedOracleIds,
      });
      constructedDeck = retryNormalized.deck;
      validation = retryNormalized.validation;
      if (retryNormalized.repairs.length > 0) {
        await appendSolDirectedBuildActivityV111({
          buildId: job.buildId,
          status: "VALIDATING",
          message: `Architect slot rebalance: ${retryNormalized.repairs.slice(0, 3).join("; ")}${retryNormalized.repairs.length > 3 ? "…" : ""}`,
        });
      }
    }

    const gate = evaluatePreHeadProfessorGateV111(validation);
    if (!gate.pass || !validation.pass) {
      const code = validation.identityLedgerErrors.some((e) => e.includes("OUT_OF_CANDIDATE"))
        ? "OUT_OF_CANDIDATE_SELECTION"
        : "VALIDATION_FAILED";
      const nonlandCount = constructedDeck.nonlands.length;
      const landCount = constructedDeck.lands.reduce((s, l) => s + l.copies, 0);
      return fail(code, [...new Set([...gate.reasons, ...validation.violations])].join("; "), {
        architectPlan: architectRawPlan,
        retrievalSummary: {
          uniqueCandidateCount: retrieval.uniqueNonlandCount,
          requirementPoolCounts: Object.fromEntries(
            retrieval.requirementPools.map((p) => [p.requirementId, p.oracleIds.length]),
          ),
          supplyGatePass: supplyGate.pass,
        },
        constructedDeck,
        validation,
        retrievalContract,
        telemetryPatch: {
          candidateUniqueCount: retrieval.uniqueNonlandCount,
          nonlandCount,
          landCount,
        },
      });
    }

    if (modelCalls.length >= MAX_MODEL_CALLS) {
      return fail("MODEL_FAILURE", "Model call budget exhausted before Critic.");
    }

    await setStatus("CRITIC_REFINING");
    const semanticRoleAuditFlags = auditSemanticRoleAssignmentsV111({
      deck: constructedDeck,
      candidateDictionary: retrieval.candidateDictionary,
    });
    if (semanticRoleAuditFlags.length > 0) {
      await appendSolDirectedBuildActivityV111({
        buildId: job.buildId,
        status: "CRITIC_REFINING",
        message: `Semantic Oracle flagged ${semanticRoleAuditFlags.length} possible role misallocation${semanticRoleAuditFlags.length === 1 ? "" : "s"} for Critic.`,
      });
    }
    const critic = await runSolDirectedCriticV111({
      deck: constructedDeck,
      architectRawPlan,
      retrievalContract,
      candidateDictionary: retrieval.candidateDictionary,
      commander,
      bracket: args.bracket,
      playstyle: userInputs.playstyle,
      deckTheme: userInputs.deckTheme || undefined,
      winPreference: userInputs.winPreference || undefined,
      commanderStyle: userInputs.commanderStyle,
      deckPreferences: userInputs.deckPreferences,
      userSemanticPreferences: userInputs.userSemanticPreferences,
      semanticRoleAuditFlags,
      landPool: retrieval.landPool,
      onFeed: createSolDirectedAgentFeed({ buildId: job.buildId, status: "CRITIC_REFINING" }),
    });
    modelCalls.push(critic.record);

    const criticApplied = applyCriticDeckIfValidV111({
      deck: critic.refinedDeck,
      criticVerdict: critic.verdict,
      fallbackDeck: constructedDeck,
      catalog: args.catalog,
      contract: retrievalContract,
      candidateDictionary: retrieval.candidateDictionary,
      landPool: retrieval.landPool,
      requirementPools: retrieval.requirementPools,
      identityLedger: constructorIdentityLedger,
      prohibitedOracleIds: retrieval.prohibitedOracleIds,
      validation,
    });
    let deckForReview = criticApplied.deck;
    let criticVerdict = criticApplied.criticVerdict;
    validation = criticApplied.validation;

    const postCriticPreferenceRepair = applyDeckPreferenceRepairsV111({
      deck: deckForReview,
      deckPreferences: userInputs.deckPreferences,
      catalog: args.catalog,
      candidateDictionary: retrieval.candidateDictionary,
      requirementPools: retrieval.requirementPools,
      landPool: retrieval.landPool,
    });
    if (postCriticPreferenceRepair.repairs.length > 0) {
      deckForReview = postCriticPreferenceRepair.deck;
      const preferenceNormalized = normalizeDeckBeforeValidationV111({
        deck: deckForReview,
        contract: retrievalContract,
        landPool: retrieval.landPool,
        catalog: args.catalog,
        candidateDictionary: retrieval.candidateDictionary,
        requirementPools: retrieval.requirementPools,
        identityLedger: constructorIdentityLedger,
        prohibitedOracleIds: retrieval.prohibitedOracleIds,
      });
      deckForReview = preferenceNormalized.deck;
      validation = preferenceNormalized.validation;
      await appendSolDirectedBuildActivityV111({
        buildId: job.buildId,
        status: "CRITIC_REFINING",
        message: `Set-preference cuts: ${postCriticPreferenceRepair.repairs.slice(0, 3).join("; ")}${postCriticPreferenceRepair.repairs.length > 3 ? "…" : ""}`,
      });
    }

    const preGradeLandRepair = applyLandBaseRepairStepV111({
      deck: deckForReview,
      landPool: retrieval.landPool,
      contract: retrievalContract,
      catalog: args.catalog,
      identityLedger: constructorIdentityLedger,
      candidateDictionary: retrieval.candidateDictionary,
      requirementPools: retrieval.requirementPools,
      prohibitedOracleIds: retrieval.prohibitedOracleIds,
    });
    if (preGradeLandRepair.repairs.length > 0) {
      deckForReview = preGradeLandRepair.deck;
      validation = preGradeLandRepair.validation;
      await appendSolDirectedBuildActivityV111({
        buildId: job.buildId,
        status: "CRITIC_REFINING",
        message: `Land base tuned: ${preGradeLandRepair.repairs.slice(0, 3).join("; ")}${preGradeLandRepair.repairs.length > 3 ? "…" : ""}`,
      });
    }

    const swapLines = criticVerdict.appliedSwaps
      .slice(0, 4)
      .map((s) => `${s.cut} → ${s.add}`)
      .join("; ");
    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status: "CRITIC_REFINING",
      message:
        criticVerdict.appliedSwaps.length > 0
          ? `Critic applied ${criticVerdict.appliedSwaps.length} swap(s): ${swapLines}${criticVerdict.appliedSwaps.length > 4 ? "…" : ""}`
          : clipThought(criticVerdict.summary) || "Critic: deck looks solid — no swaps applied.",
    });

    if (modelCalls.length >= MAX_MODEL_CALLS) {
      return fail("MODEL_FAILURE", "Model call budget exhausted before Head Professor.");
    }

    await setStatus("HEAD_PROFESSOR_REVIEW");
    const deckPreferencesConstrained = isDeckPreferencesSetConstrained(userInputs.deckPreferences ?? "");
    let headProfessor = await runSolDirectedHeadProfessorWholeDeckV111({
      deck: deckForReview,
      architectRawPlan,
      retrievalContract,
      validation,
      commander,
      bracket: args.bracket,
      playstyle: userInputs.playstyle,
      deckTheme: userInputs.deckTheme || undefined,
      winPreference: userInputs.winPreference || undefined,
      commanderStyle: userInputs.commanderStyle,
      deckPreferences: userInputs.deckPreferences,
      catalog: args.catalog,
      onFeed: createSolDirectedAgentFeed({ buildId: job.buildId, status: "HEAD_PROFESSOR_REVIEW" }),
    });
    modelCalls.push(headProfessor.record);

    let professorRepairApplied = false;
    let professorRepairPass = 0;

    while (
      shouldRunProfessorRepairCriticV111(headProfessor.verdict) &&
      modelCalls.length < MAX_MODEL_CALLS &&
      professorRepairPass < MAX_PROFESSOR_REPAIR_PASSES
    ) {
      professorRepairPass += 1;
      const repairReason =
        headProfessor.verdict.requiredChanges.length > 0
          ? `${headProfessor.verdict.requiredChanges.length} required fix(es)`
          : `${headProfessor.verdict.classification} (${headProfessor.verdict.grade})`;
      await appendSolDirectedBuildActivityV111({
        buildId: job.buildId,
        status: "HEAD_PROFESSOR_REVIEW",
        message: `Professor flagged ${repairReason} — repair pass ${professorRepairPass}/${MAX_PROFESSOR_REPAIR_PASSES}…`,
      });

      const professorRepairFeed = createSolDirectedAgentFeed({
        buildId: job.buildId,
        status: "HEAD_PROFESSOR_REVIEW",
      });

      if (headProfessor.verdict.offPlanCards.length > 0 || headProfessor.verdict.requiredChanges.length > 0) {
        const offPlanRepair = repairOffPlanNonlandsV111({
          deck: deckForReview,
          offPlanCards: headProfessor.verdict.offPlanCards,
          requiredChanges: headProfessor.verdict.requiredChanges,
          candidateDictionary: retrieval.candidateDictionary,
          requirementPools: retrieval.requirementPools,
        });
        if (offPlanRepair.repairs.length > 0) {
          deckForReview = offPlanRepair.deck;
          professorRepairApplied = true;
          const offPlanNormalized = normalizeDeckBeforeValidationV111({
            deck: deckForReview,
            contract: retrievalContract,
            landPool: retrieval.landPool,
            catalog: args.catalog,
            candidateDictionary: retrieval.candidateDictionary,
            requirementPools: retrieval.requirementPools,
            identityLedger: constructorIdentityLedger,
            prohibitedOracleIds: retrieval.prohibitedOracleIds,
          });
          deckForReview = offPlanNormalized.deck;
          validation = offPlanNormalized.validation;
          await appendSolDirectedBuildActivityV111({
            buildId: job.buildId,
            status: "HEAD_PROFESSOR_REVIEW",
            message: `Off-plan cuts: ${offPlanRepair.repairs.slice(0, 3).join("; ")}${offPlanRepair.repairs.length > 3 ? "…" : ""}`,
          });
        }
      }

      const preferenceRepair = applyDeckPreferenceRepairsV111({
        deck: deckForReview,
        deckPreferences: userInputs.deckPreferences,
        catalog: args.catalog,
        candidateDictionary: retrieval.candidateDictionary,
        requirementPools: retrieval.requirementPools,
        landPool: retrieval.landPool,
      });
      if (preferenceRepair.repairs.length > 0) {
        deckForReview = preferenceRepair.deck;
        professorRepairApplied = true;
        const preferenceNormalized = normalizeDeckBeforeValidationV111({
          deck: deckForReview,
          contract: retrievalContract,
          landPool: retrieval.landPool,
          catalog: args.catalog,
          candidateDictionary: retrieval.candidateDictionary,
          requirementPools: retrieval.requirementPools,
          identityLedger: constructorIdentityLedger,
          prohibitedOracleIds: retrieval.prohibitedOracleIds,
        });
        deckForReview = preferenceNormalized.deck;
        validation = preferenceNormalized.validation;
        await appendSolDirectedBuildActivityV111({
          buildId: job.buildId,
          status: "HEAD_PROFESSOR_REVIEW",
          message: `Set-preference cuts: ${preferenceRepair.repairs.slice(0, 3).join("; ")}${preferenceRepair.repairs.length > 3 ? "…" : ""}`,
        });
      }

      const preRepairLand = applyLandBaseRepairStepV111({
        deck: deckForReview,
        landPool: retrieval.landPool,
        contract: retrievalContract,
        catalog: args.catalog,
        identityLedger: constructorIdentityLedger,
        candidateDictionary: retrieval.candidateDictionary,
        requirementPools: retrieval.requirementPools,
        prohibitedOracleIds: retrieval.prohibitedOracleIds,
        professorVerdict: headProfessor.verdict,
      });
      if (preRepairLand.repairs.length > 0) {
        deckForReview = preRepairLand.deck;
        validation = preRepairLand.validation;
        await appendSolDirectedBuildActivityV111({
          buildId: job.buildId,
          status: "HEAD_PROFESSOR_REVIEW",
          message: `Land repair: ${preRepairLand.repairs.slice(0, 3).join("; ")}${preRepairLand.repairs.length > 3 ? "…" : ""}`,
        });
      }

      if (modelCalls.length >= MAX_MODEL_CALLS) break;

      const repairCritic = await runSolDirectedCriticV111({
        deck: deckForReview,
        architectRawPlan,
        retrievalContract,
        candidateDictionary: retrieval.candidateDictionary,
        commander,
        bracket: args.bracket,
        playstyle: userInputs.playstyle,
        deckTheme: userInputs.deckTheme || undefined,
        winPreference: userInputs.winPreference || undefined,
        commanderStyle: userInputs.commanderStyle,
        deckPreferences: userInputs.deckPreferences,
        userSemanticPreferences: userInputs.userSemanticPreferences,
        semanticRoleAuditFlags: auditSemanticRoleAssignmentsV111({
          deck: deckForReview,
          candidateDictionary: retrieval.candidateDictionary,
        }),
        landPool: retrieval.landPool,
        maxSwaps: 16,
        repairContext: {
          requiredChanges: headProfessor.verdict.requiredChanges,
          offPlanCards: headProfessor.verdict.offPlanCards,
          professorSummary: headProfessor.verdict.reasoningSummary,
          priorGrade: headProfessor.verdict.grade,
          classification: headProfessor.verdict.classification,
        },
        onFeed: professorRepairFeed,
      });
      modelCalls.push(repairCritic.record);

      const repairApplied = applyCriticDeckIfValidV111({
        deck: repairCritic.refinedDeck,
        criticVerdict: repairCritic.verdict,
        fallbackDeck: deckForReview,
        catalog: args.catalog,
        contract: retrievalContract,
        candidateDictionary: retrieval.candidateDictionary,
        landPool: retrieval.landPool,
        requirementPools: retrieval.requirementPools,
        identityLedger: constructorIdentityLedger,
        prohibitedOracleIds: retrieval.prohibitedOracleIds,
        validation,
      });
      deckForReview = repairApplied.deck;
      criticVerdict = mergeCriticVerdictsV111(criticVerdict, repairApplied.criticVerdict);
      validation = repairApplied.validation;
      professorRepairApplied =
        professorRepairApplied || repairApplied.criticVerdict.appliedSwaps.length > 0;

      const repairSwapLines = repairApplied.criticVerdict.appliedSwaps
        .slice(0, 4)
        .map((s) => `${s.cut} → ${s.add}`)
        .join("; ");
      await appendSolDirectedBuildActivityV111({
        buildId: job.buildId,
        status: "HEAD_PROFESSOR_REVIEW",
        message:
          repairApplied.criticVerdict.appliedSwaps.length > 0
            ? `Repair applied ${repairApplied.criticVerdict.appliedSwaps.length} swap(s): ${repairSwapLines}${repairApplied.criticVerdict.appliedSwaps.length > 4 ? "…" : ""}`
            : clipThought(repairApplied.criticVerdict.summary) || "Repair pass: no swaps applied.",
      });

      const postRepairLand = applyLandBaseRepairStepV111({
        deck: deckForReview,
        landPool: retrieval.landPool,
        contract: retrievalContract,
        catalog: args.catalog,
        identityLedger: constructorIdentityLedger,
        candidateDictionary: retrieval.candidateDictionary,
        requirementPools: retrieval.requirementPools,
        prohibitedOracleIds: retrieval.prohibitedOracleIds,
        professorVerdict: headProfessor.verdict,
      });
      if (postRepairLand.repairs.length > 0) {
        deckForReview = postRepairLand.deck;
        validation = postRepairLand.validation;
        await appendSolDirectedBuildActivityV111({
          buildId: job.buildId,
          status: "HEAD_PROFESSOR_REVIEW",
          message: `Land base finalized: ${postRepairLand.repairs.slice(0, 3).join("; ")}${postRepairLand.repairs.length > 3 ? "…" : ""}`,
        });
      }

      if (modelCalls.length >= MAX_MODEL_CALLS) break;

      await setStatus("HEAD_PROFESSOR_REVIEW");
      headProfessor = await runSolDirectedHeadProfessorWholeDeckV111({
        deck: deckForReview,
        architectRawPlan,
        retrievalContract,
        validation,
        commander,
        bracket: args.bracket,
        playstyle: userInputs.playstyle,
        deckTheme: userInputs.deckTheme || undefined,
        winPreference: userInputs.winPreference || undefined,
        commanderStyle: userInputs.commanderStyle,
        deckPreferences: userInputs.deckPreferences,
        catalog: args.catalog,
        onFeed: createSolDirectedAgentFeed({ buildId: job.buildId, status: "HEAD_PROFESSOR_REVIEW" }),
      });
      modelCalls.push(headProfessor.record);

      if (isSolDirectedHeadProfessorShippableV111(headProfessor.verdict)) break;
    }

    if (!isSolDirectedHeadProfessorShippableV111(headProfessor.verdict)) {
      if (isLandBaseProfessorDefectV111(headProfessor.verdict)) {
        const lastChanceLand = applyLandBaseRepairStepV111({
          deck: deckForReview,
          landPool: retrieval.landPool,
          contract: retrievalContract,
          catalog: args.catalog,
          identityLedger: constructorIdentityLedger,
          candidateDictionary: retrieval.candidateDictionary,
          requirementPools: retrieval.requirementPools,
          prohibitedOracleIds: retrieval.prohibitedOracleIds,
          professorVerdict: headProfessor.verdict,
        });
        if (lastChanceLand.repairs.length > 0) {
          deckForReview = lastChanceLand.deck;
          validation = lastChanceLand.validation;
          await appendSolDirectedBuildActivityV111({
            buildId: job.buildId,
            status: "HEAD_PROFESSOR_REVIEW",
            message: `Final land repair: ${lastChanceLand.repairs.slice(0, 3).join("; ")}${lastChanceLand.repairs.length > 3 ? "…" : ""}`,
          });
          if (modelCalls.length < MAX_MODEL_CALLS) {
            await setStatus("HEAD_PROFESSOR_REVIEW");
            headProfessor = await runSolDirectedHeadProfessorWholeDeckV111({
              deck: deckForReview,
              architectRawPlan,
              retrievalContract,
              validation,
              commander,
              bracket: args.bracket,
              playstyle: userInputs.playstyle,
              deckTheme: userInputs.deckTheme || undefined,
              winPreference: userInputs.winPreference || undefined,
              commanderStyle: userInputs.commanderStyle,
              deckPreferences: userInputs.deckPreferences,
              catalog: args.catalog,
              onFeed: createSolDirectedAgentFeed({ buildId: job.buildId, status: "HEAD_PROFESSOR_REVIEW" }),
            });
            modelCalls.push(headProfessor.record);
          }
        }
      }

      if (!isSolDirectedHeadProfessorShippableV111(headProfessor.verdict)) {
        const bestEffortShip = isSolDirectedHeadProfessorBestEffortShippableV111(headProfessor.verdict, {
          repairPassesCompleted: professorRepairPass,
          maxRepairPasses: MAX_PROFESSOR_REPAIR_PASSES,
          validationPass: validation.pass,
          deckPreferencesConstrained,
        });

        if (bestEffortShip) {
          headProfessor = {
            ...headProfessor,
            verdict: prepareHeadProfessorVerdictForCustomerV111(headProfessor.verdict, true),
          };
          professorRepairApplied = true;
          await appendSolDirectedBuildActivityV111({
            buildId: job.buildId,
            status: "HEAD_PROFESSOR_REVIEW",
            message: `Professor graded ${headProfessorDisplayLetter(headProfessor.verdict.grade) ?? headProfessor.verdict.grade} — shipping best available deck after ${professorRepairPass} repair pass(es).`,
          });
        } else {
          const nonlandCount = deckForReview.nonlands.length;
          const landCount = deckForReview.lands.reduce((s, l) => s + l.copies, 0);
          return fail("CONSTRUCTION_DEFECT", formatHeadProfessorQualityFailureDetailV111(headProfessor.verdict), {
            architectPlan: architectRawPlan,
            retrievalSummary: {
              uniqueCandidateCount: retrieval.uniqueNonlandCount,
              requirementPoolCounts: Object.fromEntries(
                retrieval.requirementPools.map((p) => [p.requirementId, p.oracleIds.length]),
              ),
              supplyGatePass: supplyGate.pass,
            },
            constructedDeck: deckForReview,
            validation,
            retrievalContract,
            critic: criticVerdict,
            headProfessor: headProfessor.verdict,
            telemetryPatch: {
              candidateUniqueCount: retrieval.uniqueNonlandCount,
              nonlandCount,
              landCount,
            },
          });
        }
      }
    }

    // One validator over the build's context, so the terminal gate and anything
    // that mutates ahead of it cannot disagree about which cards are allowed.
    // It holds the candidate dictionary by reference, which is what lets the
    // bracket attainment pass register an addition and have it accepted.
    const deckValidator = createDeckValidatorV111({
      catalog: args.catalog,
      contract: retrievalContract,
      candidateDictionary: retrieval.candidateDictionary,
      landPool: retrieval.landPool,
      identityLedger: constructorIdentityLedger,
      prohibitedOracleIds: retrieval.prohibitedOracleIds,
    });

    // Last mutation before the terminal gate, deliberately. An earlier placement
    // measured a deck that later repair passes went on to change, so the pass
    // silently did nothing while the shipped deck stayed a bracket short. Here
    // it measures what actually ships, and nothing can undo it.
    if (isProfessorSolDirectedBracketAttainmentEnabled() && requestedBracket != null) {
      const attainment = await applyBracketAttainmentV111({
        deck: deckForReview,
        catalog: args.catalog,
        candidateDictionary: retrieval.candidateDictionary,
        requestedBracket,
        prohibitedOracleIds: retrieval.prohibitedOracleIds,
      });
      if (attainment.changes.length > 0) {
        deckForReview = attainment.deck;
        // Registered in place so every later consumer — validation, the proof
        // chain, the saved artifacts — sees the same allowed-card set. The
        // validator rejects any nonland missing from this dictionary.
        for (const [oracleId, facts] of Object.entries(attainment.candidateDictionary)) {
          retrieval.candidateDictionary[oracleId] = facts;
        }
        await appendSolDirectedBuildActivityV111({
          buildId: job.buildId,
          status: "CRITIC_REFINING",
          message: `Bracket ${requestedBracket} reached: ${attainment.changes.slice(0, 3).join("; ")}${attainment.changes.length > 3 ? "…" : ""}`,
        });
      } else if (attainment.outcome && !attainment.outcome.attained) {
        // A silent no-op is how the first live run hid a real placement bug.
        const why =
          attainment.skipped.join("; ") ||
          attainment.outcome.notes.join("; ") ||
          "no eligible swap was available";
        console.warn(
          `[bracket-attainment] measured ${attainment.outcome.measuredBefore.assignedBracket} against a request of ${requestedBracket} and changed nothing: ${why}`,
        );
      }
    }

    // The opposite correction, and mutually exclusive with the one above: a deck
    // is either under the requested bracket or over it, never both. Attainment
    // runs first so that if it overshoots, this pass sees the overshoot and
    // trims it, rather than the two passes disagreeing about the final deck.
    if (isProfessorSolDirectedBracketCeilingEnabled() && requestedBracket != null) {
      const ceiling = await applyBracketCeilingV111({
        deck: deckForReview,
        catalog: args.catalog,
        candidateDictionary: retrieval.candidateDictionary,
        requestedBracket,
      });
      if (ceiling.changes.length > 0) {
        // No dictionary registration: every replacement came from the dictionary.
        deckForReview = ceiling.deck;
        await appendSolDirectedBuildActivityV111({
          buildId: job.buildId,
          status: "CRITIC_REFINING",
          message: `Trimmed to bracket ${requestedBracket}: ${ceiling.changes.slice(0, 3).join("; ")}${ceiling.changes.length > 3 ? "…" : ""}`,
        });
      } else if (ceiling.outcome && !ceiling.outcome.contained) {
        const why =
          ceiling.skipped.join("; ") ||
          ceiling.outcome.notes.join("; ") ||
          "no eligible swap was available";
        console.warn(
          `[bracket-ceiling] measured ${ceiling.outcome.measuredBefore.assignedBracket} against a request of ${requestedBracket} and changed nothing: ${why}`,
        );
      }
    }

    const shippable = deckValidator.validate(deckForReview);
    validation = shippable.validation;
    if (!validation.pass) {
      const nonlandCount = shippable.deck.nonlands.length;
      const landCount = shippable.deck.lands.reduce((s, l) => s + l.copies, 0);
      return fail("VALIDATION_FAILED", validation.violations.join("; "), {
        architectPlan: architectRawPlan,
        retrievalSummary: {
          uniqueCandidateCount: retrieval.uniqueNonlandCount,
          requirementPoolCounts: Object.fromEntries(
            retrieval.requirementPools.map((p) => [p.requirementId, p.oracleIds.length]),
          ),
          supplyGatePass: supplyGate.pass,
        },
        constructedDeck: shippable.deck,
        validation,
        retrievalContract,
        critic: criticVerdict,
        headProfessor: headProfessor.verdict,
        telemetryPatch: {
          candidateUniqueCount: retrieval.uniqueNonlandCount,
          nonlandCount,
          landCount,
        },
      });
    }

    const proofChain = buildProofChainV111({
      buildInput: userInputs,
      architectRaw: architectRawPlan,
      retrievalContract,
      candidateDictionary: retrieval.candidateDictionary,
      constructorInput: {
        systemPrompt: bundle.systemPrompt,
        userPrompt: bundle.userPrompt,
      },
      constructorRaw: constructor.record.rawResponse,
      canonicalizedDeck: shippable.deck,
      validation,
      headProfessorInputDeck: shippable.deck,
      headProfessorResponse: headProfessor.verdict,
    });

    const nonlandCount = shippable.deck.nonlands.length;
    const landCount = shippable.deck.lands.reduce((s, l) => s + l.copies, 0);

    const deckEnrichmentPromise = enrichSolDirectedDeckForDisplayV111({
      storeSlug: args.storeSlug,
      deck: shippable.deck,
    });

    const result: SolDirectedBuildResultV111 = {
      buildId: job.buildId,
      status: "COMPLETE",
      commander,
      userInputs,
      architectPlan: architectRawPlan,
      retrievalSummary: {
        uniqueCandidateCount: retrieval.uniqueNonlandCount,
        requirementPoolCounts: Object.fromEntries(
          retrieval.requirementPools.map((p) => [p.requirementId, p.oracleIds.length]),
        ),
        supplyGatePass: supplyGate.pass,
      },
      constructedDeck: shippable.deck,
      validation,
      critic: criticVerdict,
      headProfessor: headProfessor.verdict,
      retrievalContract,
      professorRepairApplied,
      deckEnrichment: null,
      telemetry: {
        modelCallCount: modelCalls.length,
        architectTokens: sumTokens(modelCalls, "ARCHITECT"),
        constructorTokens: sumTokens(modelCalls, "CONSTRUCTOR"),
        criticTokens: sumTokensByPurposes(modelCalls, ["CRITIC", "REPAIR"]),
        headProfessorTokens: sumTokens(modelCalls, "HEAD_PROFESSOR"),
        latencyMsByStage,
        candidateUniqueCount: retrieval.uniqueNonlandCount,
        nonlandCount,
        landCount,
      },
      modelCalls,
      proofChain,
      failureCode: null,
      failureMessage: null,
    };

    await Promise.all([
      persistSolDirectedBuildArtifactsV111({
        buildId: job.buildId,
        artifacts: {
          "architect-prompt.json": {
            system: architect.record.systemPrompt,
            user: architect.record.userPrompt,
          },
          "architect-response.json": architectRawPlan,
          "retrieval-contract.json": retrievalContract,
          "candidate-dictionary.json": retrieval.candidateDictionary,
          "requirement-pools.json": retrieval.requirementPools,
          "land-pool.json": retrieval.landPool,
          "constructor-prompt.json": {
            system: bundle.systemPrompt,
            user: bundle.userPrompt,
          },
          "constructor-response.json": constructor.record.rawResponse,
          "canonicalized-deck.json": shippable.deck,
          "identity-resolution-ledger.json": constructor.identityLedger,
          "validation.json": validation,
          "critic-response.json": criticVerdict,
          "head-professor-prompt.json": {
            system: headProfessor.record.systemPrompt,
            user: headProfessor.record.userPrompt,
          },
          "head-professor-response.json": headProfessor.verdict,
          "proof-chain.json": proofChain,
        },
      }).catch((err) => {
        console.error("[sol-directed-build] artifact persistence failed:", err);
        return { storagePrefix: `deck-build-runs/${job.buildId}`, persisted: [] as string[] };
      }),
      deckEnrichmentPromise.catch((err) => {
        console.error("[sol-directed-build] deck enrichment failed:", err);
        return { imageUrls: {}, inventoryByName: {} };
      }),
    ]).then(([, deckEnrichment]) => {
      result.deckEnrichment = deckEnrichment;
    });

    await saveSolDirectedBuildResultV111({ job, result });
    await setStatus("COMPLETE");
    return result;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[sol-directed-build] build failed:", detail, err);
    return fail("MODEL_FAILURE", detail);
  }
}
