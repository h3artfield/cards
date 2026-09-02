/**
 * Professor v4.16.6.2 — authoritative next-action dispatch (single production step controller).
 */
import type { BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import {
  resolveProfessorBuildControlFromSessionV41661,
  type ProfessorBuildControlV41661,
} from "./professor-build-control-v4-16-6-1-v1";
import { resolveStructuralTargetV416 } from "./professor-mana-plan-v4-16-v1";
import type { StrategicProgressV41662 } from "./professor-strategic-progress-v4-16-6-2-v1";
import { assessStrategicProgressV41662 } from "./professor-strategic-progress-v4-16-6-2-v1";
import { assessTheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";

type ClosureTelemetryV4166 = {
  executions?: Array<{
    missionId?: string;
    candidateSetHash?: string;
    searchOutcome?: string;
    selectedCountBefore?: number;
    selectedCountAfter?: number;
  }>;
};

function sessionNeedsFinalReview(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return false;
  if (session.finalReport?.status === "COMPLETE" || session.finalReport?.status === "RUNNING") return false;
  if (session.finalDeckDoctor?.status === "COMPLETE" || session.finalDeckDoctor?.status === "RUNNING") return false;
  const libraryCount = session.councilState?.selectedCards.length ?? 0;
  if (libraryCount < COMMANDER_DECK_LIBRARY_SIZE_V47) return false;
  if (sessionNeedsBracketResearch(session)) return false;
  const readiness = session.councilState?.bracketReadinessV416;
  if (!readiness) return true;
  return readiness.canEnterFinalization;
}

function sessionNeedsBracketResearch(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return false;
  const libraryCount = session.councilState?.selectedCards.length ?? 0;
  if (libraryCount < COMMANDER_DECK_LIBRARY_SIZE_V47) return false;
  const readiness = session.councilState?.bracketReadinessV416;
  if (!readiness || readiness.canEnterFinalization) return false;
  if (readiness.carryForwardFlag === "BUILD_BRACKET_TARGET_UNRESOLVED") return false;
  const exhausted = (session.councilState as { bracketResearchExhaustedV4162?: boolean })?.bracketResearchExhaustedV4162;
  return !exhausted;
}

export const PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION = "professor-next-action-dispatch-v4-16-6-2-v1";

export type ProfessorNextActionV41662 =
  | "ADVANCE_TREE"
  | "RUN_STRUCTURAL_RESEARCH"
  | "RUN_BRACKET_RESEARCH"
  | "RUN_MANA_BASE"
  | "RUN_FINAL_REVIEW"
  | "TERMINATE";

export type ClosureExecutionStateV41662 = {
  version: typeof PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION;
  closureEntryIteration: number;
  closureEntryExecutionCount: number;
  executionsSinceClosure: number;
  successfulMutations: number;
  noProgressExecutions: number;
  lastMissionId: string | null;
  lastCandidateSetHash: string | null;
  escalateRequired: boolean;
};

export type ProfessorNextActionDecisionV41662 = {
  version: typeof PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION;
  action: ProfessorNextActionV41662;
  forbiddenActions: ProfessorNextActionV41662[];
  phase: ProfessorBuildControlV41661["phase"];
  shouldRunStructuralResearch: boolean;
  shouldRunMana: boolean;
  strategicRecoveryRequired: boolean;
  reason: string;
};

export function updateClosureExecutionStateV41662(args: {
  prior: ClosureExecutionStateV41662 | null | undefined;
  telemetry: ClosureTelemetryV4166 | null | undefined;
  iteration: number;
  enteredClosure: boolean;
}): ClosureExecutionStateV41662 {
  const tel = args.telemetry;
  const lastExecution = tel?.executions.at(-1) ?? null;
  const execCount = tel?.executions.length ?? 0;
  const noProgress =
    lastExecution?.searchOutcome === "SEARCH_NO_PROGRESS" &&
    lastExecution.selectedCountAfter === lastExecution.selectedCountBefore;
  const mutation =
    lastExecution != null &&
    lastExecution.selectedCountAfter > lastExecution.selectedCountBefore;
  const prior = args.prior;
  const closureEntryIteration =
    args.enteredClosure && !prior?.closureEntryIteration ? args.iteration : prior?.closureEntryIteration ?? 0;
  const closureEntryExecutionCount =
    args.enteredClosure && !prior?.closureEntryIteration
      ? execCount
      : prior?.closureEntryExecutionCount ?? 0;
  const executionsSinceClosure =
    closureEntryIteration > 0 ? Math.max(0, execCount - closureEntryExecutionCount) : 0;
  const successfulMutations = (prior?.successfulMutations ?? 0) + (mutation ? 1 : 0);
  const noProgressExecutions = (prior?.noProgressExecutions ?? 0) + (noProgress && lastExecution ? 1 : 0);
  const sameMissionRepeat =
    prior?.lastMissionId != null &&
    lastExecution?.missionId === prior.lastMissionId &&
    prior.lastCandidateSetHash === lastExecution?.candidateSetHash &&
    noProgress;
  return {
    version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
    closureEntryIteration,
    closureEntryExecutionCount,
    executionsSinceClosure,
    successfulMutations,
    noProgressExecutions,
    lastMissionId: lastExecution?.missionId ?? prior?.lastMissionId ?? null,
    lastCandidateSetHash: lastExecution?.candidateSetHash ?? prior?.lastCandidateSetHash ?? null,
    escalateRequired: noProgressExecutions >= 2 || sameMissionRepeat === true,
  };
}

export function resolveProfessorNextActionV41662(args: {
  control: ProfessorBuildControlV41661;
  strategicProgress?: StrategicProgressV41662 | null;
  libraryCount: number;
  structurallyComplete: boolean;
  structuralTarget: number;
  session?: BrewSessionV42;
}): ProfessorNextActionDecisionV41662 {
  const forbiddenActions: ProfessorNextActionV41662[] = [];
  const strategicRecoveryRequired = args.strategicProgress?.strategicRecoveryRequired === true;

  if (args.control.shouldTerminate) {
    return {
      version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
      action: "TERMINATE",
      forbiddenActions: ["ADVANCE_TREE", "RUN_STRUCTURAL_RESEARCH", "RUN_MANA_BASE"],
      phase: args.control.phase,
      shouldRunStructuralResearch: false,
      shouldRunMana: false,
      strategicRecoveryRequired,
      reason: args.control.reason,
    };
  }

  if (args.session && args.libraryCount >= COMMANDER_DECK_LIBRARY_SIZE_V47) {
    if (sessionNeedsFinalReview(args.session)) {
      return {
        version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
        action: "RUN_FINAL_REVIEW",
        forbiddenActions: ["ADVANCE_TREE", "RUN_STRUCTURAL_RESEARCH"],
        phase: args.control.phase,
        shouldRunStructuralResearch: false,
        shouldRunMana: false,
        strategicRecoveryRequired,
        reason: "Library complete — final review authorized",
      };
    }
    if (sessionNeedsBracketResearch(args.session)) {
      return {
        version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
        action: "RUN_BRACKET_RESEARCH",
        forbiddenActions: ["ADVANCE_TREE"],
        phase: args.control.phase,
        shouldRunStructuralResearch: false,
        shouldRunMana: false,
        strategicRecoveryRequired,
        reason: "Bracket research required before finalization",
      };
    }
  }

  const structuralPending = args.control.shouldRunStructuralResearch || strategicRecoveryRequired;
  if (structuralPending) {
    forbiddenActions.push("ADVANCE_TREE");
    if (!args.structurallyComplete || args.control.phase === "STRUCTURAL_CLOSURE" || args.control.phase === "STALLED_RECOVERY") {
      forbiddenActions.push("RUN_MANA_BASE");
    }
    return {
      version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
      action: "RUN_STRUCTURAL_RESEARCH",
      forbiddenActions,
      phase: args.control.phase,
      shouldRunStructuralResearch: true,
      shouldRunMana: false,
      strategicRecoveryRequired,
      reason: strategicRecoveryRequired
        ? "STRATEGIC_RECOVERY_REQUIRED — structural research preempts normal assembly"
        : args.control.reason,
    };
  }

  if (args.control.shouldRunMana && args.structurallyComplete) {
    forbiddenActions.push("ADVANCE_TREE");
    return {
      version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
      action: "RUN_MANA_BASE",
      forbiddenActions,
      phase: args.control.phase,
      shouldRunStructuralResearch: false,
      shouldRunMana: true,
      strategicRecoveryRequired,
      reason: "Structural nonlands complete — mana base authorized",
    };
  }

  if (args.control.shouldContinueNormalAssembly && args.libraryCount < args.structuralTarget) {
    return {
      version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
      action: "ADVANCE_TREE",
      forbiddenActions: ["RUN_MANA_BASE"],
      phase: args.control.phase,
      shouldRunStructuralResearch: false,
      shouldRunMana: false,
      strategicRecoveryRequired,
      reason: args.control.reason,
    };
  }

  if (args.control.shouldContinueNormalAssembly) {
    return {
      version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
      action: "ADVANCE_TREE",
      forbiddenActions: ["RUN_MANA_BASE"],
      phase: args.control.phase,
      shouldRunStructuralResearch: false,
      shouldRunMana: false,
      strategicRecoveryRequired,
      reason: "Continue assembly until structural target",
    };
  }

  return {
    version: PROFESSOR_NEXT_ACTION_DISPATCH_V4_16_6_2_V1_VERSION,
    action: "TERMINATE",
    forbiddenActions: ["ADVANCE_TREE", "RUN_MANA_BASE"],
    phase: args.control.phase,
    shouldRunStructuralResearch: false,
    shouldRunMana: false,
    strategicRecoveryRequired,
    reason: "No authorized production step",
  };
}

export function resolveProfessorNextActionFromSessionV41662(session: BrewSessionV42): ProfessorNextActionDecisionV41662 {
  const control = resolveProfessorBuildControlFromSessionV41661(session);
  const cs = session.councilState;
  const libraryCount = cs?.selectedCards.length ?? 0;
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: cs?.manaPlanV416 ?? null,
    selectedCards: cs?.selectedCards ?? [],
  });
  const structuralTarget = resolveStructuralTargetV416(cs?.manaPlanV416);
  const strategicProgress =
    cs?.strategicProgressV41662 ??
    assessStrategicProgressV41662({
      slotBudget,
      theoryRealizations: assessTheoryRealizationV4165({
        theory: session.workingDeckTheory ?? null,
        selectedCards: cs?.selectedCards ?? [],
      }),
      selectedCards: cs?.selectedCards ?? [],
      priorSelectedCount: cs?.structuralBuildTelemetryV4166?.lastSelectedCardCount,
      winArchitectureLocked: cs?.winArchitectureLockedV416,
    });
  return resolveProfessorNextActionV41662({
    control,
    strategicProgress,
    libraryCount,
    structurallyComplete: slotBudget.structurallyComplete,
    structuralTarget,
    session,
  });
}

/** Dev assertion: structural research requested last iteration must produce execution evidence. */
export function assertStructuralActionExecutedV41662(args: {
  priorExecutionCount: number;
  nextExecutionCount: number;
  requestedAction: ProfessorNextActionV41662;
  hardExceptionRecorded?: boolean;
}): void {
  if (args.requestedAction !== "RUN_STRUCTURAL_RESEARCH") return;
  if (args.hardExceptionRecorded) return;
  if (args.nextExecutionCount <= args.priorExecutionCount) {
    throw new Error("STRUCTURAL_ACTION_NOT_EXECUTED");
  }
}

export function assertNextActionAllowedV41662(args: {
  requested: ProfessorNextActionV41662;
  decision: ProfessorNextActionDecisionV41662;
}): void {
  if (args.decision.forbiddenActions.includes(args.requested)) {
    throw new Error(`${args.requested} forbidden — next action is ${args.decision.action}`);
  }
}
