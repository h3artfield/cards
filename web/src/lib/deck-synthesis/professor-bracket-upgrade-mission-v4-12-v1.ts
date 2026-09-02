/**
 * Bracket upgrade mission v4.12 — slot-aware paired swap execution.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketAdjudicationV411 } from "./professor-bracket-adjudication-v4-11-v1";
import type { BracketGapAnalysisV410 } from "./professor-bracket-gap-analysis-v4-10-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { BracketDragSlotV412 } from "./professor-bracket-drag-slot-v4-12-v1";
import type { GameChangerSlotProposalV412 } from "./professor-game-changer-slot-mapping-v4-12-v1";
import type { RankedTutorCandidateV412 } from "./professor-tutor-ranking-v4-12-v1";
import type { BracketUpgradeSwapProposalV412 } from "./professor-bracket-upgrade-swap-v4-12-v1";
import type { FinalDeckFingerprintV411 } from "./professor-deck-fingerprint-v4-11-v1";

export const PROFESSOR_BRACKET_UPGRADE_MISSION_V4_12_V1_VERSION = "professor-bracket-upgrade-mission-v4-12-v1";

export const MAX_BRACKET_UPGRADE_ITERATIONS_V412 = 2;

export type BracketMissionMetricSnapshotV412 = {
  fingerprint: string;
  predictedBracket: CommanderBracket | null;
  landCount: number;
  avgManaValue: number;
  tutorCount: number;
  rampNonLandCount: number;
  interactionCount?: number;
  protectionCount?: number;
  cardAdvantageCount?: number;
  gameChangerCount?: number;
  fillerCount?: number;
};

export type BracketUpgradeMissionStatusV412 =
  | "PENDING"
  | "DRAG_ANALYSIS"
  | "RESEARCHING"
  | "SWAPPING"
  | "MANA_REBALANCE"
  | "RE_ADJUDICATING"
  | "ALIGNED"
  | "BRACKET_TARGET_UNRESOLVED";

export type BracketUpgradeMissionV412 = {
  version: typeof PROFESSOR_BRACKET_UPGRADE_MISSION_V4_12_V1_VERSION;
  missionId: string;
  sourceDeckFingerprint: string;
  requestedBracket: CommanderBracket;
  predictedBracket: CommanderBracket;
  missionType: "UPGRADE" | "DOWNGRADE";
  iteration: number;
  bracketDragSlots: BracketDragSlotV412[];
  tutorCandidates: RankedTutorCandidateV412[];
  gameChangerCandidates: GameChangerSlotProposalV412[];
  proposedSwaps: BracketUpgradeSwapProposalV412[];
  acceptedSwaps: BracketUpgradeSwapProposalV412[];
  rejectedSwaps: BracketUpgradeSwapProposalV412[];
  beforeMetrics: BracketMissionMetricSnapshotV412;
  afterMetrics: BracketMissionMetricSnapshotV412 | null;
  status: BracketUpgradeMissionStatusV412;
  preserveCharter: boolean;
  powerDeficits: string[];
  bracketGap: BracketGapAnalysisV410 | null;
  deckNeeds: DeckNeedV47[];
  powerPlan: BracketPowerPlanV410 | null;
};

export function buildMetricSnapshotV412(args: {
  fingerprint: FinalDeckFingerprintV411;
  adjudication: BracketAdjudicationV411 | null;
  fillerCount?: number;
}): BracketMissionMetricSnapshotV412 {
  return {
    fingerprint: args.fingerprint.finalDeckFingerprint,
    predictedBracket: args.adjudication?.predictedEffectiveBracket ?? null,
    landCount: args.fingerprint.landCount,
    avgManaValue: args.fingerprint.avgManaValue,
    tutorCount: args.fingerprint.tutorCount,
    rampNonLandCount: args.fingerprint.rampNonLandCount,
    interactionCount: args.adjudication?.structuralMetrics.interactionCount,
    protectionCount: args.adjudication?.structuralMetrics.protectionCount,
    cardAdvantageCount: args.adjudication?.structuralMetrics.cardAdvantageCount,
    gameChangerCount: args.adjudication?.structuralMetrics.gameChangerCount,
    fillerCount: args.fillerCount,
  };
}

export function buildBracketUpgradeMissionV412(args: {
  missionId: string;
  sourceDeckFingerprint: string;
  requestedBracket: CommanderBracket;
  adjudication: BracketAdjudicationV411;
  bracketGap: BracketGapAnalysisV410 | null;
  deckNeeds: DeckNeedV47[];
  dragSlots: BracketDragSlotV412[];
  tutorCandidates: RankedTutorCandidateV412[];
  gameChangers: GameChangerSlotProposalV412[];
  beforeMetrics: BracketMissionMetricSnapshotV412;
  powerPlan: BracketPowerPlanV410 | null;
  iteration?: number;
}): BracketUpgradeMissionV412 {
  const predicted = args.adjudication.predictedEffectiveBracket;
  const missionType: "UPGRADE" | "DOWNGRADE" = predicted > args.requestedBracket ? "DOWNGRADE" : "UPGRADE";

  return {
    version: PROFESSOR_BRACKET_UPGRADE_MISSION_V4_12_V1_VERSION,
    missionId: args.missionId,
    sourceDeckFingerprint: args.sourceDeckFingerprint,
    requestedBracket: args.requestedBracket,
    predictedBracket: predicted,
    missionType,
    iteration: args.iteration ?? 1,
    bracketDragSlots: args.dragSlots,
    tutorCandidates: args.tutorCandidates,
    gameChangerCandidates: args.gameChangers,
    proposedSwaps: [],
    acceptedSwaps: [],
    rejectedSwaps: [],
    beforeMetrics: args.beforeMetrics,
    afterMetrics: null,
    status: "PENDING",
    preserveCharter: true,
    powerDeficits: args.adjudication.powerDeficits,
    bracketGap: args.bracketGap,
    deckNeeds: args.deckNeeds,
    powerPlan: args.powerPlan,
  };
}
