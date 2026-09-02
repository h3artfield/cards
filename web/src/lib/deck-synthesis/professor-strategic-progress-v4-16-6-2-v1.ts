/**
 * Professor v4.16.6.2 — strategic progress checkpoints vs card-count growth.
 */
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import type { BuildPhaseV4166 } from "./professor-structural-search-planner-v4-16-6-v1";
import type { TheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";

export const PROFESSOR_STRATEGIC_PROGRESS_V4_16_6_2_V1_VERSION = "professor-strategic-progress-v4-16-6-2-v1";

export const STRATEGIC_CHECKPOINT_RATIOS_V41662 = [0.25, 0.45, 0.65, 0.8] as const;

export type StrategicCheckpointV41662 = {
  ratio: number;
  expectedNonlands: number;
  thresholdNonlands: number;
  reached: boolean;
  primaryCoreStatus: TheoryRealizationV4165["realizationStatus"] | "NONE";
  recoveryRequired: boolean;
  reason: string;
};

export type StrategicProgressV41662 = {
  version: typeof PROFESSOR_STRATEGIC_PROGRESS_V4_16_6_2_V1_VERSION;
  structuralCompletionRatio: number;
  selectedCardGrowth: number;
  corePackageRealization: TheoryRealizationV4165[];
  winArchitectureProgress: "UNREALIZED" | "PARTIAL" | "REALIZED";
  accessTargetProgress: "BELOW" | "MET" | "EXCEEDED";
  engineCoverageProgress: "LOW" | "ADEQUATE" | "STRONG";
  bracketDeficitProgress: "OPEN" | "CLOSING" | "CLEAR";
  checkpoints: StrategicCheckpointV41662[];
  strategicRecoveryRequired: boolean;
  blockingPackages: string[];
  summary: string;
};

export type CorePackageVerificationV41662 = {
  packageId: string;
  decision: "REALIZE" | "REVISE" | "ABANDON_AND_REPLACE";
  reason: string;
  verifiedMembers: string[];
};

export type TheoryRealizationGovernanceV41662 = TheoryRealizationV4165 & {
  realizationDeadlinePhase: BuildPhaseV4166 | null;
  lastProgressIteration: number;
  selectedMemberDelta: number;
  blockingReason: string | null;
  verificationDecision: CorePackageVerificationV41662["decision"] | null;
};

function primaryCore(realizations: TheoryRealizationV4165[]): TheoryRealizationV4165 | null {
  return realizations[0] ?? null;
}

function accessProgress(selectedCards: CouncilCardV46[]): StrategicProgressV41662["accessTargetProgress"] {
  const tutors = selectedCards.filter((c) =>
    /tutor|gamble|worldly|vampiric|imperial seal|enlightened|mystical|survival of the fittest|finale of devastation|fabricate|merchant scroll|wishclaw|spellseeker|tribute mage|isochron scepter|recruiter|diabolic|demonic|personal tutor/i.test(
      c.name,
    ),
  ).length;
  if (tutors >= 3) return "EXCEEDED";
  if (tutors >= 2) return "MET";
  return "BELOW";
}

function engineCoverage(selectedCards: CouncilCardV46[]): StrategicProgressV41662["engineCoverageProgress"] {
  const engines = selectedCards.filter((c) => /engine|synergy|token|sacrifice|combo/.test(c.roles.join(" "))).length;
  if (engines >= 12) return "STRONG";
  if (engines >= 6) return "ADEQUATE";
  return "LOW";
}

export function verifyCorePackageV41662(args: {
  realization: TheoryRealizationV4165;
  commanderColorIdentity: string[];
}): CorePackageVerificationV41662 {
  if (args.realization.candidateCards.length === 0) {
    return {
      packageId: args.realization.packageId,
      decision: "ABANDON_AND_REPLACE",
      reason: "Package has no candidate members",
      verifiedMembers: [],
    };
  }
  if (args.realization.realizationStatus === "REALIZED") {
    return {
      packageId: args.realization.packageId,
      decision: "REALIZE",
      reason: "Package already realized in deck",
      verifiedMembers: args.realization.selectedMembers,
    };
  }
  if (args.realization.candidateCards.length >= 2 && args.realization.intendedFunction.length < 8) {
    return {
      packageId: args.realization.packageId,
      decision: "REVISE",
      reason: "Package function underspecified — revise hypothesis before force-select",
      verifiedMembers: args.realization.candidateCards.slice(0, 4),
    };
  }
  return {
    packageId: args.realization.packageId,
    decision: "REALIZE",
    reason: "Package members and function verified for targeted realization",
    verifiedMembers: args.realization.candidateCards.slice(0, 4),
  };
}

export function enrichTheoryRealizationGovernanceV41662(args: {
  realizations: TheoryRealizationV4165[];
  slotBudget: DeckSlotBudgetV4163;
  iteration: number;
  prior?: TheoryRealizationGovernanceV41662[];
  commanderColorIdentity: string[];
}): TheoryRealizationGovernanceV41662[] {
  const ratio = args.slotBudget.selectedNonlands / Math.max(1, args.slotBudget.expectedNonlands);
  return args.realizations.map((r, idx) => {
    const prior = args.prior?.find((p) => p.packageId === r.packageId);
    const selectedMemberDelta = r.selectedMembers.length - (prior?.selectedMembers.length ?? 0);
    const deadlinePhase: BuildPhaseV4166 | null =
      ratio >= 0.75 ? "STRUCTURAL_CLOSURE" : ratio >= 0.6 ? "NORMAL_ASSEMBLY" : ratio >= 0.35 ? "EARLY_ASSEMBLY" : null;
    const verification = verifyCorePackageV41662({ realization: r, commanderColorIdentity: args.commanderColorIdentity });
    let blockingReason: string | null = null;
    if (r.realizationStatus === "UNREALIZED" && ratio >= 0.45 && idx === 0) {
      blockingReason = "Primary CORE package still UNREALIZED past 45% structural completion";
    } else if (r.realizationStatus === "UNREALIZED" && ratio >= 0.65) {
      blockingReason = `CORE package ${r.packageId} UNREALIZED past 65% completion`;
    }
    return {
      ...r,
      realizationDeadlinePhase: deadlinePhase,
      lastProgressIteration: selectedMemberDelta > 0 ? args.iteration : prior?.lastProgressIteration ?? 0,
      selectedMemberDelta,
      blockingReason,
      verificationDecision: verification.decision,
    };
  });
}

export function assessStrategicProgressV41662(args: {
  slotBudget: DeckSlotBudgetV4163;
  theoryRealizations: TheoryRealizationV4165[];
  selectedCards: CouncilCardV46[];
  priorSelectedCount?: number;
  winArchitectureLocked?: boolean;
}): StrategicProgressV41662 {
  const ratio = args.slotBudget.selectedNonlands / Math.max(1, args.slotBudget.expectedNonlands);
  const core = args.theoryRealizations;
  const primary = primaryCore(core);
  const checkpoints: StrategicCheckpointV41662[] = STRATEGIC_CHECKPOINT_RATIOS_V41662.map((checkpointRatio) => {
    const thresholdNonlands = Math.ceil(args.slotBudget.expectedNonlands * checkpointRatio);
    const reached = args.slotBudget.selectedNonlands >= thresholdNonlands;
    const primaryCoreStatus = primary?.realizationStatus ?? "NONE";
    let recoveryRequired = false;
    let reason = `Checkpoint ${Math.round(checkpointRatio * 100)}% — ${thresholdNonlands} nonlands`;
    if (reached && primaryCoreStatus === "UNREALIZED" && checkpointRatio >= 0.45) {
      recoveryRequired = true;
      reason = `${reason}: primary CORE still UNREALIZED`;
    } else if (reached && primaryCoreStatus === "UNREALIZED" && checkpointRatio >= 0.65) {
      recoveryRequired = true;
      reason = `${reason}: CORE unrealized at late checkpoint`;
    } else if (reached && primaryCoreStatus === "PARTIAL" && checkpointRatio >= 0.8) {
      recoveryRequired = true;
      reason = `${reason}: primary CORE only PARTIAL at 80%`;
    }
    return { ratio: checkpointRatio, expectedNonlands: args.slotBudget.expectedNonlands, thresholdNonlands, reached, primaryCoreStatus, recoveryRequired, reason };
  });
  const strategicRecoveryRequired = checkpoints.some((c) => c.recoveryRequired);
  const blockingPackages = core.filter((r) => r.realizationStatus === "UNREALIZED" || r.realizationStatus === "PARTIAL").map((r) => r.packageId);
  return {
    version: PROFESSOR_STRATEGIC_PROGRESS_V4_16_6_2_V1_VERSION,
    structuralCompletionRatio: ratio,
    selectedCardGrowth: args.selectedCards.length - (args.priorSelectedCount ?? args.selectedCards.length),
    corePackageRealization: core,
    winArchitectureProgress: args.winArchitectureLocked ? "REALIZED" : ratio >= 0.75 ? "PARTIAL" : "UNREALIZED",
    accessTargetProgress: accessProgress(args.selectedCards),
    engineCoverageProgress: engineCoverage(args.selectedCards),
    bracketDeficitProgress: ratio >= 0.8 ? "CLOSING" : ratio >= 0.5 ? "OPEN" : "OPEN",
    checkpoints,
    strategicRecoveryRequired,
    blockingPackages,
    summary: strategicRecoveryRequired
      ? `STRATEGIC_RECOVERY_REQUIRED — ${blockingPackages.length} CORE package(s) lag card-count growth`
      : `Strategic progress aligned — ${Math.round(ratio * 100)}% structural completion`,
  };
}
