import type { ModelAPodObservation } from "../model-a/types";
import { SUPPORT_BUCKET_THRESHOLDS } from "../model-a/support-buckets-v1";
import type { CommanderSupportBucket } from "../model-a/types";

export function countTrainPlayerAppearances(
  observations: ModelAPodObservation[],
): Map<string, { seatAppearances: number; wins: number }> {
  const stats = new Map<string, { seatAppearances: number; wins: number }>();
  for (const obs of observations) {
    for (const seat of obs.seats) {
      const row = stats.get(seat.playerHash) ?? { seatAppearances: 0, wins: 0 };
      row.seatAppearances += 1;
      if (seat.winner) row.wins += 1;
      stats.set(seat.playerHash, row);
    }
  }
  return stats;
}

export function playerSupportBucket(trainSeatAppearances: number): CommanderSupportBucket {
  if (trainSeatAppearances === 0) return "unseen";
  if (trainSeatAppearances >= SUPPORT_BUCKET_THRESHOLDS.highMinTrainAppearances) return "high";
  if (trainSeatAppearances >= SUPPORT_BUCKET_THRESHOLDS.mediumMinTrainAppearances) return "medium";
  return "low";
}

export function buildTrainPlayerSet(observations: ModelAPodObservation[]): Set<string> {
  const players = new Set<string>();
  for (const obs of observations) {
    for (const seat of obs.seats) players.add(seat.playerHash);
  }
  return players;
}

export type PlayerCoverageStats = {
  uniqueTrainPlayers: number;
  uniqueTestPlayers: number;
  unseenTestPlayers: number;
  testSeatsSeenInTrainPct: number;
  testPodsAllPlayersSeenPct: number;
};

export function computePlayerCoverageStats(input: {
  trainObservations: ModelAPodObservation[];
  testObservations: ModelAPodObservation[];
}): PlayerCoverageStats {
  const trainPlayers = buildTrainPlayerSet(input.trainObservations);
  const testPlayers = buildTrainPlayerSet(input.testObservations);

  let testSeats = 0;
  let testSeatsSeen = 0;
  let testPodsAllSeen = 0;

  for (const obs of input.testObservations) {
    let allSeen = true;
    for (const seat of obs.seats) {
      testSeats += 1;
      if (trainPlayers.has(seat.playerHash)) {
        testSeatsSeen += 1;
      } else {
        allSeen = false;
      }
    }
    if (allSeen) testPodsAllSeen += 1;
  }

  let unseenTestPlayers = 0;
  for (const player of testPlayers) {
    if (!trainPlayers.has(player)) unseenTestPlayers += 1;
  }

  return {
    uniqueTrainPlayers: trainPlayers.size,
    uniqueTestPlayers: testPlayers.size,
    unseenTestPlayers,
    testSeatsSeenInTrainPct: testSeats > 0 ? testSeatsSeen / testSeats : 0,
    testPodsAllPlayersSeenPct:
      input.testObservations.length > 0 ? testPodsAllSeen / input.testObservations.length : 0,
  };
}
