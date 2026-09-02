import type { ModelAPodObservation } from "../model-a/types";
import { readFileSync } from "node:fs";
import { filterByModelBCohort, type ModelBCohortFilter } from "../model-b/evaluation-v1";
import type { ModelBPredictionRow } from "../model-b/types";
import type { NormalizedDeckInstance } from "../types";
import type { LoadedFeatureRow } from "./feature-matrix-io-v1";

export type ModelCCohortFilter =
  | ModelBCohortFilter
  | "deckHashSeenInTrain"
  | "cardNoveltyAtLeast1"
  | "cardNoveltyAtLeast5"
  | "cardNoveltyAtLeast10"
  | "gameChangerCount0"
  | "gameChangerCount1"
  | "gameChangerCount2"
  | "gameChangerCount3"
  | "gameChangerCount4Plus";

export function loadFrozenModelBPredictions(path: string): Map<string, number[]> {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const map = new Map<string, number[]>();
  for (const line of lines) {
    const row = JSON.parse(line) as ModelBPredictionRow;
    map.set(row.podId, row.modelBPredictedProbabilityBySeat);
  }
  return map;
}

export function buildGcCountByDeckHash(
  featureRowsByKey: Map<string, LoadedFeatureRow>,
  denseColumnNames: string[],
): Map<string, number> {
  const gcTotalIdx = denseColumnNames.indexOf("gc_countTotal");
  const map = new Map<string, number>();
  for (const row of featureRowsByKey.values()) {
    if (map.has(row.deckHash)) continue;
    map.set(row.deckHash, gcTotalIdx >= 0 ? Math.round(row.denseValues[gcTotalIdx] ?? 0) : 0);
  }
  return map;
}

export const NOVELTY_COHORT_PREDICATE = {
  description:
    "For each TEST pod, compute per-seat trainUnseenMainboardOracleIdCount: count of distinct resolved paper-eligible mainboard oracleIds not present in TRAIN mainboard (commander-zone oracleIds excluded from both TRAIN vocabulary and per-deck counts). Pod qualifies for cardNoveltyAtLeastK when max(seatCounts) >= K.",
  trainOracleIdRule:
    "TRAIN oracleId vocabulary = all resolved paper-eligible mainboard oracleIds observed in TRAIN pods (commander-zone cards excluded).",
  perSeatCountRule:
    "Per seat: distinct mainboard oracleIds with resolutionStatus=resolved, paperEligible, not in commander set, and not in TRAIN vocabulary.",
  podMembershipRule:
    "cardNoveltyAtLeastK pod iff max over seats of per-seat trainUnseenMainboardOracleIdCount >= K.",
  thresholds: {
    cardNoveltyAtLeast1: 1,
    cardNoveltyAtLeast5: 5,
    cardNoveltyAtLeast10: 10,
  },
} as const;

export type NoveltyCohortKey = "cardNoveltyAtLeast1" | "cardNoveltyAtLeast5" | "cardNoveltyAtLeast10";

export function deckTrainUnseenCardCount(input: {
  deckHash: string;
  deckByHash: Map<string, NormalizedDeckInstance>;
  trainOracleIds: Set<string>;
}): number {
  const deck = input.deckByHash.get(input.deckHash);
  if (!deck) return 0;
  const commanderSet = new Set(deck.commanderOracleIds);
  const unseen = new Set<string>();
  for (const card of deck.mainboard) {
    if (!card.oracleId || !card.paperEligible || card.resolutionStatus !== "resolved") continue;
    if (commanderSet.has(card.oracleId)) continue;
    if (!input.trainOracleIds.has(card.oracleId)) unseen.add(card.oracleId);
  }
  return unseen.size;
}

export function summarizeNoveltyCohortMembership(input: {
  observations: ModelAPodObservation[];
  trainOracleIds: Set<string>;
  deckByHash: Map<string, NormalizedDeckInstance>;
  threshold: number;
}): {
  threshold: number;
  qualifyingPodCount: number;
  qualifyingSeatCount: number;
  uniqueQualifyingDeckCount: number;
  perSeatCountAtLeastThreshold: number;
} {
  let qualifyingPodCount = 0;
  let qualifyingSeatCount = 0;
  const qualifyingDeckHashes = new Set<string>();
  let perSeatCountAtLeastThreshold = 0;

  for (const obs of input.observations) {
    const seatCounts = obs.seats.map((seat) =>
      deckTrainUnseenCardCount({
        deckHash: seat.deckHash,
        deckByHash: input.deckByHash,
        trainOracleIds: input.trainOracleIds,
      }),
    );
    const maxUnseen = seatCounts.length > 0 ? Math.max(...seatCounts) : 0;
    if (maxUnseen < input.threshold) continue;
    qualifyingPodCount += 1;
    for (let i = 0; i < obs.seats.length; i += 1) {
      const seat = obs.seats[i]!;
      const count = seatCounts[i] ?? 0;
      if (count >= input.threshold) {
        qualifyingSeatCount += 1;
        perSeatCountAtLeastThreshold += 1;
        if (!seat.deckHash.startsWith("unresolved:")) qualifyingDeckHashes.add(seat.deckHash);
      }
    }
  }

  return {
    threshold: input.threshold,
    qualifyingPodCount,
    qualifyingSeatCount,
    uniqueQualifyingDeckCount: qualifyingDeckHashes.size,
    perSeatCountAtLeastThreshold,
  };
}

export type ExplicitLogLossComparison = {
  label: string;
  baseline: string;
  challenger: string;
  baselineLogLoss: number;
  challengerLogLoss: number;
  deltaLogLoss: number;
  challengerBetter: boolean;
};

export function explicitLogLossComparison(input: {
  baseline: string;
  challenger: string;
  logLossByModel: Record<string, number>;
}): ExplicitLogLossComparison {
  const baselineLogLoss = input.logLossByModel[input.baseline]!;
  const challengerLogLoss = input.logLossByModel[input.challenger]!;
  return {
    label: `${input.challenger} vs ${input.baseline}`,
    baseline: input.baseline,
    challenger: input.challenger,
    baselineLogLoss,
    challengerLogLoss,
    deltaLogLoss: baselineLogLoss - challengerLogLoss,
    challengerBetter: challengerLogLoss < baselineLogLoss,
  };
}

export function filterByModelCCohort(
  observations: ModelAPodObservation[],
  cohort: ModelCCohortFilter,
  input: {
    trainDeckHashes: Set<string>;
    trainPlayers: Set<string>;
    trainPlayerAppearances: Map<string, number>;
    trainOracleIds: Set<string>;
    deckByHash: Map<string, NormalizedDeckInstance>;
    featureRowsByKey: Map<string, LoadedFeatureRow>;
    gcCountByDeckHash: Map<string, number>;
  },
): ModelAPodObservation[] {
  if (
    cohort === "deckHashSeenInTrain" ||
    cohort === "cardNoveltyAtLeast1" ||
    cohort === "cardNoveltyAtLeast5" ||
    cohort === "cardNoveltyAtLeast10" ||
    cohort.startsWith("gameChangerCount")
  ) {
    return observations.filter((obs) => {
      const anyDeckUnseen = obs.seats.some(
        (s) => !s.deckHash.startsWith("unresolved:") && !input.trainDeckHashes.has(s.deckHash),
      );
      if (cohort === "deckHashSeenInTrain") return !anyDeckUnseen;

      const maxUnseen = Math.max(
        ...obs.seats.map((s) =>
          deckTrainUnseenCardCount({
            deckHash: s.deckHash,
            deckByHash: input.deckByHash,
            trainOracleIds: input.trainOracleIds,
          }),
        ),
      );
      if (cohort === "cardNoveltyAtLeast1") return maxUnseen >= 1;
      if (cohort === "cardNoveltyAtLeast5") return maxUnseen >= 5;
      if (cohort === "cardNoveltyAtLeast10") return maxUnseen >= 10;

      const gcCounts = obs.seats.map((s) => input.gcCountByDeckHash.get(s.deckHash) ?? 0);
      const maxGc = Math.max(...gcCounts);
      if (cohort === "gameChangerCount0") return maxGc === 0;
      if (cohort === "gameChangerCount1") return maxGc === 1;
      if (cohort === "gameChangerCount2") return maxGc === 2;
      if (cohort === "gameChangerCount3") return maxGc === 3;
      if (cohort === "gameChangerCount4Plus") return maxGc >= 4;
      return true;
    });
  }

  return filterByModelBCohort(observations, cohort, {
    trainDeckHashes: input.trainDeckHashes,
    trainPlayers: input.trainPlayers,
    trainPlayerAppearances: input.trainPlayerAppearances,
  });
}
