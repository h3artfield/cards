import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  buildCommanderConfiguration,
  type CommanderConfiguration,
} from "./commander-configuration-v1";
import { resolveCatalogCardByName } from "./resolve-catalog-card-by-name";
import type { NormalizedDeckInstance, TopdeckPodGame } from "./types";
import { isOutcomeTrainingEligible, type PodOutcomeState } from "./pod-outcome-audit-v1";

export type DatasetTier = "TIER_A" | "TIER_B" | "TIER_C" | "EXCLUDED";

export type SeatObservability = {
  seatsTotal: number;
  seatsWithCommanderConfigurationResolved: number;
  seatsWithDecklist: number;
  seatsWithFullyResolvedDecklist: number;
  seatsWithDeckSemanticProfileEligible: number;
  outcomeTrainingEligible: boolean;
};

export type PodObservability = SeatObservability & {
  podId: string;
  podSize: number;
  tier: DatasetTier;
  decklistCompleteness: string;
  historical: boolean;
  outcomeState?: PodOutcomeState;
};

export type TierCounts = {
  tierA: number;
  tierB: number;
  tierC: number;
  excluded: number;
};

export type DecklistCompletenessDistribution = Record<string, number>;

function isDecklistUsable(deck: NormalizedDeckInstance | undefined): boolean {
  return Boolean(deck?.decklistAvailable || deck?.deckObjAvailable);
}

function isFullyResolvedDecklist(
  deck: NormalizedDeckInstance | undefined,
  catalog?: DeckResolutionCatalog,
  useStoredResolutionOnly = true,
): boolean {
  if (!deck) return false;
  if (!isDecklistUsable(deck)) return false;
  if (deck.commanderResolutionStatus !== "resolved") return false;
  if (deck.mainboard.length === 0) return false;
  return deck.mainboard.every((c) => {
    if (c.resolutionStatus === "resolved") return true;
    if (useStoredResolutionOnly || !catalog) return false;
    return resolveCatalogCardByName(c.sourceName, catalog).status === "resolved";
  });
}

function isSemanticProfileEligible(
  deck: NormalizedDeckInstance | undefined,
  catalog?: DeckResolutionCatalog,
  useStoredResolutionOnly = true,
): boolean {
  if (!isFullyResolvedDecklist(deck, catalog, useStoredResolutionOnly)) return false;
  if (!useStoredResolutionOnly) return (deck!.commanderOracleIds.length ?? 0) > 0;
  return !deck!.deckHash.startsWith("unresolved:") && deck!.commanderOracleIds.length > 0;
}

export function classifyPodObservability(input: {
  pod: TopdeckPodGame;
  deckById: Map<string, NormalizedDeckInstance>;
  historical: boolean;
  outcomeState?: PodOutcomeState;
  catalog?: DeckResolutionCatalog;
  useStoredResolutionOnly?: boolean;
}): PodObservability {
  const { pod, deckById, historical } = input;
  const useStoredResolutionOnly = input.useStoredResolutionOnly ?? true;
  const seatsTotal = pod.participants.length;
  let seatsWithCommanderConfigurationResolved = 0;
  let seatsWithDecklist = 0;
  let seatsWithFullyResolvedDecklist = 0;
  let seatsWithDeckSemanticProfileEligible = 0;

  for (const participant of pod.participants) {
    const deck = deckById.get(participant.deckInstanceId);
    const config = deck
      ? buildCommanderConfiguration({
          commanderOracleIds: deck.commanderOracleIds,
          commanderNames: deck.commanders.map((c) => c.sourceName),
        })
      : null;
    if (config) seatsWithCommanderConfigurationResolved += 1;
    if (isDecklistUsable(deck)) seatsWithDecklist += 1;
    if (isFullyResolvedDecklist(deck, input.catalog, useStoredResolutionOnly)) {
      seatsWithFullyResolvedDecklist += 1;
    }
    if (isSemanticProfileEligible(deck, input.catalog, useStoredResolutionOnly)) {
      seatsWithDeckSemanticProfileEligible += 1;
    }
  }

  const outcomeTrainingEligible =
    historical &&
    Boolean(input.outcomeState && isOutcomeTrainingEligible(input.outcomeState, historical));

  const resolvedSeats = seatsWithDecklist;
  const decklistCompleteness = `${resolvedSeats}/${seatsTotal}`;

  let tier: DatasetTier = "EXCLUDED";
  if (
    historical &&
    outcomeTrainingEligible &&
    seatsWithCommanderConfigurationResolved === seatsTotal &&
    seatsTotal >= 2
  ) {
    if (
      seatsWithFullyResolvedDecklist === seatsTotal &&
      seatsWithDeckSemanticProfileEligible === seatsTotal
    ) {
      tier = "TIER_A";
    } else if (seatsWithDecklist > 0) {
      tier = "TIER_B";
    } else {
      tier = "TIER_C";
    }
  }

  return {
    podId: pod.podId,
    podSize: seatsTotal,
    seatsTotal,
    seatsWithCommanderConfigurationResolved,
    seatsWithDecklist,
    seatsWithFullyResolvedDecklist,
    seatsWithDeckSemanticProfileEligible,
    outcomeTrainingEligible,
    decklistCompleteness,
    historical,
    outcomeState: input.outcomeState,
    tier,
  };
}

export function summarizeTierCounts(pods: PodObservability[]): TierCounts {
  const counts = { tierA: 0, tierB: 0, tierC: 0, excluded: 0 };
  for (const pod of pods) {
    if (pod.tier === "TIER_A") counts.tierA += 1;
    else if (pod.tier === "TIER_B") counts.tierB += 1;
    else if (pod.tier === "TIER_C") counts.tierC += 1;
    else counts.excluded += 1;
  }
  return counts;
}

export function decklistDistributionForPodSize(
  pods: PodObservability[],
  podSize: number,
): DecklistCompletenessDistribution {
  const out: DecklistCompletenessDistribution = {};
  for (const pod of pods) {
    if (pod.podSize !== podSize || !pod.historical) continue;
    const key = pod.decklistCompleteness;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export function summarizeObservationBuckets(pods: PodObservability[]): {
  fullyObservedOutcomePods: number;
  partiallyObservedPods: number;
  noDecklistPods: number;
} {
  let fullyObservedOutcomePods = 0;
  let partiallyObservedPods = 0;
  let noDecklistPods = 0;

  for (const pod of pods) {
    if (!pod.historical || !pod.outcomeTrainingEligible) continue;
    if (pod.tier === "TIER_A") fullyObservedOutcomePods += 1;
    else if (pod.seatsWithDecklist === 0) noDecklistPods += 1;
    else partiallyObservedPods += 1;
  }

  return { fullyObservedOutcomePods, partiallyObservedPods, noDecklistPods };
}

export type { CommanderConfiguration };
