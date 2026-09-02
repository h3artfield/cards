/**
 * Professor v4.8 finalization pipeline — fail-closed Head Professor → swaps → grade → report.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import {
  computeDeckSnapshotV47,
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
  runHeadProfessorReviewV48,
  runHeadProfessorRefinementPassV48,
  type FinalDeckDoctorSessionV48,
} from "./professor-final-deck-doctor-v4-8-v1";
import { executeFinalRefinementV48, mergeHeadProfessorSummaryV48, summarizeRefinement } from "./professor-final-refinement-v4-8-v1";
import {
  assertFinalRefinementGateV48,
  FinalRefinementGateFailedError,
  refinementGateNeedsSecondPassV48,
} from "./professor-final-refinement-gate-v4-8-v1";
import { runProfessorPlayReportV48, type ProfessorDeckFinalReportV48 } from "./professor-deck-play-report-v4-8-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import {
  assertBracketTargetMetV49,
  BracketTargetMissError,
} from "./professor-bracket-finalization-gate-v4-9-v1";
import { buildBracketUpgradeMissionV410, extractBracketAdjudicationV410 } from "./professor-bracket-upgrade-mission-v4-10-v1";

export const PROFESSOR_FINALIZATION_PIPELINE_V4_8_V1_VERSION = "professor-finalization-pipeline-v4-8-v1";

export class FinalizationPipelineFailedError extends Error {
  constructor(
    message: string,
    public readonly finalDeckDoctor: FinalDeckDoctorSessionV48,
    public readonly councilState: ProfessorCouncilStateV47,
  ) {
    super(message);
    this.name = "FinalizationPipelineFailedError";
  }
}

export type FinalizationPipelineSuccessV48 = {
  ok: true;
  councilState: ProfessorCouncilStateV47;
  finalDeckDoctor: FinalDeckDoctorSessionV48;
  deckGrade: ProfessorDeckGradeV4;
  finalReport: ProfessorDeckFinalReportV48;
  deckList: { name: string; category: string }[];
};

export type FinalizationPipelineResultV48 = FinalizationPipelineSuccessV48;

function assertFinalizationReady(args: {
  review: Awaited<ReturnType<typeof runHeadProfessorReviewV48>>;
  summary: ReturnType<typeof summarizeRefinement>;
  councilState: ProfessorCouncilStateV47;
  dossierLandCount: number;
}): void {
  if (!args.review.headProfessorCallCompleted) {
    throw new Error("Head Professor call did not complete");
  }
  if (args.review.model === "deterministic-fallback") {
    throw new Error("Deterministic fallback is not allowed for Head Professor review");
  }

  const landCount = args.councilState.selectedCards.filter((c) => c.category === "land").length;
  const materialManaProblem = args.dossierLandCount < 30 || landCount < 30;
  const hadRecommendations = args.review.swaps.length > 0;

  if (materialManaProblem && args.summary.accepted === 0) {
    throw new Error(
      `Head Professor refinement made no accepted swaps despite critical land count (${landCount} lands)`,
    );
  }
  if (hadRecommendations && args.summary.accepted === 0) {
    throw new Error("Head Professor recommended swaps but none were accepted after verification");
  }
  if (!args.councilState.legalityGate?.pass) {
    throw new Error(`Final legality gate failed: ${args.councilState.legalityGate?.failures.join("; ") ?? "unknown"}`);
  }
}

export type FinalizationPipelineProgressV48 = {
  stage:
    | "HEAD_PROFESSOR_REVIEW"
    | "APPLYING_SWAPS"
    | "SECOND_HEAD_PROFESSOR_REVIEW"
    | "APPLYING_SECOND_SWAPS"
    | "VALIDATING"
    | "GRADING"
    | "PLAY_REPORT"
    | "COMPLETE"
    | "FAILED";
  message: string;
};

export async function runProfessorFinalizationPipelineV48(args: {
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
  onProgress?: (progress: FinalizationPipelineProgressV48) => void;
}): Promise<FinalizationPipelineResultV48> {
  const reportProgress = (progress: FinalizationPipelineProgressV48) => {
    console.info(`[professor-finalization] ${progress.stage}: ${progress.message}`);
    args.onProgress?.(progress);
  };
  let councilState: ProfessorCouncilStateV47 = {
    ...args.councilState,
    buildPhase: "PROVISIONAL_100",
  };

  const provisionalNames = councilState.selectedCards.map((c) => c.name);
  const provisionalDeckSha = deckListSha(provisionalNames);

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
    provisionalDeckSha,
    dossier,
  };

  councilState = { ...councilState, buildPhase: "HEAD_PROFESSOR_REVIEW" };
  reportProgress({
    stage: "HEAD_PROFESSOR_REVIEW",
    message: "GPT-5.6 Sol reviewing provisional deck…",
  });

  let review: Awaited<ReturnType<typeof runHeadProfessorReviewV48>>;
  try {
    review = await runHeadProfessorReviewV48(dossier);
    finalDeckDoctor = {
      ...finalDeckDoctor,
      review,
      headProfessorModel: review.model,
      headProfessorCallCompleted: true,
      headProfessorError: null,
      modelCalls: { ...finalDeckDoctor.modelCalls, headProfessor: 1 },
    };
  } catch (err) {
    const message =
      err instanceof HeadProfessorCallFailedError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Head Professor review failed";
    finalDeckDoctor = {
      ...finalDeckDoctor,
      status: "FAILED",
      headProfessorModel: HEAD_PROFESSOR_PRODUCT_NAME,
      headProfessorCallCompleted: false,
      headProfessorError: message,
    };
    councilState = { ...councilState, buildPhase: "NEEDS_ATTENTION" };
    throw new FinalizationPipelineFailedError(message, finalDeckDoctor, councilState);
  }

  councilState = { ...councilState, buildPhase: "FINAL_REFINEMENT" };
  reportProgress({
    stage: "APPLYING_SWAPS",
    message: "Applying Head Professor swap recommendations…",
  });
  let refinement = executeFinalRefinementV48({
    review,
    state: councilState,
    catalog: args.catalog,
    colorIdentity: args.commanderColorIdentity,
    commanderName: args.commanderName,
    charter: args.charter,
    dossierLandCount: dossier.structuralMetrics.landCount,
  });
  councilState = refinement.state;

  let summary = summarizeRefinement(refinement.executed);

  if (
    refinementGateNeedsSecondPassV48({
      councilState,
      review,
      summary,
      headProfessorPasses: finalDeckDoctor.modelCalls.headProfessor,
    })
  ) {
    reportProgress({
      stage: "SECOND_HEAD_PROFESSOR_REVIEW",
      message: "Critical gaps remain — second GPT-5.6 Sol pass…",
    });
    const refinedDossier = buildFinalDeckDoctorDossierV48({
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

    try {
      const secondReview = await runHeadProfessorRefinementPassV48({
        dossier: refinedDossier,
        priorReview: review,
        executedSwaps: refinement.executed,
      });
      review = {
        ...secondReview,
        requiresMajorRevision: secondReview.requiresMajorRevision || review.requiresMajorRevision,
        manaProblems: [...new Set([...review.manaProblems, ...secondReview.manaProblems])],
        remainingConcerns: [...new Set([...review.remainingConcerns, ...secondReview.remainingConcerns])],
      };
      finalDeckDoctor = {
        ...finalDeckDoctor,
        review,
        modelCalls: { ...finalDeckDoctor.modelCalls, headProfessor: 2 },
      };

      reportProgress({
        stage: "APPLYING_SECOND_SWAPS",
        message: "Applying second-pass Head Professor swaps…",
      });
      const secondRefinement = executeFinalRefinementV48({
        review: secondReview,
        state: councilState,
        catalog: args.catalog,
        colorIdentity: args.commanderColorIdentity,
        commanderName: args.commanderName,
        charter: args.charter,
        dossierLandCount: refinedDossier.structuralMetrics.landCount,
      });
      councilState = secondRefinement.state;
      refinement = {
        executed: [...refinement.executed, ...secondRefinement.executed],
        rejected: [...refinement.rejected, ...secondRefinement.rejected],
        state: secondRefinement.state,
      };
      summary = summarizeRefinement(refinement.executed);
    } catch (err) {
      console.warn(
        "[professor-brew] Second Head Professor pass failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const finalDeckSha = deckListSha(councilState.selectedCards.map((c) => c.name));
  summary = mergeHeadProfessorSummaryV48(review, summary);

  finalDeckDoctor = {
    ...finalDeckDoctor,
    executedSwaps: refinement.executed,
    rejectedRecommendations: refinement.rejected,
    summary,
    finalDeckSha,
    gradingStartedAfterFinalDeckSha: false,
  };

  try {
    reportProgress({ stage: "VALIDATING", message: "Validating refined deck structure…" });
    assertFinalizationReady({
      review,
      summary,
      councilState,
      dossierLandCount: dossier.structuralMetrics.landCount,
    });
    assertFinalRefinementGateV48({ review, summary, councilState });
  } catch (err) {
    const message =
      err instanceof FinalRefinementGateFailedError || err instanceof Error
        ? err.message
        : "Finalization validation failed";
    finalDeckDoctor = { ...finalDeckDoctor, status: "FAILED", headProfessorError: message };
    councilState = { ...councilState, buildPhase: "NEEDS_ATTENTION" };
    reportProgress({ stage: "FAILED", message });
    throw new FinalizationPipelineFailedError(message, finalDeckDoctor, councilState);
  }

  finalDeckDoctor = { ...finalDeckDoctor, status: "COMPLETE", gradingStartedAfterFinalDeckSha: true };

  councilState = { ...councilState, buildPhase: "PROFESSOR_GRADE" };
  reportProgress({ stage: "GRADING", message: "Grading refined deck…" });

  const deckGrade = computeProfessorDeckGradeFromCouncilV48({
    councilState,
    theory: args.theory,
    charter: args.charter,
    commanderName: args.commanderName,
    relationshipLens: args.relationshipLens,
    requestedBracket: args.bracket,
    headProfessorReview: review,
  });

  councilState = { ...councilState, buildPhase: "FINAL_REVIEW" };
  reportProgress({ stage: "PLAY_REPORT", message: "Writing final play report…" });
  const commanderCard = args.commanderOracleId
    ? args.catalog.byOracleId.get(args.commanderOracleId)
    : null;
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

  if (councilState.selectedCards.length !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    throw new FinalizationPipelineFailedError(
      `Final deck has ${councilState.selectedCards.length} library cards, expected ${COMMANDER_DECK_LIBRARY_SIZE_V47}`,
      finalDeckDoctor,
      councilState,
    );
  }

  try {
    assertBracketTargetMetV49({ requestedBracket: args.bracket, review });
  } catch (err) {
    if (err instanceof BracketTargetMissError) {
      const adjudication = extractBracketAdjudicationV410({ requestedBracket: args.bracket, review });
      const upgradeMission = buildBracketUpgradeMissionV410({
        requestedBracket: args.bracket,
        review,
        powerPlan: councilState.bracketPowerPlanV410 ?? null,
      });
      finalDeckDoctor = {
        ...finalDeckDoctor,
        status: "FAILED",
        review,
        headProfessorCallCompleted: true,
        headProfessorError: err.message,
        bracketAdjudicationV410: adjudication,
      };
      councilState = {
        ...councilState,
        buildPhase: "BRACKET_REFINEMENT",
        bracketUpgradeMissionV410: upgradeMission,
      };
      throw new FinalizationPipelineFailedError(err.message, finalDeckDoctor, councilState);
    }
    throw err;
  }

  councilState = {
    ...councilState,
    buildPhase: "DRAFT_READY",
    phase: "COMPLETE",
  };
  reportProgress({ stage: "COMPLETE", message: "Final review complete." });

  const deckList = deckListFromCouncilStateV47({ state: councilState, commanderName: args.commanderName }).map((c) => ({
    name: c.name,
    category: c.category,
  }));

  return {
    ok: true,
    councilState,
    finalDeckDoctor,
    deckGrade,
    finalReport,
    deckList,
  };
}
