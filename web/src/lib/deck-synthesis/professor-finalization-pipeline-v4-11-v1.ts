/**
 * Professor v4.11 finalization pipeline — post-mana canonical deck, fingerprint-bound bracket adjudication, upgrade loop.
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
import type { ProfessorDeckGradeV4 } from "./professor-deck-grade-v4-v1";
import {
  deckListSha,
  emptyFinalDeckDoctorSessionV48,
  HeadProfessorCallFailedError,
  HEAD_PROFESSOR_PRODUCT_NAME,
  type FinalDeckDoctorSessionV48,
  type FinalDeckDoctorReviewV48,
} from "./professor-final-deck-doctor-v4-8-v1";
import { runProfessorPlayReportV48, type ProfessorDeckFinalReportV48 } from "./professor-deck-play-report-v4-8-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import {
  FinalizationPipelineFailedError,
  type FinalizationPipelineProgressV48,
  type FinalizationPipelineResultV48,
} from "./professor-finalization-pipeline-v4-8-v1";
import { ensureCanonicalFinalDeckV411 } from "./professor-final-deck-canonical-v4-11-v1";
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
  buildBracketUpgradeMissionV411,
  MAX_BRACKET_UPGRADE_ITERATIONS_V411,
  type BracketUpgradeMissionV411,
} from "./professor-bracket-upgrade-mission-v4-11-v1";
import { runBracketDragAnalysisV411 } from "./professor-bracket-drag-analysis-v4-11-v1";
import { discoverTutorCandidatesV411 } from "./professor-tutor-discovery-v4-11-v1";
import { getLegalRelevantGameChangersV411 } from "./professor-game-changer-discovery-v4-11-v1";
import {
  executeBracketUpgradeBatchV411,
  proposeBracketUpgradeSwapsV411,
} from "./professor-bracket-upgrade-executor-v4-11-v1";
import { gameChangerOracleIdSet, loadCommanderGameChangerSnapshot } from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";

export const PROFESSOR_FINALIZATION_PIPELINE_V4_11_V1_VERSION = "professor-finalization-pipeline-v4-11-v1";

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

function tutorNeedFromMission(mission: BracketUpgradeMissionV411): DeckNeedV47 {
  return {
    needId: "bracket-tutor-access",
    category: "ROLE_COMPRESSION",
    role: "tutor",
    reason: "Bracket upgrade — tutor/access deficit",
    source: "CRITIC_FINDING",
    requiredFunctions: ["tutor", "search"],
    preferredFunctions: ["efficient"],
    requiredMechanics: [],
    preferredMechanics: [],
    desiredProducedResources: [],
    desiredConsumedResources: [],
    desiredEvents: [],
    urgency: "HIGH",
    status: "OPEN",
    conceptText: "Efficient tutors for sacrifice engine",
  };
}

export async function runBracketAlignmentLoopV411(args: {
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
  mission: BracketUpgradeMissionV411 | null;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
}> {
  let councilState = args.councilState;
  let fingerprint = args.fingerprint;
  let adjudication = args.initialAdjudication;
  let mission: BracketUpgradeMissionV411 | null = null;

  if (bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)) {
    return { councilState, adjudication, mission: null, fingerprint };
  }

  for (let iter = 1; iter <= MAX_BRACKET_UPGRADE_ITERATIONS_V411; iter++) {
    args.onProgress?.(`Bracket alignment iteration ${iter}/${MAX_BRACKET_UPGRADE_ITERATIONS_V411}…`);

    const dragCards = await runBracketDragAnalysisV411({
      dossier: args.dossier,
      requestedBracket: args.bracket,
      predictedBracket: adjudication.predictedEffectiveBracket,
      missionType: adjudication.predictedEffectiveBracket > args.bracket ? "DOWNGRADE" : "UPGRADE",
    });

    const tutorNeed = tutorNeedFromMission({} as BracketUpgradeMissionV411);
    const tutorCandidates = discoverTutorCandidatesV411({
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      excludeNames: new Set(councilState.selectedCards.map((c) => c.name.toLowerCase())),
      bracket: args.bracket,
      powerPlan: councilState.bracketPowerPlanV410 ?? null,
      need: tutorNeed,
      charterKeywords: args.charter ? [args.charter.primaryStrategy, ...args.charter.intendedWinPaths] : [],
    });

    const gameChangers = getLegalRelevantGameChangersV411({
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      bracket: args.bracket,
      charter: args.charter,
      deckNeeds: councilState.deckNeeds,
      selectedCards: councilState.selectedCards,
      powerPlan: councilState.bracketPowerPlanV410 ?? null,
    });

    mission = buildBracketUpgradeMissionV411({
      missionId: `bracket-mission-${fingerprint.finalDeckFingerprint}-${iter}`,
      sourceDeckFingerprint: fingerprint.finalDeckFingerprint,
      requestedBracket: args.bracket,
      adjudication,
      bracketGap: councilState.snapshots[councilState.snapshots.length - 1]?.bracketGapAnalysis as import("./professor-bracket-gap-analysis-v4-10-v1").BracketGapAnalysisV410 | null ?? null,
      deckNeeds: councilState.deckNeeds,
      dragCards,
      tutorCandidates,
      gameChangers,
      powerPlan: councilState.bracketPowerPlanV410 ?? null,
      iteration: iter,
    });

    const proposals = proposeBracketUpgradeSwapsV411({
      dragCards,
      tutorCandidates,
      gameChangers,
      selectedCards: councilState.selectedCards,
    });

    if (proposals.length === 0) {
      mission = { ...mission, status: "BRACKET_TARGET_UNRESOLVED" };
      break;
    }

    const batch = executeBracketUpgradeBatchV411({
      mission,
      state: councilState,
      catalog: args.catalog,
      colorIdentity: args.commanderColorIdentity,
      commanderName: args.commanderName,
      charter: args.charter,
      proposals,
    });
    councilState = batch.state;
    mission = {
      ...batch.mission,
      acceptedSwaps: [...(mission?.acceptedSwaps ?? []), ...batch.accepted],
      rejectedSwaps: [...(mission?.rejectedSwaps ?? []), ...batch.rejected],
      proposedSwaps: proposals,
    };

    if (batch.accepted.length === 0) {
      mission = { ...mission, status: "BRACKET_TARGET_UNRESOLVED" };
      break;
    }

    fingerprint = computeFinalDeckFingerprintV411({ state: councilState, catalog: args.catalog });
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
      status: bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)
        ? "ALIGNED"
        : iter >= MAX_BRACKET_UPGRADE_ITERATIONS_V411
          ? "BRACKET_TARGET_UNRESOLVED"
          : "RE_ADJUDICATING",
    };

    if (bracketAligned(args.bracket, adjudication.predictedEffectiveBracket)) break;
  }

  return { councilState, adjudication, mission, fingerprint };
}

export async function runProfessorFinalizationPipelineV411(args: {
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

  const canonical = ensureCanonicalFinalDeckV411({
    state: args.councilState,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    commanderName: args.commanderName,
  });
  let councilState = canonical.state;
  let fingerprint = canonical.fingerprint;

  if (canonical.manaBaseAdjusted) {
    reportProgress("HEAD_PROFESSOR_REVIEW", "Mana base normalized before Head Professor review…");
  }

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

  reportProgress("HEAD_PROFESSOR_REVIEW", "GPT-5.6 Sol bracket adjudication on final post-mana deck…");

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
    bracketAdjudicationV410: bracketAdjudication,
    review: buildMinimalReviewFromAdjudication(bracketAdjudication),
    headProfessorCallCompleted: true,
    headProfessorModel: HEAD_PROFESSOR_PRODUCT_NAME,
    modelCalls: { headProfessor: 1, research: 0, confirmation: 0 },
  };

  let upgradeMission: BracketUpgradeMissionV411 | null = null;

  if (!args.skipUpgradeLoop && !bracketAligned(args.bracket, bracketAdjudication.predictedEffectiveBracket)) {
    reportProgress("HEAD_PROFESSOR_REVIEW", "Bracket miss — executing upgrade mission…");
    const alignment = await runBracketAlignmentLoopV411({
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
    upgradeMission = alignment.mission;

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
      bracketUpgradeMissionV410: upgradeMission as unknown as import("./professor-bracket-upgrade-mission-v4-10-v1").BracketUpgradeMissionV410,
      bracketUpgradeMissionV411: upgradeMission,
    };
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

/** Standalone bracket re-adjudication for an existing final deck list. */
export async function runStandaloneBracketAdjudicationV411(args: {
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
  const canonical = ensureCanonicalFinalDeckV411({
    state: args.councilState,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    commanderName: args.commanderName,
  });

  const dossier = buildFinalDeckDoctorDossierV48({
    ...args,
    councilState: canonical.state,
  });

  const adjudication = await runBracketAdjudicationV411({
    dossier,
    fingerprint: canonical.fingerprint,
    gameChangerCount: countGameChangers(canonical.state.selectedCards),
  });

  return {
    fingerprint: canonical.fingerprint,
    adjudication,
    dossier,
    councilState: canonical.state,
  };
}

/** Execute one upgrade mission iteration on an existing final deck. */
export async function runStandaloneBracketUpgradeMissionV411(args: {
  commanderName: string;
  commanderOracleId: string | null;
  commanderColorIdentity: string[];
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  councilState: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
}): Promise<{
  councilState: ProfessorCouncilStateV47;
  mission: BracketUpgradeMissionV411;
  adjudication: BracketAdjudicationV411;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
}> {
  const standalone = await runStandaloneBracketAdjudicationV411({
    ...args,
    userIntent: [],
    relationshipLens: null,
    theory: null,
  });

  if (bracketAligned(args.bracket, standalone.adjudication.predictedEffectiveBracket)) {
    return {
      councilState: standalone.councilState,
      mission: buildBracketUpgradeMissionV411({
        missionId: `aligned-${standalone.fingerprint.finalDeckFingerprint}`,
        sourceDeckFingerprint: standalone.fingerprint.finalDeckFingerprint,
        requestedBracket: args.bracket,
        adjudication: standalone.adjudication,
        bracketGap: null,
        deckNeeds: standalone.councilState.deckNeeds,
        dragCards: [],
        tutorCandidates: [],
        gameChangers: [],
        powerPlan: standalone.councilState.bracketPowerPlanV410 ?? null,
      }),
      adjudication: standalone.adjudication,
      fingerprint: standalone.fingerprint,
    };
  }

  const alignment = await runBracketAlignmentLoopV411({
    councilState: standalone.councilState,
    catalog: args.catalog,
    commanderName: args.commanderName,
    commanderColorIdentity: args.commanderColorIdentity,
    bracket: args.bracket,
    charter: args.charter,
    dossier: standalone.dossier,
    fingerprint: standalone.fingerprint,
    initialAdjudication: standalone.adjudication,
  });

  return {
    councilState: alignment.councilState,
    mission: alignment.mission!,
    adjudication: alignment.adjudication,
    fingerprint: alignment.fingerprint,
  };
}
