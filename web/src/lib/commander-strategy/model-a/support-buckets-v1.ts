import type { CommanderSupportBucket } from "./types";

export const SUPPORT_BUCKET_THRESHOLDS = {
  highMinTrainAppearances: 100,
  mediumMinTrainAppearances: 10,
} as const;

export function commanderSupportBucket(
  trainSeatAppearances: number,
): CommanderSupportBucket {
  if (trainSeatAppearances === 0) return "unseen";
  if (trainSeatAppearances >= SUPPORT_BUCKET_THRESHOLDS.highMinTrainAppearances) return "high";
  if (trainSeatAppearances >= SUPPORT_BUCKET_THRESHOLDS.mediumMinTrainAppearances) return "medium";
  return "low";
}

export function podMinSupportBucket(
  commanderConfigIds: string[],
  trainAppearances: Map<string, number>,
): CommanderSupportBucket {
  let worst: CommanderSupportBucket = "high";
  const rank: Record<CommanderSupportBucket, number> = {
    high: 0,
    medium: 1,
    low: 2,
    unseen: 3,
  };
  for (const id of commanderConfigIds) {
    const bucket = commanderSupportBucket(trainAppearances.get(id) ?? 0);
    if (rank[bucket] > rank[worst]) worst = bucket;
  }
  return worst;
}

export function winnerSupportBucket(
  commanderConfigIds: string[],
  winnerSeatIndex: number,
  trainAppearances: Map<string, number>,
): CommanderSupportBucket {
  return commanderSupportBucket(
    trainAppearances.get(commanderConfigIds[winnerSeatIndex] ?? "") ?? 0,
  );
}
