/**
 * Optimize an already-built Commander list: hydrate → retrieve upgrades → Critic → Head Professor.
 * Does not run Architect or Constructor as list authors. Does not optimize against COS.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { resolveCanonicalCardTruthV4164 } from "./professor-canonical-card-truth-v4-16-4-v1";
import { isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import {
  canonicalFactsFromOracleIdV111,
  hydrateProfessorImportedDeckV111,
} from "./professor-imported-deck-hydrate-v1-1-1";
import { buildImportedOptimizePlanV111 } from "./professor-imported-optimize-plan-v1-1-1";
import type { ProfessorImportedDeckCardV111 } from "./professor-imported-decklist-v1-1-1";
import { createSolDirectedAgentFeed } from "./professor-sol-directed-build-activity-v1-1-1";
import { persistSolDirectedBuildArtifactsV111 } from "./professor-sol-directed-build-artifacts-v1-1-1";
import { buildProofChainV111 } from "./professor-sol-directed-build-proof-v1-1-1";
import {
  appendSolDirectedBuildActivityV111,
  createSolDirectedBuildJobV111,
  saveSolDirectedBuildResultV111,
  updateSolDirectedBuildJobStatusV111,
} from "./professor-sol-directed-build-job-store-v1-1-1";
import {
  normalizeSolDirectedBuildUserInputsV111,
  SOL_DIRECTED_BUILD_FAILURE_MESSAGES,
  type SolDirectedBuildJobRecordV111,
  type SolDirectedBuildResultV111,
  type SolDirectedBuildStatusV111,
  type SolDirectedBuildUserInputsV111,
} from "./professor-sol-directed-build-types-v1-1-1";
import { runSolDirectedCriticV111, type SolDirectedCriticVerdictV111 } from "./professor-sol-directed-critic-v1-1-1";
import { enrichSolDirectedDeckForDisplayV111 } from "./professor-sol-directed-deck-enrichment-v1-1-1";
import {
  headProfessorDisplayLetter,
  isSolDirectedHeadProfessorBestEffortShippableV111,
  prepareHeadProfessorVerdictForCustomerV111,
} from "./professor-sol-directed-deck-grade-v1-1-1";
import {
  formatHeadProfessorQualityFailureDetailV111,
  isSolDirectedHeadProfessorShippableV111,
  runSolDirectedHeadProfessorWholeDeckV111,
  shouldRunProfessorRepairCriticV111,
} from "./professor-sol-directed-head-professor-v1-1-1";
import { validateSolDirectedDeckV111 } from "./professor-sol-directed-pre-head-professor-gate-v1-1-1";
import { runSolDirectedRetrievalV11 } from "./professor-sol-directed-retrieval-v1-1";
import { auditSemanticRoleAssignmentsV111 } from "./professor-semantic-role-audit-v1-1-1";
import { userSemanticPreferencesForPromptV111 } from "./professor-user-semantic-preferences-v1-1-1";
import type { IdentityResolutionLedgerEntryV111 } from "./professor-sol-directed-candidate-hydration-v1-1-1";
import type { SolDirectedModelCallRecordV1 } from "./professor-sol-directed-types-v1";
import type { CanonicalCardFactsV11, LandPoolV11, RetrievalResultV11 } from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_IMPORTED_OPTIMIZE_V1_1_1_VERSION =
  "professor-sol-directed-imported-optimize-v1-1-1";

export const SOL_DIRECTED_OPTIMIZE_STATUS_LABELS: Record<SolDirectedBuildStatusV111, string> = {
  CREATED: "Starting optimization…",
  ARCHITECTING: "Reading your list…",
  RETRIEVING_CANDIDATES: "Finding upgrade candidates…",
  CONSTRUCTING_DECK: "Loading your deck…",
  VALIDATING: "Checking Commander legality…",
  CRITIC_REFINING: "Tuning your list…",
  HEAD_PROFESSOR_REVIEW: "Professor is grading the optimized deck…",
  COMPLETE: "Optimization complete",
  FAILED: "Optimization failed",
};

const HARD_VALIDATION_PREFIXES = [
  "OFF_COLOR",
  "ILLEGAL",
  "UNRESOLVED",
  "MISSING_ORACLE",
  "DUPLICATES",
  "LAND_IN_NONLANDS",
  "NONLAND_IN_LANDS",
];

function isHardOptimizeViolation(violation: string): boolean {
  return HARD_VALIDATION_PREFIXES.some((prefix) => violation.startsWith(prefix));
}

function seedImportedCardsIntoRetrieval(args: {
  retrieval: RetrievalResultV11;
  deck: ReturnType<typeof hydrateProfessorImportedDeckV111>["deck"];
  catalog: DeckResolutionCatalog;
}): RetrievalResultV11 {
  const candidateDictionary: Record<string, CanonicalCardFactsV11> = { ...args.retrieval.candidateDictionary };
  const landPool: LandPoolV11 = {
    ...args.retrieval.landPool,
    entries: [...args.retrieval.landPool.entries],
    nonBasicOracleIds: [...args.retrieval.landPool.nonBasicOracleIds],
  };

  for (const card of args.deck.nonlands) {
    const facts = canonicalFactsFromOracleIdV111(card.oracleId, args.catalog);
    if (facts) candidateDictionary[facts.oracleId] = facts;
  }

  for (const land of args.deck.lands) {
    const truth = resolveCanonicalCardTruthV4164({ name: land.name, catalog: args.catalog });
    if (!truth.oracleId) continue;
    const facts = canonicalFactsFromOracleIdV111(truth.oracleId, args.catalog);
    if (facts) candidateDictionary[facts.oracleId] = facts;
    if (!landPool.entries.some((entry) => entry.oracleId === truth.oracleId)) {
      landPool.entries.push({
        name: truth.name,
        oracleId: truth.oracleId,
        isBasic: isBasicLandName(truth.name),
        basicKind: null,
        maxCopies: isBasicLandName(truth.name) ? 99 : 1,
        category: isBasicLandName(truth.name) ? "basic" : "other",
        resolved: true,
      });
    }
    if (!isBasicLandName(truth.name) && !landPool.nonBasicOracleIds.includes(truth.oracleId)) {
      landPool.nonBasicOracleIds.push(truth.oracleId);
    }
  }

  return { ...args.retrieval, candidateDictionary, landPool };
}

function importedIdentityLedger(
  deck: ReturnType<typeof hydrateProfessorImportedDeckV111>["deck"],
): IdentityResolutionLedgerEntryV111[] {
  return [
    ...deck.nonlands.map((card) => ({
      selectionName: card.name,
      resolvedOracleId: card.oracleId,
      resolvedName: card.name,
      resolutionSource: "CANDIDATE_DICTIONARY" as const,
      candidateRequirementIds: [card.primaryArchitectRequirement],
      primaryArchitectRequirement: card.primaryArchitectRequirement,
      error: null,
    })),
    ...deck.lands.map((land) => ({
      selectionName: land.name,
      resolvedOracleId: null,
      resolvedName: land.name,
      resolutionSource: "LAND_POOL" as const,
      candidateRequirementIds: [],
      primaryArchitectRequirement: null,
      error: null,
    })),
  ];
}

function userFacingOptimizeFailure(code: string, detail?: string): string {
  if (code === "IMPORT_UNRESOLVED") {
    return detail ?? "I couldn't recognize enough cards in this list to optimize it.";
  }
  if (code === "IMPORT_IDENTITY") {
    return detail ?? "This list has cards outside the commander's colors.";
  }
  const base = SOL_DIRECTED_BUILD_FAILURE_MESSAGES[code] ?? detail ?? "Professor couldn't finish this optimization.";
  return base;
}

function optimizeLiveEnabled(): boolean {
  return process.env.PROFESSOR_SOL_DIRECTED_LIVE === "1" && Boolean(process.env.OPENAI_API_KEY?.trim());
}

function sumTokens(calls: SolDirectedModelCallRecordV1[], purpose: SolDirectedModelCallRecordV1["purpose"]): number | null {
  const call = calls.find((c) => c.purpose === purpose);
  return call?.totalTokens ?? null;
}

export type RunSolDirectedImportedOptimizeArgs = {
  commanderOracleId: string;
  commanderName: string;
  bracket: number;
  playstyle: string;
  deckTheme?: string;
  winPreference?: string;
  commanderStyle: string;
  deckPreferences?: string;
  userSemanticPreferences?: SolDirectedBuildUserInputsV111["userSemanticPreferences"];
  budgetConstraints?: string[];
  inventoryConstraints?: string[];
  importedCards: ProfessorImportedDeckCardV111[];
  storeId: string;
  storeSlug: string;
  userId?: string | null;
  existingJob?: SolDirectedBuildJobRecordV111;
  catalog: DeckResolutionCatalog;
  p0TruthPass?: boolean;
};

export async function runSolDirectedImportedDeckOptimize(
  args: RunSolDirectedImportedOptimizeArgs,
): Promise<SolDirectedBuildResultV111> {
  const started = Date.now();
  const latencyMsByStage: Partial<Record<SolDirectedBuildStatusV111, number>> = {};
  const modelCalls: SolDirectedModelCallRecordV1[] = [];

  const userInputs = normalizeSolDirectedBuildUserInputsV111({
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
    mode: "optimize",
    importedCards: args.importedCards,
  });

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
    await updateSolDirectedBuildJobStatusV111({
      buildId: job.buildId,
      status,
      patch: { statusLabel: SOL_DIRECTED_OPTIMIZE_STATUS_LABELS[status] },
    });
    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status,
      message: thought ?? SOL_DIRECTED_OPTIMIZE_STATUS_LABELS[status],
    });
  };

  const emptyTelemetry = (patch?: { candidateUniqueCount?: number; nonlandCount?: number; landCount?: number }) => ({
    modelCallCount: modelCalls.length,
    architectTokens: null,
    constructorTokens: null,
    criticTokens: sumTokens(modelCalls, "CRITIC"),
    headProfessorTokens: sumTokens(modelCalls, "HEAD_PROFESSOR"),
    latencyMsByStage,
    candidateUniqueCount: patch?.candidateUniqueCount ?? null,
    nonlandCount: patch?.nonlandCount ?? null,
    landCount: patch?.landCount ?? null,
  });

  const fail = async (
    code: string,
    detail: string,
    extra: Partial<SolDirectedBuildResultV111> = {},
  ): Promise<SolDirectedBuildResultV111> => {
    const commander = extra.commander ?? {
      oracleId: args.commanderOracleId,
      name: args.commanderName,
      colorIdentity: [],
      manaValue: null,
      oracleText: "",
      semanticFunctions: [],
      mechanics: [],
      resourcesProduced: [],
      resourcesConsumed: [],
      triggeredEvents: [],
      zoneRelationships: [],
      exploitOpportunities: [],
      provenance: [],
    };
    const result: SolDirectedBuildResultV111 = {
      buildId: job.buildId,
      status: "FAILED",
      commander,
      userInputs,
      architectPlan: extra.architectPlan ?? null,
      retrievalSummary: extra.retrievalSummary ?? null,
      constructedDeck: extra.constructedDeck ?? null,
      validation: extra.validation ?? null,
      critic: extra.critic ?? null,
      headProfessor: extra.headProfessor ?? null,
      retrievalContract: extra.retrievalContract ?? null,
      telemetry: emptyTelemetry(),
      modelCalls,
      proofChain: buildProofChainV111({
        buildInput: userInputs,
        architectRaw: extra.architectPlan ?? null,
        retrievalContract: extra.retrievalContract ?? null,
        candidateDictionary: null,
        constructorInput: null,
        constructorRaw: null,
        canonicalizedDeck: extra.constructedDeck ?? null,
        validation: extra.validation ?? null,
        headProfessorInputDeck: extra.constructedDeck ?? null,
        headProfessorResponse: extra.headProfessor ?? null,
      }),
      failureCode: code,
      failureMessage: userFacingOptimizeFailure(code, detail),
    };
    await saveSolDirectedBuildResultV111({ job, result });
    await setStatus("FAILED");
    return result;
  };

  if (args.p0TruthPass === false) {
    return fail("P0_TRUTH_REGRESSIONS_NOT_PASSING", "P0 truth selftest did not pass.");
  }
  if (!optimizeLiveEnabled()) {
    return fail("MODEL_FAILURE", "Set PROFESSOR_SOL_DIRECTED_LIVE=1 and OPENAI_API_KEY for live builds.");
  }

  try {
    await setStatus("ARCHITECTING", "Reading your imported list…");
    const hydrated = hydrateProfessorImportedDeckV111({
      importedCards: args.importedCards,
      commanderName: args.commanderName,
      catalog: args.catalog,
      playstyle: args.playstyle,
      deckTheme: args.deckTheme,
    });
    if (hydrated.commander.oracleId !== args.commanderOracleId) {
      return fail("IMPORT_UNRESOLVED", `Commander mismatch for ${args.commanderName}.`);
    }
    if (!hydrated.preview.canOptimize) {
      const code = hydrated.preview.offColorNames.length ? "IMPORT_IDENTITY" : "IMPORT_UNRESOLVED";
      return fail(code, hydrated.preview.blockers.join(" "), {
        commander: hydrated.commander,
        constructedDeck: hydrated.deck,
      });
    }

    const { architectRawPlan, retrievalContract } = buildImportedOptimizePlanV111({
      deck: hydrated.deck,
      playstyle: args.playstyle,
      deckTheme: args.deckTheme,
      winPreference: args.winPreference,
      commanderStyle: args.commanderStyle,
      bracket: args.bracket,
    });

    await setStatus("RETRIEVING_CANDIDATES");
    const retrieval = seedImportedCardsIntoRetrieval({
      retrieval: runSolDirectedRetrievalV11({
        contract: retrievalContract,
        catalog: args.catalog,
        commander: hydrated.commander,
        deckPreferences: userInputs.deckPreferences,
        userSemanticPreferences: userInputs.userSemanticPreferences,
      }),
      deck: hydrated.deck,
      catalog: args.catalog,
    });

    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status: "RETRIEVING_CANDIDATES",
      message: `Upgrade pool ready — ${retrieval.uniqueNonlandCount} candidates around your ${hydrated.deck.nonlands.length} nonlands.`,
    });

    await setStatus("VALIDATING");
    const identityLedger = importedIdentityLedger(hydrated.deck);
    let validation = validateSolDirectedDeckV111({
      deck: hydrated.deck,
      catalog: args.catalog,
      contract: retrievalContract,
      candidateDictionary: retrieval.candidateDictionary,
      landPool: retrieval.landPool,
      identityLedger,
      prohibitedOracleIds: retrieval.prohibitedOracleIds,
    });
    const hardViolations = validation.violations.filter(isHardOptimizeViolation);
    if (hardViolations.length > 0) {
      return fail("VALIDATION_FAILED", hardViolations.join("; "), {
        commander: hydrated.commander,
        architectPlan: architectRawPlan,
        constructedDeck: hydrated.deck,
        validation,
        retrievalContract,
      });
    }

    await setStatus("CRITIC_REFINING");
    const semanticRoleAuditFlags = auditSemanticRoleAssignmentsV111({
      deck: hydrated.deck,
      candidateDictionary: retrieval.candidateDictionary,
    });
    const critic = await runSolDirectedCriticV111({
      deck: hydrated.deck,
      architectRawPlan,
      retrievalContract,
      candidateDictionary: retrieval.candidateDictionary,
      commander: hydrated.commander,
      bracket: args.bracket,
      playstyle: userInputs.playstyle,
      deckTheme: userInputs.deckTheme || undefined,
      winPreference: userInputs.winPreference || undefined,
      commanderStyle: userInputs.commanderStyle,
      deckPreferences: userInputs.deckPreferences,
      userSemanticPreferences: userInputs.userSemanticPreferences,
      semanticRoleAuditFlags,
      landPool: retrieval.landPool,
      maxSwaps: 12,
      optimizeExistingList: true,
      onFeed: createSolDirectedAgentFeed({ buildId: job.buildId, status: "CRITIC_REFINING" }),
    });
    modelCalls.push(critic.record);

    let deckForReview = critic.refinedDeck;
    let criticVerdict: SolDirectedCriticVerdictV111 = critic.verdict;
    validation = validateSolDirectedDeckV111({
      deck: deckForReview,
      catalog: args.catalog,
      contract: retrievalContract,
      candidateDictionary: retrieval.candidateDictionary,
      landPool: retrieval.landPool,
      identityLedger: importedIdentityLedger(deckForReview),
      prohibitedOracleIds: retrieval.prohibitedOracleIds,
    });
    if (validation.violations.filter(isHardOptimizeViolation).length > 0) {
      deckForReview = hydrated.deck;
      criticVerdict = {
        ...criticVerdict,
        appliedSwaps: [],
        rejectedSwaps: [
          ...criticVerdict.rejectedSwaps,
          ...criticVerdict.appliedSwaps.map((swap) => ({ swap, reason: "REVERTED_HARD_VALIDATION" })),
        ],
      };
      validation = validateSolDirectedDeckV111({
        deck: deckForReview,
        catalog: args.catalog,
        contract: retrievalContract,
        candidateDictionary: retrieval.candidateDictionary,
        landPool: retrieval.landPool,
        identityLedger,
        prohibitedOracleIds: retrieval.prohibitedOracleIds,
      });
    }

    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status: "CRITIC_REFINING",
      message:
        criticVerdict.appliedSwaps.length > 0
          ? `Applied ${criticVerdict.appliedSwaps.length} upgrade${criticVerdict.appliedSwaps.length === 1 ? "" : "s"} to your list.`
          : "No swaps applied — your list was already tight for this brief.",
    });

    await setStatus("HEAD_PROFESSOR_REVIEW");
    let headProfessor = await runSolDirectedHeadProfessorWholeDeckV111({
      deck: deckForReview,
      architectRawPlan,
      retrievalContract,
      validation,
      commander: hydrated.commander,
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
    if (shouldRunProfessorRepairCriticV111(headProfessor.verdict) && modelCalls.length < 8) {
      const repair = await runSolDirectedCriticV111({
        deck: deckForReview,
        architectRawPlan,
        retrievalContract,
        candidateDictionary: retrieval.candidateDictionary,
        commander: hydrated.commander,
        bracket: args.bracket,
        playstyle: userInputs.playstyle,
        deckTheme: userInputs.deckTheme || undefined,
        winPreference: userInputs.winPreference || undefined,
        commanderStyle: userInputs.commanderStyle,
        deckPreferences: userInputs.deckPreferences,
        userSemanticPreferences: userInputs.userSemanticPreferences,
        landPool: retrieval.landPool,
        optimizeExistingList: true,
        repairContext: {
          requiredChanges: headProfessor.verdict.requiredChanges,
          offPlanCards: headProfessor.verdict.offPlanCards,
          professorSummary: headProfessor.verdict.reasoningSummary,
          priorGrade: headProfessor.verdict.grade,
          classification: headProfessor.verdict.classification,
        },
        onFeed: createSolDirectedAgentFeed({ buildId: job.buildId, status: "HEAD_PROFESSOR_REVIEW" }),
      });
      modelCalls.push(repair.record);
      const repairedValidation = validateSolDirectedDeckV111({
        deck: repair.refinedDeck,
        catalog: args.catalog,
        contract: retrievalContract,
        candidateDictionary: retrieval.candidateDictionary,
        landPool: retrieval.landPool,
        identityLedger: importedIdentityLedger(repair.refinedDeck),
        prohibitedOracleIds: retrieval.prohibitedOracleIds,
      });
      if (repairedValidation.violations.filter(isHardOptimizeViolation).length === 0) {
        deckForReview = repair.refinedDeck;
        validation = repairedValidation;
        criticVerdict = {
          summary: `${criticVerdict.summary} Repair: ${repair.verdict.summary}`,
          proposedSwaps: [...criticVerdict.proposedSwaps, ...repair.verdict.proposedSwaps],
          appliedSwaps: [...criticVerdict.appliedSwaps, ...repair.verdict.appliedSwaps],
          rejectedSwaps: [...criticVerdict.rejectedSwaps, ...repair.verdict.rejectedSwaps],
        };
        professorRepairApplied = repair.verdict.appliedSwaps.length > 0;
        headProfessor = await runSolDirectedHeadProfessorWholeDeckV111({
          deck: deckForReview,
          architectRawPlan,
          retrievalContract,
          validation,
          commander: hydrated.commander,
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

    if (!isSolDirectedHeadProfessorShippableV111(headProfessor.verdict)) {
      const bestEffort = isSolDirectedHeadProfessorBestEffortShippableV111(headProfessor.verdict, {
        repairPassesCompleted: professorRepairApplied ? 1 : 0,
        maxRepairPasses: 1,
        validationPass: validation.violations.filter(isHardOptimizeViolation).length === 0,
        deckPreferencesConstrained: Boolean(userInputs.deckPreferences?.trim()),
      });
      if (bestEffort) {
        headProfessor = {
          ...headProfessor,
          verdict: prepareHeadProfessorVerdictForCustomerV111(headProfessor.verdict, true),
        };
        professorRepairApplied = true;
      } else {
        return fail("CONSTRUCTION_DEFECT", formatHeadProfessorQualityFailureDetailV111(headProfessor.verdict), {
          commander: hydrated.commander,
          architectPlan: architectRawPlan,
          constructedDeck: deckForReview,
          validation,
          retrievalContract,
          critic: criticVerdict,
          headProfessor: headProfessor.verdict,
        });
      }
    }

    const proofChain = buildProofChainV111({
      buildInput: userInputs,
      architectRaw: architectRawPlan,
      retrievalContract,
      candidateDictionary: retrieval.candidateDictionary,
      constructorInput: null,
      constructorRaw: null,
      canonicalizedDeck: deckForReview,
      validation,
      headProfessorInputDeck: deckForReview,
      headProfessorResponse: headProfessor.verdict,
    });

    const result: SolDirectedBuildResultV111 = {
      buildId: job.buildId,
      status: "COMPLETE",
      commander: hydrated.commander,
      userInputs,
      architectPlan: architectRawPlan,
      retrievalSummary: {
        uniqueCandidateCount: retrieval.uniqueNonlandCount,
        requirementPoolCounts: Object.fromEntries(
          retrieval.requirementPools.map((pool) => [pool.requirementId, pool.oracleIds.length]),
        ),
        supplyGatePass: true,
      },
      constructedDeck: deckForReview,
      validation,
      critic: criticVerdict,
      headProfessor: headProfessor.verdict,
      retrievalContract,
      professorRepairApplied,
      deckEnrichment: null,
      telemetry: {
        ...emptyTelemetry({
          candidateUniqueCount: retrieval.uniqueNonlandCount,
          nonlandCount: deckForReview.nonlands.length,
          landCount: deckForReview.lands.reduce((sum, land) => sum + land.copies, 0),
        }),
        modelCallCount: modelCalls.length,
      },
      modelCalls,
      proofChain,
      failureCode: null,
      failureMessage: null,
    };

    const deckEnrichmentPromise = enrichSolDirectedDeckForDisplayV111({
      storeSlug: args.storeSlug,
      deck: deckForReview,
    });
    await Promise.all([
      persistSolDirectedBuildArtifactsV111({
        buildId: job.buildId,
        artifacts: {
          "retrieval-contract.json": retrievalContract,
          "canonicalized-deck.json": deckForReview,
          "validation.json": validation,
          "critic-response.json": criticVerdict,
          "head-professor-response.json": headProfessor.verdict,
          "proof-chain.json": proofChain,
        },
      }).catch((err) => {
        console.error("[sol-directed-optimize] artifact persistence failed:", err);
        return { storagePrefix: `deck-build-runs/${job.buildId}`, persisted: [] as string[] };
      }),
      deckEnrichmentPromise.catch((err) => {
        console.error("[sol-directed-optimize] deck enrichment failed:", err);
        return { imageUrls: {}, inventoryByName: {}, tcgPricesByName: {} };
      }),
    ]).then(([, deckEnrichment]) => {
      result.deckEnrichment = deckEnrichment;
    });

    await saveSolDirectedBuildResultV111({ job, result });
    await setStatus("COMPLETE");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown optimize failure";
    console.error("[sol-directed-optimize] failed:", err);
    return fail("MODEL_FAILURE", message);
  }
}
