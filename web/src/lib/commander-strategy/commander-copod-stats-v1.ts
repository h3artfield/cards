import type { CommanderCoPodObservation, TopdeckPodGame } from "./types";

export type CommanderPodStats = {
  oracleId: string;
  pods: number;
  wins: number;
  winRate: number;
  podBaseline: number;
  winLift: number;
};

export type CoPodPairKey = string;

export function commanderPairKey(a: string, b: string): CoPodPairKey {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function accumulateCommanderPodStats(pods: TopdeckPodGame[]): {
  commanderStats: Map<string, CommanderPodStats>;
  pairStats: Map<
    CoPodPairKey,
    {
      aOracleId: string;
      bOracleId: string;
      sharedPodCount: number;
      aWins: number;
      bWins: number;
      otherWins: number;
      draws: number;
    }
  >;
} {
  const commanderStats = new Map<string, CommanderPodStats>();
  const pairStats = new Map<
    CoPodPairKey,
    {
      aOracleId: string;
      bOracleId: string;
      sharedPodCount: number;
      aWins: number;
      bWins: number;
      otherWins: number;
      draws: number;
    }
  >();

  for (const pod of pods) {
    if (pod.status !== "Completed" || pod.participants.length < 2) continue;
    const baseline = 1 / pod.podSize;
    const primaryCommanderByPlayer = new Map<string, string>();
    for (const p of pod.participants) {
      const cmd = p.commanderOracleIds[0];
      if (!cmd) continue;
      primaryCommanderByPlayer.set(p.playerIdHash, cmd);

      const existing = commanderStats.get(cmd) ?? {
        oracleId: cmd,
        pods: 0,
        wins: 0,
        winRate: 0,
        podBaseline: baseline,
        winLift: 0,
      };
      existing.pods += 1;
      if (p.winner) existing.wins += 1;
      commanderStats.set(cmd, existing);
    }

    const commandersInPod = [...new Set([...primaryCommanderByPlayer.values()])];
    for (let i = 0; i < commandersInPod.length; i += 1) {
      for (let j = i + 1; j < commandersInPod.length; j += 1) {
        const a = commandersInPod[i];
        const b = commandersInPod[j];
        const key = commanderPairKey(a, b);
        const row = pairStats.get(key) ?? {
          aOracleId: a < b ? a : b,
          bOracleId: a < b ? b : a,
          sharedPodCount: 0,
          aWins: 0,
          bWins: 0,
          otherWins: 0,
          draws: 0,
        };
        row.sharedPodCount += 1;
        if (pod.draw) {
          row.draws += 1;
        } else if (pod.winnerPlayerIdHash) {
          const winnerCmd = primaryCommanderByPlayer.get(pod.winnerPlayerIdHash);
          if (winnerCmd === row.aOracleId) row.aWins += 1;
          else if (winnerCmd === row.bOracleId) row.bWins += 1;
          else row.otherWins += 1;
        }
        pairStats.set(key, row);
      }
    }
  }

  for (const stat of commanderStats.values()) {
    stat.winRate = stat.pods > 0 ? stat.wins / stat.pods : 0;
    stat.podBaseline = stat.pods > 0 ? stat.podBaseline : 0.25;
    stat.winLift = stat.winRate - stat.podBaseline;
  }

  return { commanderStats, pairStats };
}

export function toCoPodObservation(
  row: {
    aOracleId: string;
    bOracleId: string;
    sharedPodCount: number;
    aWins: number;
    bWins: number;
    otherWins: number;
    draws: number;
  },
  podSizeBaseline = 0.25,
): CommanderCoPodObservation {
  const aObservedWinRate = row.sharedPodCount > 0 ? row.aWins / row.sharedPodCount : 0;
  const bObservedWinRate = row.sharedPodCount > 0 ? row.bWins / row.sharedPodCount : 0;
  return {
    commanderAOracleId: row.aOracleId,
    commanderBOracleId: row.bOracleId,
    sharedPodCount: row.sharedPodCount,
    aWins: row.aWins,
    bWins: row.bWins,
    otherWins: row.otherWins,
    draws: row.draws,
    aObservedWinRate,
    bObservedWinRate,
    podBaseline: podSizeBaseline,
    aWinLift: aObservedWinRate - podSizeBaseline,
    bWinLift: bObservedWinRate - podSizeBaseline,
    label: "co-pod performance",
  };
}
