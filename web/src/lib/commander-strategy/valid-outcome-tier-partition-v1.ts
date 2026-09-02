import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { buildCommanderConfiguration } from "./commander-configuration-v1";
import type { PodObservability } from "./tier-classification-v1";
import { classifyPodObservability } from "./tier-classification-v1";
import type { NormalizedDeckInstance, TopdeckPodGame } from "./types";
import type { PodOutcomeState } from "./pod-outcome-audit-v1";

export type ValidOutcomeTierCategory =
  | "TIER_A"
  | "TIER_B"
  | "TIER_C"
  | "TIER_X_COMMANDER_INSUFFICIENT"
  | "TIER_X_PARTICIPANT_OR_DECK_MISSING"
  | "FUTURE_SCHEDULED";

export type ValidOutcomeTierPartition = {
  validWinnerHistoricalPods: number;
  tierA: number;
  tierB: number;
  tierC: number;
  tierXCommanderInsufficient: number;
  tierXParticipantOrDeckMissing: number;
  futureScheduledValidWinnerPods: number;
  partitionSum: number;
  partitionMatchesValidWinnerHistorical: boolean;
  byCategory: Record<
    ValidOutcomeTierCategory,
    { count: number; podIdsSample: string[] }
  >;
};

export function classifyValidOutcomeTier(input: {
  podObs: PodObservability;
  deckById: Map<string, NormalizedDeckInstance>;
  pod: TopdeckPodGame;
}): ValidOutcomeTierCategory {
  const { podObs, deckById, pod } = input;

  if (!podObs.historical) return "FUTURE_SCHEDULED";
  if (podObs.outcomeState !== "validWinner") {
    throw new Error("classifyValidOutcomeTier requires validWinner historical pod");
  }

  for (const participant of pod.participants) {
    if (!deckById.get(participant.deckInstanceId)) {
      return "TIER_X_PARTICIPANT_OR_DECK_MISSING";
    }
  }

  if (podObs.seatsWithCommanderConfigurationResolved !== podObs.seatsTotal) {
    return "TIER_X_COMMANDER_INSUFFICIENT";
  }

  if (podObs.tier === "TIER_A") return "TIER_A";
  if (podObs.tier === "TIER_B") return "TIER_B";
  if (podObs.tier === "TIER_C") return "TIER_C";

  if (podObs.seatsWithDecklist === 0) return "TIER_C";
  return "TIER_B";
}

export function partitionValidWinnerHistoricalPods(input: {
  pods: TopdeckPodGame[];
  deckById: Map<string, NormalizedDeckInstance>;
  podOutcomeById: Map<string, PodOutcomeState>;
  historical: (pod: TopdeckPodGame) => boolean;
  catalog?: DeckResolutionCatalog;
  useStoredResolutionOnly?: boolean;
}): ValidOutcomeTierPartition {
  const counts: Record<ValidOutcomeTierCategory, { count: number; podIdsSample: string[] }> = {
    TIER_A: { count: 0, podIdsSample: [] },
    TIER_B: { count: 0, podIdsSample: [] },
    TIER_C: { count: 0, podIdsSample: [] },
    TIER_X_COMMANDER_INSUFFICIENT: { count: 0, podIdsSample: [] },
    TIER_X_PARTICIPANT_OR_DECK_MISSING: { count: 0, podIdsSample: [] },
    FUTURE_SCHEDULED: { count: 0, podIdsSample: [] },
  };

  let validWinnerHistoricalPods = 0;
  let futureScheduledValidWinnerPods = 0;

  for (const pod of input.pods) {
    if (pod.status !== "Completed" || pod.participants.length < 2) continue;
    const outcomeState = input.podOutcomeById.get(pod.podId);
    if (outcomeState !== "validWinner") continue;

    const podObs = classifyPodObservability({
      pod,
      deckById: input.deckById,
      historical: input.historical(pod),
      outcomeState,
      catalog: input.catalog,
      useStoredResolutionOnly: input.useStoredResolutionOnly ?? true,
    });

    if (!podObs.historical) {
      futureScheduledValidWinnerPods += 1;
      const bucket = counts.FUTURE_SCHEDULED;
      bucket.count += 1;
      if (bucket.podIdsSample.length < 10) bucket.podIdsSample.push(pod.podId);
      continue;
    }

    validWinnerHistoricalPods += 1;
    const category = classifyValidOutcomeTier({ podObs, deckById: input.deckById, pod });
    const bucket = counts[category];
    bucket.count += 1;
    if (bucket.podIdsSample.length < 10) bucket.podIdsSample.push(pod.podId);
  }

  const partitionSum =
    counts.TIER_A.count +
    counts.TIER_B.count +
    counts.TIER_C.count +
    counts.TIER_X_COMMANDER_INSUFFICIENT.count +
    counts.TIER_X_PARTICIPANT_OR_DECK_MISSING.count;

  return {
    validWinnerHistoricalPods,
    tierA: counts.TIER_A.count,
    tierB: counts.TIER_B.count,
    tierC: counts.TIER_C.count,
    tierXCommanderInsufficient: counts.TIER_X_COMMANDER_INSUFFICIENT.count,
    tierXParticipantOrDeckMissing: counts.TIER_X_PARTICIPANT_OR_DECK_MISSING.count,
    futureScheduledValidWinnerPods,
    partitionSum,
    partitionMatchesValidWinnerHistorical: partitionSum === validWinnerHistoricalPods,
    byCategory: counts,
  };
}
