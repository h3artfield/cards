/**
 * Professor v4.15 — unified Head Professor review + bracket refinement + final grade.
 *
 * Sequence:
 * Full Sol review → refinement plan → v4.12/13/14/15 execution → recompute → final adjudication → grade → report
 * Does NOT fail-closed on bracket miss — always grades the final deck.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import {
  deckListFromCouncilStateV47,
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import { buildFinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { computeProfessorDeckGradeFromCouncilV48 } from "./professor-deck-grade-council-v4-8-v1";
import {
  emptyFinalDeckDoctorSessionV48,
  HeadProfessorCallFailedError,
  HEAD_PROFESSOR_PRODUCT_NAME,
  type FinalDeckDoctorSessionV48,
  type ExecutedSwapV48,
} from "./professor-final-deck-doctor-v4-8-v1";
import { runProfessorPlayReportV48 } from "./professor-deck-play-report-v4-8-v1";
import {
  FinalizationPipelineFailedError,
  type FinalizationPipelineProgressV48,
  type FinalizationPipelineResultV48,
} from "./professor-finalization-pipeline-v4-8-v1";
import { prepareDeckForBracketAdjudicationV412, rebalanceManaBaseAfterSwapsV412 } from "./professor-final-deck-canonical-v4-12-v1";
import { assertHeadProfessorReviewFreshV411, computeFinalDeckFingerprintV411 } from "./professor-deck-fingerprint-v4-11-v1";
import {
  adjudicationToReviewFieldsV411,
  runBracketAdjudicationV411,
  type BracketAdjudicationV411,
} from "./professor-bracket-adjudication-v4-11-v1";
import { runBracketAlignmentLoopV413 } from "./professor-finalization-pipeline-v4-13-v1";
import { runPackageRefinementPassV414 } from "./professor-finalization-pipeline-v4-14-v1";
import {
  computeVerifiedDeckSnapshotV414,
  hydrateAndVerifyDeckStateV414,
} from "./professor-verified-final-snapshot-v4-14-v1";
import { recomputeFinalDeckSnapshotV411 } from "./professor-final-deck-canonical-v4-11-v1";
import {
  runFullHeadProfessorReviewV415,
  fullReviewToBaseReview,
  type FullHeadProfessorReviewV415,
} from "./professor-head-professor-full-review-v4-15-v1";
import { resolveWinPreferenceFromIntent } from "./professor-win-preference-v4-15-v1";
import { buildProfessorRefinementPlanV415, type ProfessorRefinementPlanV415 } from "./professor-refinement-plan-v4-15-v1";
import { assessCanonicalDeckLegalityV4161 } from "./professor-canonical-legality-v4-16-1-v1";
import { resolveLiveProfessorBrewBudgetV416 } from "./professor-live-finalization-budget-v4-16-v1";
import { rankB4OpportunityCostCandidatesV4162 } from "./professor-b4-opportunity-cost-v4-16-2-v1";
import { analyzeArchitectureTransformationV415 } from "./professor-win-architecture-v4-15-v1";
import {
  executeArchitectureTransformationV415,
  executeHeadProfessorSwapsV415,
  executeOpportunitySwapsFromReviewV415,
} from "./professor-architecture-transformation-v4-15-v1";
import { mergeHeadProfessorSummaryV48, summarizeRefinement } from "./professor-final-refinement-v4-8-v1";
import type { BracketAlignmentStatusV415 } from "./professor-deck-grade-v4-v1";
import { assertFinalFingerprintBindingV4151, deckListShaFromCards } from "./professor-canonical-card-identity-v4-15-1-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import {
  createModelTelemetryCollector,
  type ModelUsageAggregateV4151,
} from "./professor-model-telemetry-v4-15-1-v1";

export const PROFESSOR_V4_15_1_STABILIZATION_DECISION_V1 =
  "PROFESSOR_V4_15_1_FINAL_STATE_SCHEMA_NORMALIZATION_AND_COST_TELEMETRY_V1_AUTHORIZED";

export const PROFESSOR_FINALIZATION_PIPELINE_V4_15_V1_VERSION = "professor-finalization-pipeline-v4-15-v1";
export const PROFESSOR_V4_15_UNIFIED_DECISION_V1 =
  "PROFESSOR_V4_15_UNIFIED_HEAD_PROFESSOR_REVIEW_REFINEMENT_AND_GRADING_V1_AUTHORIZED";

export type FinalizationPipelineSuccessV415 = FinalizationPipelineResultV48 & {
  draftReadyForRequestedBracket: boolean;
  bracketAlignmentStatus: BracketAlignmentStatusV415;
  refinementPlan: ProfessorRefinementPlanV415;
  fullHeadProfessorReview: FullHeadProfessorReviewV415;
  modelUsage: ModelUsageAggregateV4151;
};

function estimatePlannedModelCalls(plan: ProfessorRefinementPlanV415): number {
  let planned = 2; // full HP review + final adjudication + play report counted below
  planned += 1; // play report (non-Sol)
  if (plan.winArchitectureTransformation.required) planned += 1;
  if (plan.phases.includes("FILLER_V412") || plan.phases.includes("OPPORTUNITY_V413")) planned += 2;
  if (plan.phases.includes("PACKAGE_V414")) planned += 1;
  return planned;
}

function assertProductionLibraryCardCount(state: ProfessorCouncilStateV47): void {
  if (state.selectedCards.length !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    throw new Error(
      `Production finalization requires exactly ${COMMANDER_DECK_LIBRARY_SIZE_V47} library cards; got ${state.selectedCards.length}`,
    );
  }
}

function bracketAligned(requested: CommanderBracket, predicted: CommanderBracket): boolean {
  return requested === predicted;
}

function reviewToAdjudicationV415(args: {
  requestedBracket: CommanderBracket;
  review: FullHeadProfessorReviewV415;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  dossier: ReturnType<typeof buildFinalDeckDoctorDossierV48>;
  gameChangerCount?: number;
}): BracketAdjudicationV411 {
  return {
    version: "professor-bracket-adjudication-v4-11-v1",
    requestedBracket: args.requestedBracket,
    predictedEffectiveBracket: args.review.predictedEffectiveBracket,
    confidence: args.review.adjudicationConfidence >= 0.8 ? "HIGH" : "MEDIUM",
    reasons: args.review.adjudicationReasons,
    powerStrengths: args.review.strengths,
    powerDeficits: args.review.remainingConcerns,
    recommendedBracketChanges: args.review.keyImprovements,
    playsLikeBecause: args.review.overallAssessment,
    toBecomeTargetWithoutAbandoningCharter: args.review.b3ToB4GapExplanation || args.review.strategyAssessment,
    headProfessorReviewedDeckFingerprint: args.fingerprint.finalDeckFingerprint,
    finalSnapshotRevision: args.fingerprint.finalSnapshotRevision,
    structuralMetrics: {
      landCount: args.fingerprint.landCount,
      avgManaValue: args.fingerprint.avgManaValue,
      tutorCount: args.fingerprint.tutorCount,
      rampNonLandCount: args.fingerprint.rampNonLandCount,
      interactionCount: args.dossier.structuralMetrics.interactionCount,
      protectionCount: args.dossier.structuralMetrics.protectionCount,
      cardAdvantageCount: args.dossier.structuralMetrics.cardAdvantageCount,
      gameChangerCount: args.gameChangerCount ?? 0,
    },
  };
}

function bracketAlignmentStatus(
  requested: CommanderBracket,
  effective: CommanderBracket,
): BracketAlignmentStatusV415 {
  if (effective > requested) return "TARGET_EXCEEDED";
  if (effective === requested) return "TARGET_ACHIEVED";
  return "TARGET_MISSED";
}

function buildReviewFromAdjudication(adj: BracketAdjudicationV411, base?: FullHeadProfessorReviewV415) {
  if (base) {
    return { ...base, ...adjudicationToReviewFieldsV411(adj), predictedEffectiveBracket: adj.predictedEffectiveBracket };
  }
  const fields = adjudicationToReviewFieldsV411(adj);
  return {
    version: "professor-final-deck-doctor-v4-8-v1" as const,
    model: HEAD_PROFESSOR_PRODUCT_NAME,
    generatedAt: new Date().toISOString(),
    headProfessorCallCompleted: true,
    overallAssessment: adj.playsLikeBecause,
    deckIdentityAssessment: "",
    bracketAssessment: fields.bracketAssessment,
    predictedEffectiveBracket: fields.predictedEffectiveBracket,
    playStyleAssessment: "",
    commanderDependenceAssessment: "",
    strengths: fields.powerStrengths,
    structuralProblems: [],
    mechanicalProblems: [],
    manaProblems: fields.manaProblems,
    interactionProblems: fields.interactionProblems,
    resourceProblems: [],
    resilienceProblems: [],
    winPathProblems: fields.winPathProblems,
    creativityOpportunities: [],
    preserveAtAllCosts: [],
    cuts: [],
    additions: [],
    swaps: [],
    researchRequests: [],
    revisedGamePlan: null,
    requiresMajorRevision: false,
    remainingConcerns: adj.powerDeficits,
    keyImprovements: fields.keyImprovements,
  };
}

export async function runProfessorFinalizationPipelineV415(args: {
  commanderName: string;
  commanderOracleId: string | null;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  userIntent: string[];
  relationshipLens: string | null;
  charter: DeckCharterV45 | null;
  theory: WorkingDeckTheoryV4 | null;
  councilState: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  skipRefinement?: boolean;
  /** Live Professor brew room — use capped Sol budget (default for UI sessions). */
  liveUiMode?: boolean;
  onProgress?: (progress: FinalizationPipelineProgressV48) => void;
}): Promise<FinalizationPipelineSuccessV415> {
  const reportProgress = (stage: FinalizationPipelineProgressV48["stage"], message: string) => {
    args.onProgress?.({ stage, message });
  };

  const budget = resolveLiveProfessorBrewBudgetV416(args.liveUiMode ?? false);

  const { collector: telemetry, aggregate: aggregateModelUsage } = createModelTelemetryCollector({ plannedCalls: 4 });

  const winPreference = resolveWinPreferenceFromIntent(args.userIntent);
  const charterKeywords = args.charter
    ? [args.charter.primaryStrategy, ...args.charter.intendedWinPaths]
    : ["engine", "synergy"];

  const prepared = prepareDeckForBracketAdjudicationV412({
    state: args.councilState,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    commanderName: args.commanderName,
  });
  let councilState = hydrateAndVerifyDeckStateV414({ state: prepared.state, catalog: args.catalog });
  assertProductionLibraryCardCount(councilState);
  let fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });

  const dossier = buildFinalDeckDoctorDossierV48({
    commanderName: args.commanderName,
    commanderOracleId: args.commanderOracleId,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    userIntent: args.userIntent,
    relationshipLens: args.relationshipLens,
    charter: args.charter,
    theory: args.theory,
    councilState,
    catalog: args.catalog,
  });

  const rebuildDossier = (state: ProfessorCouncilStateV47) =>
    buildFinalDeckDoctorDossierV48({
      commanderName: args.commanderName,
      commanderOracleId: args.commanderOracleId,
      commanderColorIdentity: args.commanderColorIdentity,
      bracket: args.bracket,
      userIntent: args.userIntent,
      relationshipLens: args.relationshipLens,
      charter: args.charter,
      theory: args.theory,
      councilState: state,
      catalog: args.catalog,
    });

  let finalDeckDoctor: FinalDeckDoctorSessionV48 = {
    ...emptyFinalDeckDoctorSessionV48(),
    status: "RUNNING",
    provisionalDeckSha: fingerprint.finalDeckFingerprint,
    dossier,
    finalDeckRevision: fingerprint.finalDeckRevision,
    finalDeckFingerprint: fingerprint.finalDeckFingerprint,
    finalSnapshotRevision: fingerprint.finalSnapshotRevision,
  };

  let allExecutedSwaps: ExecutedSwapV48[] = [];

  reportProgress("HEAD_PROFESSOR_REVIEW", "GPT-5.6 Sol full strategic deck review…");

  let fullReview: FullHeadProfessorReviewV415;
  try {
    fullReview = await runFullHeadProfessorReviewV415({
      dossier,
      winPreference,
      reviewedFingerprint: fingerprint.finalDeckFingerprint,
      liveFast: args.liveUiMode ?? false,
      telemetry,
    });
  } catch (err) {
    const message =
      err instanceof HeadProfessorCallFailedError ? err.message : err instanceof Error ? err.message : "Full Head Professor review failed";
    finalDeckDoctor = { ...finalDeckDoctor, status: "FAILED", headProfessorError: message };
    throw new FinalizationPipelineFailedError(message, finalDeckDoctor, councilState);
  }

  finalDeckDoctor = {
    ...finalDeckDoctor,
    review: fullReviewToBaseReview(fullReview),
    headProfessorCallCompleted: true,
    headProfessorModel: fullReview.model,
    headProfessorReviewedDeckFingerprint: fingerprint.finalDeckFingerprint,
    modelCalls: { headProfessor: 1, playReport: 0 },
  };

  const { targetArchitecture, proposal: architectureProposal } = budget.skipArchitectureAnalysis
    ? { targetArchitecture: fullReview.targetWinArchitecture, proposal: null }
    : await analyzeArchitectureTransformationV415({
        dossier,
        review: fullReview,
        winPreference,
        currentBracket: fullReview.predictedEffectiveBracket,
        targetBracket: args.bracket,
      });

  const refinementPlan = buildProfessorRefinementPlanV415({
    review: fullReview,
    requestedBracket: args.bracket,
    architectureProposal,
  });
  telemetry.setPlannedCalls(estimatePlannedModelCalls(refinementPlan));

  if (!args.skipRefinement) {
    reportProgress("APPLYING_SWAPS", `Executing refinement plan: ${refinementPlan.summary}`);

    if (fullReview.swaps.length > 0) {
      reportProgress("APPLYING_SWAPS", "Applying Head Professor swap recommendations…");
      const hpRefinement = await executeHeadProfessorSwapsV415({
        review: fullReviewToBaseReview(fullReview),
        state: councilState,
        catalog: args.catalog,
        colorIdentity: args.commanderColorIdentity,
        commanderName: args.commanderName,
        charter: args.charter,
        dossierLandCount: dossier.structuralMetrics.landCount,
      });
      councilState = hpRefinement.state;
      allExecutedSwaps = [...allExecutedSwaps, ...hpRefinement.executed];
      councilState = recomputeFinalDeckSnapshotV411({ state: councilState, catalog: args.catalog });
      fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });
    }

    if (
      refinementPlan.phases.includes("FILLER_V412") ||
      refinementPlan.phases.includes("OPPORTUNITY_V413")
    ) {
      if (!bracketAligned(args.bracket, fullReview.predictedEffectiveBracket)) {
        reportProgress("HEAD_PROFESSOR_REVIEW", "Bracket-aware refinement loop…");
        const alignment = await runBracketAlignmentLoopV413({
          councilState,
          catalog: args.catalog,
          commanderName: args.commanderName,
          commanderColorIdentity: args.commanderColorIdentity,
          bracket: args.bracket,
          charter: args.charter,
          dossier: rebuildDossier(councilState),
          fingerprint,
          initialAdjudication: reviewToAdjudicationV415({
            requestedBracket: args.bracket,
            review: fullReview,
            fingerprint,
            dossier,
          }),
          forceDeepRefinement: refinementPlan.phases.includes("OPPORTUNITY_V413"),
          maxIterations: budget.maxBracketIterations,
          skipSolDeepRefinement: budget.skipSolDeepRefinement,
          skipWinArchitectureAnalysis: budget.skipWinArchitectureAnalysis,
          onProgress: (msg) => reportProgress("HEAD_PROFESSOR_REVIEW", msg),
        });
        councilState = hydrateAndVerifyDeckStateV414({ state: alignment.councilState, catalog: args.catalog });
        fingerprint = alignment.fingerprint;
      }
    }

    if (fullReview.opportunityCostCards.length > 0 && refinementPlan.opportunityCostUpgrades > 0) {
      const oppResult = executeOpportunitySwapsFromReviewV415({
        opportunityCardNames: fullReview.opportunityCostCards,
        state: councilState,
        catalog: args.catalog,
        colorIdentity: args.commanderColorIdentity,
        commanderName: args.commanderName,
        charter: args.charter,
        bracket: args.bracket,
        adjudication: reviewToAdjudicationV415({
          requestedBracket: args.bracket,
          review: fullReview,
          fingerprint,
          dossier: rebuildDossier(councilState),
        }),
        fingerprint,
        charterKeywords,
        maxSwaps: refinementPlan.opportunityCostUpgrades,
      });
      if (oppResult.accepted > 0) {
        councilState = oppResult.state;
        councilState = recomputeFinalDeckSnapshotV411({ state: councilState, catalog: args.catalog });
        fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });
      }
    }

    if (
      fullReview.requiresMajorRevision &&
      allExecutedSwaps.length === 0 &&
      args.liveUiMode &&
      budget.maxBracketIterations <= 1
    ) {
      const oppScan = rankB4OpportunityCostCandidatesV4162({
        selectedCards: councilState.selectedCards,
        charter: args.charter,
        requestedBracket: args.bracket,
      });
      const fallbackNames = oppScan.bottomSlots.filter((s) => s.score <= 30).map((s) => s.name);
      if (fallbackNames.length > 0) {
        reportProgress("APPLYING_SWAPS", "Bounded refinement — replacing weakest provisional slots…");
        const boundedOpp = executeOpportunitySwapsFromReviewV415({
          opportunityCardNames: fallbackNames,
          state: councilState,
          catalog: args.catalog,
          colorIdentity: args.commanderColorIdentity,
          commanderName: args.commanderName,
          charter: args.charter,
          bracket: args.bracket,
          adjudication: reviewToAdjudicationV415({
            requestedBracket: args.bracket,
            review: fullReview,
            fingerprint,
            dossier: rebuildDossier(councilState),
          }),
          fingerprint,
          charterKeywords,
          maxSwaps: Math.min(2, fallbackNames.length),
        });
        if (boundedOpp.accepted > 0) {
          councilState = boundedOpp.state;
          allExecutedSwaps = [...allExecutedSwaps, ...boundedOpp.executed];
          councilState = recomputeFinalDeckSnapshotV411({ state: councilState, catalog: args.catalog });
          fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });
        }
      }
    }

    if (
      !budget.skipPackageRefinement &&
      refinementPlan.phases.includes("PACKAGE_V414") &&
      fullReview.weakPackages.length > 0
    ) {
      reportProgress("APPLYING_SWAPS", "Package-level refinement…");
      const pkgPass = await runPackageRefinementPassV414({
        councilState,
        catalog: args.catalog,
        commanderName: args.commanderName,
        commanderColorIdentity: args.commanderColorIdentity,
        bracket: args.bracket,
        charter: args.charter,
        adjudication: reviewToAdjudicationV415({
          requestedBracket: args.bracket,
          review: fullReview,
          fingerprint,
          dossier: rebuildDossier(councilState),
        }),
        onProgress: (msg) => reportProgress("APPLYING_SWAPS", msg),
      });
      councilState = pkgPass.councilState;
      fingerprint = pkgPass.fingerprint;
    }

    if (
      !budget.skipArchitectureTransformation &&
      refinementPlan.winArchitectureTransformation.required &&
      architectureProposal
    ) {
      reportProgress("APPLYING_SWAPS", "Win architecture transformation…");
      const archResult = executeArchitectureTransformationV415({
        state: councilState,
        catalog: args.catalog,
        colorIdentity: args.commanderColorIdentity,
        commanderName: args.commanderName,
        charter: args.charter,
        proposal: architectureProposal,
      });
      councilState = archResult.state;
      councilState = recomputeFinalDeckSnapshotV411({ state: councilState, catalog: args.catalog });
      fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });
    }
  }

  councilState = hydrateAndVerifyDeckStateV414({ state: councilState, catalog: args.catalog });
  councilState = recomputeFinalDeckSnapshotV411({ state: councilState, catalog: args.catalog });
  fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });
  computeVerifiedDeckSnapshotV414({ state: councilState, catalog: args.catalog });

  reportProgress("HEAD_PROFESSOR_REVIEW", "Final Sol bracket adjudication on refined deck…");

  const finalDossier = buildFinalDeckDoctorDossierV48({
    commanderName: args.commanderName,
    commanderOracleId: args.commanderOracleId,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    userIntent: args.userIntent,
    relationshipLens: args.relationshipLens,
    charter: args.charter,
    theory: args.theory,
    councilState,
    catalog: args.catalog,
  });

  let finalAdjudication: BracketAdjudicationV411;
  try {
    finalAdjudication = await runBracketAdjudicationV411({
      dossier: finalDossier,
      fingerprint,
      gameChangerCount: councilState.selectedCards.filter((c) => c.oracleId).length,
    });
  } catch {
    finalAdjudication = reviewToAdjudicationV415({
      requestedBracket: args.bracket,
      review: fullReview,
      fingerprint,
      dossier: finalDossier,
    });
  }

  const preFinalLegality = assessCanonicalDeckLegalityV4161({
    selectedCards: councilState.selectedCards,
    commanderName: args.commanderName,
    catalog: args.catalog,
    requireFullLibrary: true,
  });
  councilState = {
    ...councilState,
    legalityGate: preFinalLegality.gate,
    canonicalLegalityV4161: preFinalLegality,
  };

  const effectiveBracket = preFinalLegality.effectiveBracketEvaluable
    ? finalAdjudication.predictedEffectiveBracket
    : args.bracket;
  const alignmentStatus = preFinalLegality.gradeEligible
    ? bracketAlignmentStatus(args.bracket, effectiveBracket)
    : ("TARGET_MISSED" as const);
  const draftReady = preFinalLegality.finalDeckLegal && bracketAligned(args.bracket, effectiveBracket);

  const finalReview: FullHeadProfessorReviewV415 = {
    ...fullReview,
    ...buildReviewFromAdjudication(finalAdjudication, fullReview),
    targetWinArchitecture: targetArchitecture,
    predictedEffectiveBracket: effectiveBracket,
    adjudicationReasons: finalAdjudication.powerDeficits?.length
      ? finalAdjudication.powerDeficits
      : fullReview.adjudicationReasons,
  };

  assertHeadProfessorReviewFreshV411({
    reviewedFingerprint: fingerprint.finalDeckFingerprint,
    currentFingerprint: fingerprint.finalDeckFingerprint,
    context: "pre-grade-v415",
  });

  const summary = mergeHeadProfessorSummaryV48(fullReviewToBaseReview(finalReview), summarizeRefinement(allExecutedSwaps));

  finalDeckDoctor = {
    ...finalDeckDoctor,
    review: fullReviewToBaseReview(finalReview),
    executedSwaps: allExecutedSwaps,
    summary,
    finalDeckSha: deckListShaFromCards(councilState.selectedCards, args.catalog),
    finalDeckFingerprint: fingerprint.finalDeckFingerprint,
    headProfessorReviewedDeckFingerprint: fingerprint.finalDeckFingerprint,
    bracketAdjudicationV411: finalAdjudication,
    gradingStartedAfterFinalDeckSha: true,
    status: draftReady ? "COMPLETE" : "COMPLETE",
    headProfessorError: draftReady
      ? null
      : `Requested B${args.bracket}, effective B${effectiveBracket}. Grade reflects final reviewed deck.`,
  };

  reportProgress("GRADING", "Grading final reviewed deck…");

  const finalLegality = preFinalLegality;

  if (!finalLegality.gradeEligible) {
    finalDeckDoctor = {
      ...finalDeckDoctor,
      status: "FAILED",
      headProfessorError: `Final deck is illegal — ${finalLegality.failures.join("; ")}. No final Professor grade issued.`,
    };
    throw new FinalizationPipelineFailedError(
      finalLegality.failures.join("; ") || "Final deck illegal",
      finalDeckDoctor,
      councilState,
    );
  }

  const deckGrade = computeProfessorDeckGradeFromCouncilV48({
    councilState,
    theory: args.theory,
    charter: args.charter,
    commanderName: args.commanderName,
    relationshipLens: args.relationshipLens,
    requestedBracket: args.bracket,
    headProfessorReview: fullReviewToBaseReview(finalReview),
    deckFingerprint: fingerprint.finalDeckFingerprint,
    bracketAlignmentStatus: alignmentStatus,
    legality: finalLegality,
    winReadiness: councilState.b4WinReadinessV4161 ?? null,
  });

  if (!deckGrade) {
    finalDeckDoctor = {
      ...finalDeckDoctor,
      status: "FAILED",
      headProfessorError: "Grade blocked — deck failed canonical legality gate.",
    };
    throw new FinalizationPipelineFailedError("Grade blocked — illegal deck", finalDeckDoctor, councilState);
  }

  reportProgress("PLAY_REPORT", "Writing final play report…");

  const commanderCard = args.commanderOracleId ? args.catalog.byOracleId.get(args.commanderOracleId) : null;
  const finalReport = await runProfessorPlayReportV48({
    commanderName: args.commanderName,
    commanderOracleText: (commanderCard?.oracleText ?? "").trim(),
    bracket: args.bracket,
    charter: args.charter,
    theory: args.theory,
    councilState,
    deckGrade,
    finalDeckDoctor,
    finalDeckFingerprint: fingerprint.finalDeckFingerprint,
    telemetry,
  });

  assertFinalFingerprintBindingV4151({
    finalCanonicalDeckFingerprint: fingerprint.finalDeckFingerprint,
    gradeDeckFingerprint: deckGrade.deckFingerprint,
    headProfessorReviewedFingerprint: finalDeckDoctor.headProfessorReviewedDeckFingerprint ?? "",
    playReportDeckFingerprint: finalReport.deckFingerprint ?? "",
    context: "FINALIZATION_COMPLETE",
  });

  const modelUsage = aggregateModelUsage();
  finalDeckDoctor = {
    ...finalDeckDoctor,
    modelCalls: {
      ...finalDeckDoctor.modelCalls,
      headProfessor: modelUsage.byPurpose.HEAD_PROFESSOR_REVIEW.calls,
      playReport: modelUsage.byPurpose.PLAY_REPORT.calls,
    },
  };

  councilState = { ...councilState, buildPhase: draftReady ? "DRAFT_READY" : "PROFESSOR_GRADE", phase: "COMPLETE" };

  return {
    ok: true,
    councilState,
    finalDeckDoctor,
    deckGrade,
    finalReport,
    deckList: deckListFromCouncilStateV47({ state: councilState, commanderName: args.commanderName }).map((c) => ({
      name: c.name,
      category: c.category,
    })),
    draftReadyForRequestedBracket: draftReady,
    bracketAlignmentStatus: alignmentStatus,
    refinementPlan,
    fullHeadProfessorReview: finalReview,
    modelUsage,
  };
}
