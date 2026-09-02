/**
 * Professor v4.13 — deficit-driven deep refinement pipeline.
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
  deckListSha,
  emptyFinalDeckDoctorSessionV48,
  HeadProfessorCallFailedError,
  HEAD_PROFESSOR_PRODUCT_NAME,
  type FinalDeckDoctorSessionV48,
  type FinalDeckDoctorReviewV48,
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
import { runBracketDragSlotAnalysisV412 } from "./professor-bracket-drag-analysis-v4-12-v1";
import {
  hasObviousFillerInDeckV412,
  resolveActiveDragSlotsV412,
  type BracketDragSlotV412,
} from "./professor-bracket-drag-slot-v4-12-v1";
import { getLegalRelevantGameChangersV411 } from "./professor-game-changer-discovery-v4-11-v1";
import { mapGameChangersToDragSlotsV412 } from "./professor-game-changer-slot-mapping-v4-12-v1";
import {
  buildSwapProposalsForSlotsV412,
  discoverTutorsForMissionV412,
  executeBracketUpgradeSwapsV412,
} from "./professor-bracket-upgrade-swap-v4-12-v1";
import { gameChangerOracleIdSet, loadCommanderGameChangerSnapshot } from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { deriveDeficitPortfolioV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import { runDeepRefinementAnalysisV413 } from "./professor-bracket-deep-refinement-v4-13-v1";
import { auditDeckTutorsV413 } from "./professor-tutor-audit-v4-13-v1";
import { analyzeWinArchitectureV413 } from "./professor-win-architecture-v4-13-v1";
import { buildDeepRefinementSwapProposalsV413 } from "./professor-deep-refinement-swap-v4-13-v1";
import type { OpportunityCostSlotV413 } from "./professor-opportunity-cost-slot-v4-13-v1";
import {
  buildBracketUpgradeMissionV412,
  buildMetricSnapshotV412,
  type BracketUpgradeMissionV412,
} from "./professor-bracket-upgrade-mission-v4-12-v1";
import {
  MAX_BRACKET_UPGRADE_ITERATIONS_V413,
  upgradeMissionToV413,
  type BracketUpgradeMissionV413,
} from "./professor-bracket-upgrade-mission-v4-13-v1";

export const PROFESSOR_FINALIZATION_PIPELINE_V4_13_V1_VERSION = "professor-finalization-pipeline-v4-13-v1";

function countGameChangers(selected: ProfessorCouncilStateV47["selectedCards"]): number {
  const gcIds = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  return selected.filter((c) => c.oracleId && gcIds.has(c.oracleId)).length;
}

function bracketAligned(requested: CommanderBracket, predicted: CommanderBracket): boolean {
  return requested === predicted;
}

function buildMinimalReviewFromAdjudication(adj: BracketAdjudicationV411): FinalDeckDoctorReviewV48 {
  const fields = adjudicationToReviewFieldsV411(adj);
  return {
    version: "professor-final-deck-doctor-v4-8-v1",
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

function oppSlotToDragSlot(slot: OpportunityCostSlotV413): BracketDragSlotV412 {
  return {
    version: "professor-bracket-drag-slot-v4-12-v1",
    dragSlotId: slot.slotId,
    cardId: slot.cardId,
    oracleId: slot.oracleId,
    cardName: slot.cardName,
    dragReason: slot.whyInsufficientAtTargetBracket,
    priority: slot.opportunityCost >= 60 ? "HIGH" : slot.opportunityCost >= 40 ? "MEDIUM" : "LOW",
    roleCurrentlyFilled: slot.currentRoles,
    rolesThatMustBePreserved: slot.uniqueFunction ? slot.currentRoles.slice(0, 2) : [],
    desiredReplacementRole: slot.desiredReplacementRole,
    bracketDeficitAddressed: [slot.upgradeCategory],
    reservedForMission: true,
  };
}

export async function runBracketAlignmentLoopV413(args: {
  councilState: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  commanderName: string;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  dossier: ReturnType<typeof buildFinalDeckDoctorDossierV48>;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  initialAdjudication: BracketAdjudicationV411;
  startIteration?: number;
  maxIterations?: number;
  forceDeepRefinement?: boolean;
  skipSolDeepRefinement?: boolean;
  skipWinArchitectureAnalysis?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<{
  councilState: ProfessorCouncilStateV47;
  adjudication: BracketAdjudicationV411;
  missions: BracketUpgradeMissionV413[];
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
}> {
  let councilState = args.councilState;
  let fingerprint = args.fingerprint;
  let adjudication = args.initialAdjudication;
  const missions: BracketUpgradeMissionV413[] = [];

  const maxIter = args.maxIterations ?? MAX_BRACKET_UPGRADE_ITERATIONS_V413;
  const startIter = args.startIteration ?? 1;

  if (startIter === 1 && bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)) {
    return { councilState, adjudication, missions, fingerprint };
  }

  const charterKeywords = args.charter
    ? [args.charter.primaryStrategy, ...args.charter.intendedWinPaths]
    : ["sacrifice", "token", "engine"];

  for (let iter = startIter; iter <= maxIter; iter++) {
    args.onProgress?.(`Bracket upgrade iteration ${iter}/${maxIter}…`);

    const currentDossier = buildFinalDeckDoctorDossierV48({
      commanderName: args.commanderName,
      commanderOracleId: null,
      commanderColorIdentity: args.commanderColorIdentity,
      bracket: args.bracket,
      userIntent: [],
      relationshipLens: null,
      charter: args.charter,
      theory: null,
      councilState,
      catalog: args.catalog,
    });

    const portfolio = deriveDeficitPortfolioV413({
      currentBracket: adjudication.predictedEffectiveBracket,
      targetBracket: args.bracket,
      adjudication,
      fingerprint,
    });

    const useFillerDrag =
      !args.forceDeepRefinement && iter === 1 && hasObviousFillerInDeckV412(councilState.selectedCards);

    let baseMission: BracketUpgradeMissionV412;
    let proposals: import("./professor-bracket-upgrade-swap-v4-12-v1").BracketUpgradeSwapProposalV412[] = [];
    let slotsById = new Map<string, BracketDragSlotV412>();
    let missionExtras: Partial<BracketUpgradeMissionV413> = { deficitPortfolio: portfolio };
    const beforeMetrics = buildMetricSnapshotV412({ fingerprint, adjudication });

    if (useFillerDrag) {
      args.onProgress?.("Iteration 1 — filler drag slot analysis…");
      const rawDragSlots = await runBracketDragSlotAnalysisV412({
        dossier: currentDossier,
        selectedCards: councilState.selectedCards,
        requestedBracket: args.bracket,
        predictedBracket: adjudication.predictedEffectiveBracket,
        missionType: "UPGRADE",
      });
      const dragSlots = resolveActiveDragSlotsV412({
        slots: rawDragSlots,
        selectedCards: councilState.selectedCards,
        unresolvedDeficits: portfolio.activeCategories,
      });

      const excludeNames = new Set(councilState.selectedCards.map((c) => c.name.toLowerCase()));
      const tutorCandidates = discoverTutorsForMissionV412({
        catalog: args.catalog,
        colorIdentity: args.commanderColorIdentity,
        excludeNames,
        bracket: args.bracket,
        charterKeywords,
      });
      const rawGameChangers = getLegalRelevantGameChangersV411({
        catalog: args.catalog,
        colorIdentity: args.commanderColorIdentity,
        bracket: args.bracket,
        charter: args.charter,
        deckNeeds: councilState.deckNeeds,
        selectedCards: councilState.selectedCards,
        powerPlan: councilState.bracketPowerPlanV410 ?? null,
      });
      const gameChangers = mapGameChangersToDragSlotsV412({
        gameChangers: rawGameChangers,
        dragSlots,
        charterPrimaryStrategy: args.charter?.primaryStrategy,
      });

      baseMission = buildBracketUpgradeMissionV412({
        missionId: `bracket-mission-v413-${fingerprint.finalDeckFingerprint}-${iter}`,
        sourceDeckFingerprint: fingerprint.finalDeckFingerprint,
        requestedBracket: args.bracket,
        adjudication,
        bracketGap: null,
        deckNeeds: councilState.deckNeeds,
        dragSlots,
        tutorCandidates,
        gameChangers,
        beforeMetrics,
        powerPlan: councilState.bracketPowerPlanV410 ?? null,
        iteration: iter,
      });

      proposals = buildSwapProposalsForSlotsV412({
        slots: dragSlots,
        selectedCards: councilState.selectedCards,
        catalog: args.catalog,
        colorIdentity: args.commanderColorIdentity,
        bracket: args.bracket,
        charterKeywords,
        powerPlan: councilState.bracketPowerPlanV410 ?? null,
        gameChangers,
      });
      slotsById = new Map(dragSlots.map((s) => [s.dragSlotId, s]));
      missionExtras = { ...missionExtras, refinementMode: "FILLER_DRAG" };
    } else {
      args.onProgress?.("Deep refinement — deficit portfolio + opportunity cost analysis…");

      const deepAnalysis = await runDeepRefinementAnalysisV413({
        dossier: currentDossier,
        selectedCards: councilState.selectedCards,
        catalog: args.catalog,
        requestedBracket: args.bracket,
        predictedBracket: adjudication.predictedEffectiveBracket,
        activeCategories: portfolio.activeCategories,
        tutorCount: fingerprint.tutorCount,
        skipSolCall: args.skipSolDeepRefinement,
      });

      portfolio.deficits.forEach((d) => {
        const solMatch = deepAnalysis.remainingBracketDeficits.find((s) => s.category === d.category);
        if (solMatch && d.severity !== "SATISFIED") {
          d.evidence = solMatch.explanation;
          d.desiredState = solMatch.desiredImprovement;
        }
      });

      const tutorAudits = auditDeckTutorsV413({
        selectedCards: councilState.selectedCards,
        catalog: args.catalog,
      });

      const winArchitecture = args.skipWinArchitectureAnalysis
        ? null
        : await analyzeWinArchitectureV413({
            dossier: currentDossier,
            currentBracket: adjudication.predictedEffectiveBracket,
            targetBracket: args.bracket,
          });

      baseMission = buildBracketUpgradeMissionV412({
        missionId: `bracket-mission-v413-${fingerprint.finalDeckFingerprint}-${iter}`,
        sourceDeckFingerprint: fingerprint.finalDeckFingerprint,
        requestedBracket: args.bracket,
        adjudication,
        bracketGap: null,
        deckNeeds: councilState.deckNeeds,
        dragSlots: [],
        tutorCandidates: [],
        gameChangers: [],
        beforeMetrics,
        powerPlan: councilState.bracketPowerPlanV410 ?? null,
        iteration: iter,
      });

      proposals = buildDeepRefinementSwapProposalsV413({
        opportunitySlots: deepAnalysis.opportunityCostSlots,
        selectedCards: councilState.selectedCards,
        catalog: args.catalog,
        colorIdentity: args.commanderColorIdentity,
        bracket: args.bracket,
        charterKeywords,
        portfolio,
        tutorAudits,
      });

      slotsById = new Map(deepAnalysis.opportunityCostSlots.map((s) => [s.slotId, oppSlotToDragSlot(s)]));
      missionExtras = {
        ...missionExtras,
        refinementMode: args.forceDeepRefinement ? "OPPORTUNITY_COST" : deepAnalysis.refinementMode,
        remainingBracketDeficits: deepAnalysis.remainingBracketDeficits,
        opportunityCostSlots: deepAnalysis.opportunityCostSlots,
        packageDrag: deepAnalysis.packageDrag,
        tutorAudits,
        winArchitecture,
      };
    }

    let mission = upgradeMissionToV413(
      { ...baseMission, proposedSwaps: proposals, status: proposals.length > 0 ? "SWAPPING" : "BRACKET_TARGET_UNRESOLVED" },
      missionExtras,
    );

    if (proposals.length === 0) {
      missions.push(mission);
      break;
    }

    args.onProgress?.(`Executing ${proposals.length} paired swaps…`);
    const batch = executeBracketUpgradeSwapsV412({
      state: councilState,
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      commanderName: args.commanderName,
      charter: args.charter,
      proposals,
      slotsById,
    });

    councilState = batch.state;
    mission = upgradeMissionToV413({
      ...mission,
      acceptedSwaps: batch.accepted,
      rejectedSwaps: batch.rejected,
    });

    if (batch.accepted.length === 0) {
      mission = { ...mission, status: "BRACKET_TARGET_UNRESOLVED" };
      missions.push(mission);
      break;
    }

    args.onProgress?.(`Executed ${batch.accepted.length} swaps — mana rebalance after strategic cuts…`);
    const rebalanced = rebalanceManaBaseAfterSwapsV412({
      state: councilState,
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      commanderName: args.commanderName,
    });
    councilState = rebalanced.state;
    fingerprint = rebalanced.fingerprint;

    args.onProgress?.("Sol re-adjudication on mutated deck…");
    const newDossier = buildFinalDeckDoctorDossierV48({
      commanderName: args.commanderName,
      commanderOracleId: null,
      commanderColorIdentity: args.commanderColorIdentity,
      bracket: args.bracket,
      userIntent: [],
      relationshipLens: null,
      charter: args.charter,
      theory: null,
      councilState,
      catalog: args.catalog,
    });

    adjudication = await runBracketAdjudicationV411({
      dossier: newDossier,
      fingerprint,
      gameChangerCount: countGameChangers(councilState.selectedCards),
    });

    mission = upgradeMissionToV413({
      ...mission,
      afterMetrics: buildMetricSnapshotV412({ fingerprint, adjudication }),
      status: bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)
        ? "ALIGNED"
        : iter >= maxIter
          ? "BRACKET_TARGET_UNRESOLVED"
          : "RE_ADJUDICATING",
    });
    missions.push(mission);

    if (bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)) break;
  }

  return { councilState, adjudication, missions, fingerprint };
}

export async function runProfessorFinalizationPipelineV413(args: Parameters<typeof import("./professor-finalization-pipeline-v4-12-v1").runProfessorFinalizationPipelineV412>[0]): Promise<FinalizationPipelineResultV48> {
  const reportProgress = (stage: FinalizationPipelineProgressV48["stage"], message: string) => {
    args.onProgress?.({ stage, message });
  };

  const prepared = prepareDeckForBracketAdjudicationV412({
    state: args.councilState,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    commanderName: args.commanderName,
  });
  let councilState = prepared.state;
  let fingerprint = prepared.fingerprint;

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

  let finalDeckDoctor: FinalDeckDoctorSessionV48 = {
    ...emptyFinalDeckDoctorSessionV48(),
    status: "RUNNING",
    provisionalDeckSha: fingerprint.finalDeckFingerprint,
    dossier,
    finalDeckRevision: fingerprint.finalDeckRevision,
    finalDeckFingerprint: fingerprint.finalDeckFingerprint,
    finalSnapshotRevision: fingerprint.finalSnapshotRevision,
  };

  reportProgress("HEAD_PROFESSOR_REVIEW", "GPT-5.6 Sol bracket adjudication…");

  let bracketAdjudication: BracketAdjudicationV411;
  try {
    bracketAdjudication = await runBracketAdjudicationV411({
      dossier,
      fingerprint,
      gameChangerCount: countGameChangers(councilState.selectedCards),
    });
  } catch (err) {
    const message = err instanceof HeadProfessorCallFailedError ? err.message : err instanceof Error ? err.message : "Bracket adjudication failed";
    finalDeckDoctor = { ...finalDeckDoctor, status: "FAILED", headProfessorError: message };
    throw new FinalizationPipelineFailedError(message, finalDeckDoctor, councilState);
  }

  finalDeckDoctor = {
    ...finalDeckDoctor,
    headProfessorReviewedDeckFingerprint: bracketAdjudication.headProfessorReviewedDeckFingerprint,
    bracketAdjudicationV411: bracketAdjudication,
    review: buildMinimalReviewFromAdjudication(bracketAdjudication),
    headProfessorCallCompleted: true,
    headProfessorModel: HEAD_PROFESSOR_PRODUCT_NAME,
  };

  if (!args.skipUpgradeLoop && !bracketAligned(args.bracket, bracketAdjudication.predictedEffectiveBracket)) {
    reportProgress("HEAD_PROFESSOR_REVIEW", "v4.13 deficit-driven upgrade mission…");
    const alignment = await runBracketAlignmentLoopV413({
      councilState,
      catalog: args.catalog,
      commanderName: args.commanderName,
      commanderColorIdentity: args.commanderColorIdentity,
      bracket: args.bracket,
      charter: args.charter,
      dossier,
      fingerprint,
      initialAdjudication: bracketAdjudication,
      onProgress: (msg) => reportProgress("HEAD_PROFESSOR_REVIEW", msg),
    });
    councilState = alignment.councilState;
    fingerprint = alignment.fingerprint;
    bracketAdjudication = alignment.adjudication;
    finalDeckDoctor = {
      ...finalDeckDoctor,
      headProfessorReviewedDeckFingerprint: bracketAdjudication.headProfessorReviewedDeckFingerprint,
      bracketAdjudicationV411: bracketAdjudication,
      review: buildMinimalReviewFromAdjudication(bracketAdjudication),
      finalDeckFingerprint: fingerprint.finalDeckFingerprint,
    };
  }

  if (!bracketAligned(args.bracket, bracketAdjudication.predictedEffectiveBracket)) {
    finalDeckDoctor = {
      ...finalDeckDoctor,
      status: "FAILED",
      headProfessorError: `Bracket target miss — requested B${args.bracket}, effective B${bracketAdjudication.predictedEffectiveBracket}`,
    };
    throw new FinalizationPipelineFailedError(finalDeckDoctor.headProfessorError!, finalDeckDoctor, councilState);
  }

  assertHeadProfessorReviewFreshV411({
    reviewedFingerprint: finalDeckDoctor.headProfessorReviewedDeckFingerprint,
    currentFingerprint: fingerprint.finalDeckFingerprint,
    context: "pre-grade",
  });

  const deckGrade = computeProfessorDeckGradeFromCouncilV48({
    councilState,
    theory: args.theory,
    charter: args.charter,
    commanderName: args.commanderName,
    relationshipLens: args.relationshipLens,
    requestedBracket: args.bracket,
    headProfessorReview: finalDeckDoctor.review!,
  });

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
  });

  councilState = { ...councilState, buildPhase: "DRAFT_READY", phase: "COMPLETE" };

  return {
    ok: true,
    councilState,
    finalDeckDoctor: { ...finalDeckDoctor, status: "COMPLETE", finalDeckSha: deckListSha(councilState.selectedCards.map((c) => c.name)) },
    deckGrade,
    finalReport,
    deckList: deckListFromCouncilStateV47({ state: councilState, commanderName: args.commanderName }).map((c) => ({
      name: c.name,
      category: c.category,
    })),
  };
}

/** Run iteration-2 deep refinement only from B3 post-v4.12 deck. */
export async function runStandaloneDeepRefinementV413(args: {
  commanderName: string;
  commanderOracleId: string | null;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  councilState: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  onProgress?: (msg: string) => void;
}): Promise<{
  councilState: ProfessorCouncilStateV47;
  mission: BracketUpgradeMissionV413;
  adjudication: BracketAdjudicationV411;
  initialAdjudication: BracketAdjudicationV411;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  initialFingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
}> {
  const prepared = prepareDeckForBracketAdjudicationV412({
    state: args.councilState,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    commanderName: args.commanderName,
  });

  const dossier = buildFinalDeckDoctorDossierV48({
    commanderName: args.commanderName,
    commanderOracleId: args.commanderOracleId,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    userIntent: [],
    relationshipLens: null,
    charter: args.charter,
    theory: null,
    councilState: prepared.state,
    catalog: args.catalog,
  });

  const initialAdjudication = await runBracketAdjudicationV411({
    dossier,
    fingerprint: prepared.fingerprint,
    gameChangerCount: countGameChangers(prepared.state.selectedCards),
  });

  const alignment = await runBracketAlignmentLoopV413({
    councilState: prepared.state,
    catalog: args.catalog,
    commanderName: args.commanderName,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    charter: args.charter,
    dossier,
    fingerprint: prepared.fingerprint,
    initialAdjudication,
    startIteration: 1,
    maxIterations: 1,
    forceDeepRefinement: true,
    onProgress: args.onProgress,
  });

  const mission = alignment.missions[0] ?? upgradeMissionToV413(
    buildBracketUpgradeMissionV412({
      missionId: "empty",
      sourceDeckFingerprint: prepared.fingerprint.finalDeckFingerprint,
      requestedBracket: args.bracket,
      adjudication: initialAdjudication,
      bracketGap: null,
      deckNeeds: [],
      dragSlots: [],
      tutorCandidates: [],
      gameChangers: [],
      beforeMetrics: buildMetricSnapshotV412({ fingerprint: prepared.fingerprint, adjudication: initialAdjudication }),
      powerPlan: null,
    }),
    {},
  );

  return {
    councilState: alignment.councilState,
    mission,
    adjudication: alignment.adjudication,
    initialAdjudication,
    fingerprint: alignment.fingerprint,
    initialFingerprint: prepared.fingerprint,
  };
}

export { FinalizationPipelineFailedError } from "./professor-finalization-pipeline-v4-8-v1";
