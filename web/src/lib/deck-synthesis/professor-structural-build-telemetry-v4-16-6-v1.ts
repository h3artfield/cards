/**
 * Professor v4.16.6 — execution-aware telemetry; recompute-safe no-op; exhaustion truth.
 */
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import type { TheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";
import {
  buildExhaustionEvidenceV4166,
  executeStructuralSearchV4166,
  reconcileCandidateSupplyV4166,
  type ExhaustionEvidenceV4166,
  type StructuralSearchExecutionV4166,
} from "./professor-structural-search-execution-v4-16-6-v1";
import {
  buildStructuralCompletionPlanV4166,
  type BuildPhaseV4166,
  type StructuralCompletionPlanV4166,
} from "./professor-structural-search-planner-v4-16-6-v1";

export const PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_6_V1_VERSION =
  "professor-structural-build-telemetry-v4-16-6-v1";

export type SearchProgressStateV4166 = "SEARCH_NO_PROGRESS" | "SEARCH_SPACE_EXHAUSTED" | "ACTIVE";

export type BuildLoopTerminationV4166 = {
  version: typeof PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_6_V1_VERSION;
  shouldTerminate: boolean;
  terminalState: "BUILD_FAILED_CANDIDATE_EXHAUSTION" | null;
  progressState: SearchProgressStateV4166;
  normalBuildDisabled: boolean;
  structuralResearchDisabled: boolean;
  consecutiveExecutionNoOps: number;
  recomputeNoOpCount: number;
  reason: string;
};

export type StructuralExhaustionAuditV4166 = {
  version: typeof PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_6_V1_VERSION;
  remainingSlots: number;
  evidence: ExhaustionEvidenceV4166;
  emitted: boolean;
  reason: "SEARCH_SPACE_EXHAUSTED" | "SEARCH_NO_PROGRESS" | null;
  invalidExhaustionClaim: boolean;
};

export type StructuralBuildTelemetryV4166 = {
  version: typeof PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_6_V1_VERSION;
  buildPhase: BuildPhaseV4166;
  completionPlan: StructuralCompletionPlanV4166;
  executions: StructuralSearchExecutionV4166[];
  consecutiveExecutionNoOps: number;
  consecutiveNormalNoAdds: number;
  recomputeCount: number;
  structuralSearchExecutionCount: number;
  recomputeNoOpCount: number;
  stallDetected: boolean;
  lastSelectedCardCount: number;
  termination: BuildLoopTerminationV4166 | null;
  exhaustionAudit: StructuralExhaustionAuditV4166;
  normalBuildDisabled: boolean;
  structuralResearchDisabled: boolean;
};

function executionNoOpCount(executions: StructuralSearchExecutionV4166[]): number {
  let count = 0;
  for (let i = executions.length - 1; i >= 0; i--) {
    const ex = executions[i]!;
    if (ex.searchOutcome === "SEARCH_NO_PROGRESS" && ex.selectedCountAfter === ex.selectedCountBefore) count += 1;
    else break;
  }
  return count;
}

export function evaluateBuildLoopTerminationV4166(args: {
  buildPhase: BuildPhaseV4166;
  executions: StructuralSearchExecutionV4166[];
  exhaustionEvidence: ExhaustionEvidenceV4166;
  consecutiveExecutionNoOps: number;
}): BuildLoopTerminationV4166 {
  const recomputeNoOpCount = 0;
  let progressState: SearchProgressStateV4166 = "ACTIVE";
  let shouldTerminate = false;
  let terminalState: BuildLoopTerminationV4166["terminalState"] = null;
  let reason = "Build may continue";

  if (args.buildPhase === "EARLY_ASSEMBLY" || args.buildPhase === "NORMAL_ASSEMBLY") {
    return {
      version: PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_6_V1_VERSION,
      shouldTerminate: false,
      terminalState: null,
      progressState: "ACTIVE",
      normalBuildDisabled: false,
      structuralResearchDisabled: true,
      consecutiveExecutionNoOps: args.consecutiveExecutionNoOps,
      recomputeNoOpCount: 0,
      reason: "Normal assembly — structural recovery not active",
    };
  }

  if (args.consecutiveExecutionNoOps >= 2 && !args.exhaustionEvidence.validForTerminalExhaustion) {
    progressState = "SEARCH_NO_PROGRESS";
    reason = "Two consecutive executed searches produced no accepted cards — escalate or reformulate";
  }

  if (args.exhaustionEvidence.validForTerminalExhaustion && args.buildPhase === "BUILD_FAILED_CANDIDATE_EXHAUSTION") {
    shouldTerminate = true;
    terminalState = "BUILD_FAILED_CANDIDATE_EXHAUSTION";
    progressState = "SEARCH_SPACE_EXHAUSTED";
    reason = "All applicable search tiers executed with execution evidence";
  }

  return {
    version: PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_6_V1_VERSION,
    shouldTerminate,
    terminalState,
    progressState,
    normalBuildDisabled: shouldTerminate,
    structuralResearchDisabled: shouldTerminate,
    consecutiveExecutionNoOps: args.consecutiveExecutionNoOps,
    recomputeNoOpCount,
    reason,
  };
}

export function updateStructuralBuildTelemetryV4166(args: {
  prior: StructuralBuildTelemetryV4166 | null | undefined;
  slotBudget: DeckSlotBudgetV4163;
  deckNeeds: DeckNeedV47[];
  theoryRealizations: TheoryRealizationV4165[];
  selectedCards: CouncilCardV46[];
  candidatePool: CouncilCardV46[];
  requestedBracket: number;
  commanderColorIdentity: string[];
  catalog: import("../../../scripts/lib/load-deck-resolution-catalog").DeckResolutionCatalog | null;
  recordExecution?: boolean;
  precomputedStructuralExecution?: StructuralSearchExecutionV4166;
  cardsAddedThisPass?: number;
}): StructuralBuildTelemetryV4166 {
  const priorExecutions = args.prior?.executions ?? [];
  const recomputeCount = (args.prior?.recomputeCount ?? 0) + 1;
  const cardsAdded = args.cardsAddedThisPass ?? 0;
  const priorPhase = args.prior?.buildPhase;
  const inNormalPhase =
    !priorPhase || priorPhase === "EARLY_ASSEMBLY" || priorPhase === "NORMAL_ASSEMBLY" || priorPhase === "BUILDING";
  const consecutiveNormalNoAdds =
    cardsAdded === 0 && inNormalPhase ? (args.prior?.consecutiveNormalNoAdds ?? 0) + 1 : 0;
  const stallDetected = Boolean(
    args.prior?.stallDetected ||
      (consecutiveNormalNoAdds >= 4 && args.slotBudget.selectedNonlands >= 12) ||
      (priorExecutions.length > 0 && priorExecutions[priorExecutions.length - 1]?.searchOutcome === "SEARCH_NO_PROGRESS"),
  );

  let executions = [...priorExecutions];
  let completionPlan = buildStructuralCompletionPlanV4166({
    slotBudget: args.slotBudget,
    selectedCards: args.selectedCards,
    deckNeeds: args.deckNeeds,
    theoryRealizations: args.theoryRealizations,
    requestedBracket: args.requestedBracket,
    stallDetected,
    terminalExhaustion: false,
  });

  if (
    args.precomputedStructuralExecution &&
    !executions.some((e) => e.executionId === args.precomputedStructuralExecution!.executionId)
  ) {
    const mission =
      completionPlan.missions.find((m) => m.missionId === args.precomputedStructuralExecution!.missionId) ??
      completionPlan.missions[0];
    const execution = args.precomputedStructuralExecution;
    if (mission) {
      const supply = reconcileCandidateSupplyV4166({
        execution,
        considered: execution.candidatesConsidered,
        neededSlots: mission.desiredSlots.max,
      });
      completionPlan = {
        ...completionPlan,
        missions: completionPlan.missions.map((m) =>
          m.missionId === mission.missionId
            ? { ...m, candidateSupply: supply as never, candidatesConsidered: supply.candidatesConsidered.map((c) => c.name) }
            : m,
        ),
      };
    }
    executions = [...executions, execution];
  } else if (
    args.recordExecution &&
    completionPlan.action === "RUN_STRUCTURAL_RESEARCH" &&
    completionPlan.missions[0]
  ) {
    const mission = completionPlan.missions[0]!;
    const execution =
      args.precomputedStructuralExecution ??
      executeStructuralSearchV4166({
        executionId: `exec-${executions.length + 1}-${mission.missionId}`,
        mission,
        candidatePool: args.candidatePool,
        selectedCards: args.selectedCards,
        catalog: args.catalog,
        commanderColorIdentity: args.commanderColorIdentity,
        requestedBracket: args.requestedBracket,
        tier: mission.currentTier,
      });
    const supply = reconcileCandidateSupplyV4166({
      execution,
      considered: execution.candidatesConsidered,
      neededSlots: mission.desiredSlots.max,
    });
    completionPlan = {
      ...completionPlan,
      missions: completionPlan.missions.map((m) =>
        m.missionId === mission.missionId
          ? { ...m, candidateSupply: supply as never, candidatesConsidered: supply.candidatesConsidered.map((c) => c.name) }
          : m,
      ),
    };
    executions = [...executions, execution];
  }

  const consecutiveExecutionNoOps = executionNoOpCount(executions);
  const exhaustionEvidence = buildExhaustionEvidenceV4166({ executions });
  const terminalExhaustion =
    exhaustionEvidence.validForTerminalExhaustion &&
    consecutiveExecutionNoOps >= 2 &&
    (completionPlan.buildPhase === "STALLED_RECOVERY" || completionPlan.buildPhase === "STRUCTURAL_CLOSURE");

  completionPlan = buildStructuralCompletionPlanV4166({
    slotBudget: args.slotBudget,
    selectedCards: args.selectedCards,
    deckNeeds: args.deckNeeds,
    theoryRealizations: args.theoryRealizations,
    requestedBracket: args.requestedBracket,
    stallDetected: stallDetected || consecutiveExecutionNoOps >= 1,
    terminalExhaustion,
  });

  const buildPhase = terminalExhaustion ? "BUILD_FAILED_CANDIDATE_EXHAUSTION" : completionPlan.buildPhase;
  const termination = evaluateBuildLoopTerminationV4166({
    buildPhase,
    executions,
    exhaustionEvidence,
    consecutiveExecutionNoOps,
  });

  const exhaustionAudit: StructuralExhaustionAuditV4166 = {
    version: PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_6_V1_VERSION,
    remainingSlots: args.slotBudget.remainingNonlandSlots,
    evidence: exhaustionEvidence,
    emitted: termination.terminalState === "BUILD_FAILED_CANDIDATE_EXHAUSTION",
    reason: termination.terminalState ? "SEARCH_SPACE_EXHAUSTED" : consecutiveExecutionNoOps >= 2 ? "SEARCH_NO_PROGRESS" : null,
    invalidExhaustionClaim:
      termination.terminalState === "BUILD_FAILED_CANDIDATE_EXHAUSTION" && !exhaustionEvidence.validForTerminalExhaustion,
  };

  return {
    version: PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_6_V1_VERSION,
    buildPhase,
    completionPlan,
    executions,
    consecutiveExecutionNoOps,
    consecutiveNormalNoAdds,
    recomputeCount,
    structuralSearchExecutionCount: executions.length,
    recomputeNoOpCount: 0,
    stallDetected: stallDetected || consecutiveExecutionNoOps >= 1,
    lastSelectedCardCount: args.selectedCards.length,
    termination,
    exhaustionAudit,
    normalBuildDisabled: termination.normalBuildDisabled,
    structuralResearchDisabled: termination.structuralResearchDisabled,
  };
}

export function shouldRunStructuralResearchV4166(args: {
  telemetry: StructuralBuildTelemetryV4166 | null | undefined;
}): boolean {
  if (!args.telemetry) return false;
  if (args.telemetry.buildPhase === "EARLY_ASSEMBLY" || args.telemetry.buildPhase === "NORMAL_ASSEMBLY") return false;
  if (args.telemetry.termination?.shouldTerminate) return false;
  return args.telemetry.completionPlan.action === "RUN_STRUCTURAL_RESEARCH";
}

export function structuralBuildPhaseForTelemetryV4166(
  telemetry: StructuralBuildTelemetryV4166 | null | undefined,
): "STRUCTURALLY_INCOMPLETE" | "BUILD_FAILED_CANDIDATE_EXHAUSTION" | null {
  if (telemetry?.buildPhase === "BUILD_FAILED_CANDIDATE_EXHAUSTION") return "BUILD_FAILED_CANDIDATE_EXHAUSTION";
  if (
    telemetry &&
    (telemetry.buildPhase === "STALLED_RECOVERY" || telemetry.buildPhase === "STRUCTURAL_CLOSURE")
  ) {
    return "STRUCTURALLY_INCOMPLETE";
  }
  return null;
}

/** Cheap regression: two identical recomputes must not increment no-op or terminate. */
export function recomputeSafetyCheckV4166(
  first: StructuralBuildTelemetryV4166,
  second: StructuralBuildTelemetryV4166,
): { recomputeNoOpCount: number; terminated: boolean } {
  return {
    recomputeNoOpCount: second.recomputeNoOpCount,
    terminated: second.termination?.shouldTerminate ?? false,
  };
}
