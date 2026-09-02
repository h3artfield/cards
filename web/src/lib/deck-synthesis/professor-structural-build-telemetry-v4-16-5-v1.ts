/**
 * Professor v4.16.5 — structural build loop telemetry, mission escalation, termination.
 */
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import type { TheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";
import {
  buildLoopFingerprintV4165,
  buildStructuralCompletionPlanV4165,
  buildStructuralSearchMissionsV4165,
  escalateStructuralMissionV4165,
  evaluateBuildLoopTerminationV4165,
  hashCandidateSet,
  tierDomainChanged,
  type BuildLoopFingerprintV4165,
  type BuildLoopTerminationV4165,
  type StructuralCandidateSupplyV4165,
  type StructuralCompletionPlanV4165,
  type StructuralSearchMissionV4165,
  type StructuralSearchRejectionReasonV4165,
  type StructuralSearchTierV4165,
} from "./professor-structural-search-planner-v4-16-5-v1";

export const PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_5_V1_VERSION =
  "professor-structural-build-telemetry-v4-16-5-v1";

export type StructuralBuildTelemetryV4165 = {
  version: typeof PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_5_V1_VERSION;
  buildFingerprint: BuildLoopFingerprintV4165 | null;
  priorFingerprint: BuildLoopFingerprintV4165 | null;
  consecutiveIdenticalPasses: number;
  missions: StructuralSearchMissionV4165[];
  completionPlan: StructuralCompletionPlanV4165 | null;
  termination: BuildLoopTerminationV4165 | null;
  buildCandidateDiscoveryExhausted: boolean;
  normalBuildDisabled: boolean;
  structuralResearchDisabled: boolean;
  searchEscalationRequired: boolean;
  candidatePoolHash: string;
};

function inferRejectionReason(args: {
  candidatePoolNames: string[];
  selectedNames: Set<string>;
  newCandidates: number;
}): StructuralSearchRejectionReasonV4165 {
  if (args.candidatePoolNames.length === 0) return "RETRIEVAL_RETURNED_ZERO";
  if (args.newCandidates === 0) return "ALL_ALREADY_SELECTED";
  return "ALL_TOO_LOW_QUALITY";
}

export function assessCandidateSupplyV4165(args: {
  neededSlots: number;
  candidatePool: CouncilCardV46[];
  selectedCards: CouncilCardV46[];
}): StructuralCandidateSupplyV4165 {
  const selectedIds = new Set(args.selectedCards.map((c) => c.oracleId ?? c.cardId));
  let viable = 0;
  let strong = 0;
  let marginal = 0;
  let rejected = 0;
  for (const c of args.candidatePool) {
    if (selectedIds.has(c.oracleId ?? c.cardId)) {
      rejected += 1;
      continue;
    }
    const score = c.roles.length + (c.bracketFitScore ?? 0);
    if (score >= 4) {
      strong += 1;
      viable += 1;
    } else if (score >= 2) {
      marginal += 1;
      viable += 1;
    } else {
      rejected += 1;
    }
  }
  return {
    neededSlots: args.neededSlots,
    viableCandidateCount: viable,
    strongCandidateCount: strong,
    marginalCandidateCount: marginal,
    rejectedCandidateCount: rejected,
  };
}

export function updateStructuralBuildTelemetryV4165(args: {
  prior: StructuralBuildTelemetryV4165 | null | undefined;
  slotBudget: DeckSlotBudgetV4163;
  deckNeeds: DeckNeedV47[];
  theoryRealizations: TheoryRealizationV4165[];
  selectedCards: CouncilCardV46[];
  candidatePool: CouncilCardV46[];
}): StructuralBuildTelemetryV4165 {
  const candidatePoolNames = args.candidatePool.map((c) => c.name);
  const candidatePoolHash = hashCandidateSet(candidatePoolNames);
  const priorFingerprint = args.prior?.buildFingerprint ?? null;
  const priorMissions = args.prior?.missions ?? [];

  let missions =
    priorMissions.length > 0 && !args.slotBudget.structurallyComplete
      ? priorMissions
      : buildStructuralSearchMissionsV4165({
          slotBudget: args.slotBudget,
          deckNeeds: args.deckNeeds,
          theoryRealizations: args.theoryRealizations,
        });

  const currentFingerprint = buildLoopFingerprintV4165({
    selectedCardCount: args.selectedCards.length,
    missions,
    candidatePoolNames,
  });

  const identical =
    priorFingerprint &&
    priorFingerprint.selectedCardCount === currentFingerprint.selectedCardCount &&
    priorFingerprint.candidateSetHash === currentFingerprint.candidateSetHash &&
    priorFingerprint.activeMissionIds.join(",") === currentFingerprint.activeMissionIds.join(",");

  const consecutiveIdenticalPasses = identical ? (args.prior?.consecutiveIdenticalPasses ?? 0) + 1 : 0;
  const searchEscalationRequired = consecutiveIdenticalPasses >= 1;

  if (searchEscalationRequired && !args.slotBudget.structurallyComplete) {
    const selectedNames = new Set(args.selectedCards.map((c) => c.name));
    missions = missions.map((mission) => {
      if (mission.status === "SATISFIED" || mission.status === "EXHAUSTED") return mission;
      const priorTier = mission.currentTier;
      const rejection = inferRejectionReason({
        candidatePoolNames,
        selectedNames,
        newCandidates: args.candidatePool.filter((c) => !selectedNames.has(c.name)).length,
      });
      const escalated = escalateStructuralMissionV4165({
        mission,
        rejectionReason: rejection,
        candidatesNewToMission: 0,
      });
      if (!tierDomainChanged(escalated.currentTier, priorTier)) {
        return { ...escalated, currentTier: Math.min(7, priorTier + 1) as StructuralSearchTierV4165 };
      }
      return escalated;
    });
  }

  for (let i = 0; i < missions.length; i++) {
    const mission = missions[i]!;
    if (mission.status === "SATISFIED" || mission.status === "EXHAUSTED") continue;
    missions[i] = {
      ...mission,
      candidateSupply: assessCandidateSupplyV4165({
        neededSlots: mission.slotCount,
        candidatePool: args.candidatePool,
        selectedCards: args.selectedCards,
      }),
    };
  }

  const termination = evaluateBuildLoopTerminationV4165({
    priorFingerprint,
    currentFingerprint,
    missions,
  });

  const completionPlan = buildStructuralCompletionPlanV4165({
    slotBudget: args.slotBudget,
    deckNeeds: args.deckNeeds,
    theoryRealizations: args.theoryRealizations,
  });
  if (completionPlan && missions.length > 0) {
    completionPlan.missions = missions;
  }

  return {
    version: PROFESSOR_STRUCTURAL_BUILD_TELEMETRY_V4_16_5_V1_VERSION,
    buildFingerprint: currentFingerprint,
    priorFingerprint,
    consecutiveIdenticalPasses,
    missions,
    completionPlan,
    termination,
    buildCandidateDiscoveryExhausted: termination?.terminalState === "BUILD_FAILED_CANDIDATE_EXHAUSTION",
    normalBuildDisabled: termination?.normalBuildDisabled ?? false,
    structuralResearchDisabled: termination?.structuralResearchDisabled ?? false,
    searchEscalationRequired: consecutiveIdenticalPasses >= 2,
    candidatePoolHash,
  };
}

export function shouldRunStructuralResearchV4165(args: {
  slotBudget: DeckSlotBudgetV4163 | null;
  telemetry: StructuralBuildTelemetryV4165 | null | undefined;
}): boolean {
  if (!args.slotBudget || args.slotBudget.structurallyComplete) return false;
  if (args.telemetry?.termination?.shouldTerminate) return false;
  if (args.telemetry?.structuralResearchDisabled) return false;
  return true;
}

export function structuralBuildPhaseForTelemetryV4165(
  telemetry: StructuralBuildTelemetryV4165 | null | undefined,
): "STRUCTURALLY_INCOMPLETE" | "BUILD_FAILED_CANDIDATE_EXHAUSTION" | null {
  if (telemetry?.termination?.terminalState === "BUILD_FAILED_CANDIDATE_EXHAUSTION") {
    return "BUILD_FAILED_CANDIDATE_EXHAUSTION";
  }
  if (telemetry?.completionPlan) return "STRUCTURALLY_INCOMPLETE";
  return null;
}
