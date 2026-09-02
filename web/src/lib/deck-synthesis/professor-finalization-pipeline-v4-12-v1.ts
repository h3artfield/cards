/**
 * Professor v4.12 finalization pipeline — drag-before-rebalance swap execution loop.
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
import {
  prepareDeckForBracketAdjudicationV412,
  rebalanceManaBaseAfterSwapsV412,
} from "./professor-final-deck-canonical-v4-12-v1";
import {
  assertHeadProfessorReviewFreshV411,
  computeFinalDeckFingerprintV411,
} from "./professor-deck-fingerprint-v4-11-v1";
import {
  adjudicationToReviewFieldsV411,
  runBracketAdjudicationV411,
  type BracketAdjudicationV411,
} from "./professor-bracket-adjudication-v4-11-v1";
import {
  buildBracketUpgradeMissionV412,
  buildMetricSnapshotV412,
  MAX_BRACKET_UPGRADE_ITERATIONS_V412,
  type BracketUpgradeMissionV412,
} from "./professor-bracket-upgrade-mission-v4-12-v1";
import { runBracketDragSlotAnalysisV412 } from "./professor-bracket-drag-analysis-v4-12-v1";
import { resolveActiveDragSlotsV412 } from "./professor-bracket-drag-slot-v4-12-v1";
import { getLegalRelevantGameChangersV411 } from "./professor-game-changer-discovery-v4-11-v1";
import { mapGameChangersToDragSlotsV412 } from "./professor-game-changer-slot-mapping-v4-12-v1";
import {
  buildSwapProposalsForSlotsV412,
  discoverTutorsForMissionV412,
  executeBracketUpgradeSwapsV412,
} from "./professor-bracket-upgrade-swap-v4-12-v1";
import { gameChangerOracleIdSet, loadCommanderGameChangerSnapshot } from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";

export const PROFESSOR_FINALIZATION_PIPELINE_V4_12_V1_VERSION = "professor-finalization-pipeline-v4-12-v1";

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
    strengths: fields.strengths,
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

export async function runBracketAlignmentLoopV412(args: {
  councilState: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  commanderName: string;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  dossier: ReturnType<typeof buildFinalDeckDoctorDossierV48>;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  initialAdjudication: BracketAdjudicationV411;
  onProgress?: (msg: string) => void;
}): Promise<{
  councilState: ProfessorCouncilStateV47;
  adjudication: BracketAdjudicationV411;
  missions: BracketUpgradeMissionV412[];
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
}> {
  let councilState = args.councilState;
  let fingerprint = args.fingerprint;
  let adjudication = args.initialAdjudication;
  const missions: BracketUpgradeMissionV412[] = [];

  if (bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)) {
    return { councilState, adjudication, missions, fingerprint };
  }

  const charterKeywords = args.charter
    ? [args.charter.primaryStrategy, ...args.charter.intendedWinPaths]
    : ["sacrifice", "token", "engine"];

  for (let iter = 1; iter <= MAX_BRACKET_UPGRADE_ITERATIONS_V412; iter++) {
    args.onProgress?.(`Bracket upgrade iteration ${iter}/${MAX_BRACKET_UPGRADE_ITERATIONS_V412}…`);

    const currentDossier =
      iter === 1
        ? args.dossier
        : buildFinalDeckDoctorDossierV48({
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

    args.onProgress?.("Sol bracket drag slot analysis…");
    const rawDragSlots = await runBracketDragSlotAnalysisV412({
      dossier: currentDossier,
      selectedCards: councilState.selectedCards,
      requestedBracket: args.bracket,
      predictedBracket: adjudication.predictedEffectiveBracket,
      missionType: adjudication.predictedEffectiveBracket > args.bracket ? "DOWNGRADE" : "UPGRADE",
    });

    const unresolvedDeficits = adjudication.powerDeficits.filter((d) =>
      /tutor|access|acceler|interaction|protection|filler|slow|win|game changer/i.test(d),
    );
    const dragSlots = resolveActiveDragSlotsV412({
      slots: rawDragSlots,
      selectedCards: councilState.selectedCards,
      unresolvedDeficits,
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

    const beforeMetrics = buildMetricSnapshotV412({ fingerprint, adjudication });

    let mission = buildBracketUpgradeMissionV412({
      missionId: `bracket-mission-v412-${fingerprint.finalDeckFingerprint}-${iter}`,
      sourceDeckFingerprint: fingerprint.finalDeckFingerprint,
      requestedBracket: args.bracket,
      adjudication,
      bracketGap:
        (councilState.snapshots[councilState.snapshots.length - 1]?.bracketGapAnalysis as import("./professor-bracket-gap-analysis-v4-10-v1").BracketGapAnalysisV410 | null) ??
        null,
      deckNeeds: councilState.deckNeeds,
      dragSlots,
      tutorCandidates,
      gameChangers,
      beforeMetrics,
      powerPlan: councilState.bracketPowerPlanV410 ?? null,
      iteration: iter,
    });
    mission = { ...mission, status: "RESEARCHING" };

    args.onProgress?.(`Building paired swap proposals for ${dragSlots.length} drag slots…`);
    const proposals = buildSwapProposalsForSlotsV412({
      slots: dragSlots,
      selectedCards: councilState.selectedCards,
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      bracket: args.bracket,
      charterKeywords,
      powerPlan: councilState.bracketPowerPlanV410 ?? null,
      gameChangers,
    });

    mission = { ...mission, proposedSwaps: proposals, status: "SWAPPING" };

    if (proposals.length === 0) {
      mission = { ...mission, status: "BRACKET_TARGET_UNRESOLVED" };
      missions.push(mission);
      break;
    }

    const slotsById = new Map(dragSlots.map((s) => [s.dragSlotId, s]));
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
    mission = {
      ...mission,
      acceptedSwaps: batch.accepted,
      rejectedSwaps: batch.rejected,
    };

    if (batch.accepted.length === 0) {
      mission = { ...mission, status: "BRACKET_TARGET_UNRESOLVED" };
      missions.push(mission);
      break;
    }

    args.onProgress?.(`Executed ${batch.accepted.length} swaps — rebalance mana AFTER strategic cuts…`);
    mission = { ...mission, status: "MANA_REBALANCE" };
    const rebalanced = rebalanceManaBaseAfterSwapsV412({
      state: councilState,
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      commanderName: args.commanderName,
    });
    councilState = rebalanced.state;
    fingerprint = rebalanced.fingerprint;

    args.onProgress?.("Sol re-adjudication on mutated deck…");
    mission = { ...mission, status: "RE_ADJUDICATING" };
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

    mission = {
      ...mission,
      afterMetrics: buildMetricSnapshotV412({ fingerprint, adjudication }),
      status: bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)
        ? "ALIGNED"
        : iter >= MAX_BRACKET_UPGRADE_ITERATIONS_V412
          ? "BRACKET_TARGET_UNRESOLVED"
          : "RE_ADJUDICATING",
    };
    missions.push(mission);

    if (bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)) break;
  }

  return { councilState, adjudication, missions, fingerprint };
}

export async function runProfessorFinalizationPipelineV412(args: {
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
  skipUpgradeLoop?: boolean;
  onProgress?: (progress: FinalizationPipelineProgressV48) => void;
}): Promise<FinalizationPipelineResultV48> {
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

  councilState = { ...councilState, buildPhase: "PROVISIONAL_100" };

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

  reportProgress("HEAD_PROFESSOR_REVIEW", "GPT-5.6 Sol bracket adjudication (no pre-cut rebalance)…");

  let bracketAdjudication: BracketAdjudicationV411;
  try {
    bracketAdjudication = await runBracketAdjudicationV411({
      dossier,
      fingerprint,
      gameChangerCount: countGameChangers(councilState.selectedCards),
    });
  } catch (err) {
    const message =
      err instanceof HeadProfessorCallFailedError ? err.message : err instanceof Error ? err.message : "Bracket adjudication failed";
    finalDeckDoctor = { ...finalDeckDoctor, status: "FAILED", headProfessorError: message };
    throw new FinalizationPipelineFailedError(message, finalDeckDoctor, councilState);
  }

  finalDeckDoctor = {
    ...finalDeckDoctor,
    headProfessorReviewedDeckFingerprint: bracketAdjudication.headProfessorReviewedDeckFingerprint,
    bracketAdjudicationV411: bracketAdjudication,
    bracketAdjudicationV410: bracketAdjudication,
    review: buildMinimalReviewFromAdjudication(bracketAdjudication),
    headProfessorCallCompleted: true,
    headProfessorModel: HEAD_PROFESSOR_PRODUCT_NAME,
    modelCalls: { headProfessor: 1, research: 0, confirmation: 0 },
  };

  let upgradeMissions: BracketUpgradeMissionV412[] = [];

  if (!args.skipUpgradeLoop && !bracketAligned(args.bracket, bracketAdjudication.predictedEffectiveBracket)) {
    reportProgress("HEAD_PROFESSOR_REVIEW", "Bracket miss — v4.12 swap execution mission…");
    const alignment = await runBracketAlignmentLoopV412({
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
    upgradeMissions = alignment.missions;

    finalDeckDoctor = {
      ...finalDeckDoctor,
      headProfessorReviewedDeckFingerprint: bracketAdjudication.headProfessorReviewedDeckFingerprint,
      bracketAdjudicationV411: bracketAdjudication,
      bracketAdjudicationV410: bracketAdjudication,
      review: buildMinimalReviewFromAdjudication(bracketAdjudication),
      finalDeckFingerprint: fingerprint.finalDeckFingerprint,
      finalSnapshotRevision: fingerprint.finalSnapshotRevision,
    };
  }

  if (!bracketAligned(args.bracket, bracketAdjudication.predictedEffectiveBracket)) {
    finalDeckDoctor = {
      ...finalDeckDoctor,
      status: "FAILED",
      headProfessorError: `Bracket target miss — requested B${args.bracket}, Head Professor reads effective B${bracketAdjudication.predictedEffectiveBracket}. ${bracketAdjudication.playsLikeBecause}`,
    };
    councilState = {
      ...councilState,
      buildPhase: "BRACKET_REFINEMENT",
      bracketUpgradeMissionV412: upgradeMissions[upgradeMissions.length - 1] ?? null,
    } as ProfessorCouncilStateV47;
    throw new FinalizationPipelineFailedError(finalDeckDoctor.headProfessorError!, finalDeckDoctor, councilState);
  }

  assertHeadProfessorReviewFreshV411({
    reviewedFingerprint: finalDeckDoctor.headProfessorReviewedDeckFingerprint,
    currentFingerprint: fingerprint.finalDeckFingerprint,
    context: "pre-grade",
  });

  const finalDeckSha = deckListSha(councilState.selectedCards.map((c) => c.name));
  finalDeckDoctor = { ...finalDeckDoctor, finalDeckSha, gradingStartedAfterFinalDeckSha: true, status: "COMPLETE" };

  councilState = { ...councilState, buildPhase: "PROFESSOR_GRADE" };
  reportProgress("GRADING", "Grading bracket-aligned deck…");

  const deckGrade = computeProfessorDeckGradeFromCouncilV48({
    councilState,
    theory: args.theory,
    charter: args.charter,
    commanderName: args.commanderName,
    relationshipLens: args.relationshipLens,
    requestedBracket: args.bracket,
    headProfessorReview: finalDeckDoctor.review!,
  });

  councilState = { ...councilState, buildPhase: "FINAL_REVIEW" };
  reportProgress("PLAY_REPORT", "Writing play report…");

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
  reportProgress("COMPLETE", "Final review complete — bracket aligned.");

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
  };
}

/** Standalone bracket re-adjudication — NO pre-cut rebalance. */
export async function runStandaloneBracketAdjudicationV412(args: {
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
}): Promise<{
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  adjudication: BracketAdjudicationV411;
  dossier: ReturnType<typeof buildFinalDeckDoctorDossierV48>;
  councilState: ProfessorCouncilStateV47;
}> {
  const prepared = prepareDeckForBracketAdjudicationV412({
    state: args.councilState,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    commanderName: args.commanderName,
  });

  const dossier = buildFinalDeckDoctorDossierV48({
    ...args,
    councilState: prepared.state,
  });

  const adjudication = await runBracketAdjudicationV411({
    dossier,
    fingerprint: prepared.fingerprint,
    gameChangerCount: countGameChangers(prepared.state.selectedCards),
  });

  return {
    fingerprint: prepared.fingerprint,
    adjudication,
    dossier,
    councilState: prepared.state,
  };
}

/** Execute full v4.12 upgrade mission on existing final deck (acceptance test entry). */
export async function runStandaloneBracketUpgradeMissionV412(args: {
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
  missions: BracketUpgradeMissionV412[];
  adjudication: BracketAdjudicationV411;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  initialAdjudication: BracketAdjudicationV411;
  initialFingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
}> {
  const standalone = await runStandaloneBracketAdjudicationV412({
    ...args,
    userIntent: [],
    relationshipLens: null,
    theory: null,
  });

  if (bracketAligned(args.bracket, standalone.adjudication.predictedEffectiveBracket)) {
    return {
      councilState: standalone.councilState,
      missions: [],
      adjudication: standalone.adjudication,
      fingerprint: standalone.fingerprint,
      initialAdjudication: standalone.adjudication,
      initialFingerprint: standalone.fingerprint,
    };
  }

  const alignment = await runBracketAlignmentLoopV412({
    councilState: standalone.councilState,
    catalog: args.catalog,
    commanderName: args.commanderName,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    charter: args.charter,
    dossier: standalone.dossier,
    fingerprint: standalone.fingerprint,
    initialAdjudication: standalone.adjudication,
    onProgress: args.onProgress,
  });

  return {
    councilState: alignment.councilState,
    missions: alignment.missions,
    adjudication: alignment.adjudication,
    fingerprint: alignment.fingerprint,
    initialAdjudication: standalone.adjudication,
    initialFingerprint: standalone.fingerprint,
  };
}
