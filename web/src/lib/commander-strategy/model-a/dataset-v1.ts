import type { CombinedCorpus } from "../combined-corpus-v1";
import type { TrainingSnapshotManifest } from "../training-snapshot-v1";
import { isEligibleObservationDate } from "../training-snapshot-v1";
import { buildCommanderConfiguration } from "../commander-configuration-v1";
import type { ModelAPodObservation, ModelASeat } from "./types";
import { PRIMARY_POD_SIZES } from "./types";
import type { TopdeckPodGame } from "../types";

function winnerSeatIndex(pod: TopdeckPodGame): number | null {
  const winnerHash = pod.winnerPlayerIdHash;
  if (!winnerHash) return null;
  const idx = pod.participants.findIndex((p) => p.playerIdHash === winnerHash);
  return idx >= 0 ? idx : null;
}

function seatFromParticipant(
  participant: TopdeckPodGame["participants"][number],
  seatIndex: number,
  deckById: CombinedCorpus["combined"]["deckById"],
): ModelASeat | null {
  const deck = deckById.get(participant.deckInstanceId);
  const configId =
    participant.commanderConfigurationId ??
    (deck
      ? buildCommanderConfiguration({
          commanderOracleIds: deck.commanderOracleIds,
          commanderNames: deck.commanders.map((c) => c.sourceName),
        })?.commanderConfigurationId
      : undefined);
  if (!configId) return null;
  return {
    seatIndex,
    playerHash: participant.playerIdHash,
    commanderConfigurationId: configId,
    deckHash: participant.deckHash,
    winner: participant.winner,
  };
}

export function buildPodObservation(input: {
  pod: TopdeckPodGame;
  deckById: CombinedCorpus["combined"]["deckById"];
  split: ModelAPodObservation["split"];
}): ModelAPodObservation | null {
  if (!isEligibleObservationDate(input.pod.tournamentDate)) return null;
  if (input.pod.draw) return null;
  const winnerIdx = winnerSeatIndex(input.pod);
  if (winnerIdx === null) return null;

  const seats: ModelASeat[] = [];
  for (let i = 0; i < input.pod.participants.length; i++) {
    const seat = seatFromParticipant(input.pod.participants[i]!, i, input.deckById);
    if (!seat) return null;
    seats.push(seat);
  }

  return {
    podId: input.pod.podId,
    tournamentId: input.pod.tid,
    tournamentDate: input.pod.tournamentDate,
    podSize: input.pod.participants.length,
    seats,
    winnerSeatIndex: winnerIdx,
    split: input.split,
    primaryPodSize: PRIMARY_POD_SIZES.has(input.pod.participants.length),
  };
}

export function loadSplitObservations(input: {
  manifest: TrainingSnapshotManifest;
  corpus: CombinedCorpus;
  split: ModelAPodObservation["split"];
}): ModelAPodObservation[] {
  const splitSpec = input.manifest.chronologicalSplits[input.split];
  const podById = new Map(input.corpus.combined.pods.map((p) => [p.podId, p]));
  const observations: ModelAPodObservation[] = [];

  for (const podId of splitSpec.tierAPodIds) {
    const pod = podById.get(podId);
    if (!pod) continue;
    const obs = buildPodObservation({
      pod,
      deckById: input.corpus.combined.deckById,
      split: input.split,
    });
    if (obs) observations.push(obs);
  }
  return observations;
}

export function countTrainCommanderAppearances(
  observations: ModelAPodObservation[],
): Map<string, { seatAppearances: number; podAppearances: number; wins: number }> {
  const stats = new Map<string, { seatAppearances: number; podAppearances: number; wins: number }>();
  for (const obs of observations) {
    const seenInPod = new Set<string>();
    for (const seat of obs.seats) {
      const row = stats.get(seat.commanderConfigurationId) ?? {
        seatAppearances: 0,
        podAppearances: 0,
        wins: 0,
      };
      row.seatAppearances += 1;
      if (seat.winner) row.wins += 1;
      stats.set(seat.commanderConfigurationId, row);
      seenInPod.add(seat.commanderConfigurationId);
    }
    for (const configId of seenInPod) {
      const row = stats.get(configId)!;
      row.podAppearances += 1;
    }
  }
  return stats;
}

export function buildTrainDeckHashSet(observations: ModelAPodObservation[]): Set<string> {
  const hashes = new Set<string>();
  for (const obs of observations) {
    for (const seat of obs.seats) {
      if (seat.deckHash && !seat.deckHash.startsWith("unresolved:")) {
        hashes.add(seat.deckHash);
      }
    }
  }
  return hashes;
}

export function buildTrainCommanderConfigSet(observations: ModelAPodObservation[]): Set<string> {
  const configs = new Set<string>();
  for (const obs of observations) {
    for (const seat of obs.seats) {
      configs.add(seat.commanderConfigurationId);
    }
  }
  return configs;
}

export function filterPrimaryPodSize(observations: ModelAPodObservation[]): ModelAPodObservation[] {
  return observations.filter((o) => o.primaryPodSize);
}

export function podSizeDistribution(observations: ModelAPodObservation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const obs of observations) {
    const key = String(obs.podSize);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
