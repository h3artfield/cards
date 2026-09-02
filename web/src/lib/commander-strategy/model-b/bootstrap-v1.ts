import type { ModelAPodObservation } from "../model-a/types";

export const BOOTSTRAP_SEED = 20260811;
export const BOOTSTRAP_REPLICATES = 1000;
export const BOOTSTRAP_CLUSTER_UNIT = "tournamentId" as const;

/** Mulberry32 PRNG for reproducible bootstrap. */
export function createSeededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export type PodLogLossRow = {
  podId: string;
  tournamentId: string;
  logLossByModel: Record<string, number>;
};

export function perPodLogLossRows(input: {
  observations: ModelAPodObservation[];
  predictors: Record<string, (obs: ModelAPodObservation) => number[]>;
}): PodLogLossRow[] {
  return input.observations.map((obs) => {
    const logLossByModel: Record<string, number> = {};
    for (const [name, predict] of Object.entries(input.predictors)) {
      const probs = predict(obs);
      logLossByModel[name] = -Math.log(Math.max(probs[obs.winnerSeatIndex]!, 1e-15));
    }
    return {
      podId: obs.podId,
      tournamentId: obs.tournamentId,
      logLossByModel,
    };
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const weight = idx - lo;
  return sorted[lo]! * (1 - weight) + sorted[hi]! * weight;
}

export function bootstrapDeltaLogLossCI(input: {
  rows: PodLogLossRow[];
  baselineModel: string;
  challengerModel: string;
  seed?: number;
  replicates?: number;
}): {
  comparison: string;
  deltaLogLoss: number;
  bootstrapMethod: string;
  bootstrapSeed: number;
  bootstrapReplicates: number;
  clusterUnit: typeof BOOTSTRAP_CLUSTER_UNIT;
  confidenceLevel: 0.95;
  ciLower: number;
  ciUpper: number;
} {
  const seed = input.seed ?? BOOTSTRAP_SEED;
  const replicates = input.replicates ?? BOOTSTRAP_REPLICATES;
  const rand = createSeededRandom(seed);

  const byTournament = new Map<string, PodLogLossRow[]>();
  for (const row of input.rows) {
    const bucket = byTournament.get(row.tournamentId) ?? [];
    bucket.push(row);
    byTournament.set(row.tournamentId, bucket);
  }
  const tournamentIds = [...byTournament.keys()];

  const observedDelta =
    mean(input.rows.map((r) => r.logLossByModel[input.baselineModel]! - r.logLossByModel[input.challengerModel]!));

  const bootstrapDeltas: number[] = [];
  for (let b = 0; b < replicates; b++) {
    const sampleRows: PodLogLossRow[] = [];
    for (let i = 0; i < tournamentIds.length; i++) {
      const tid = tournamentIds[Math.floor(rand() * tournamentIds.length)]!;
      sampleRows.push(...(byTournament.get(tid) ?? []));
    }
    bootstrapDeltas.push(
      mean(sampleRows.map((r) => r.logLossByModel[input.baselineModel]! - r.logLossByModel[input.challengerModel]!)),
    );
  }

  bootstrapDeltas.sort((a, b) => a - b);

  return {
    comparison: `${input.challengerModel}_vs_${input.baselineModel}`,
    deltaLogLoss: observedDelta,
    bootstrapMethod: "paired_tournament_cluster_bootstrap_percentile_ci",
    bootstrapSeed: seed,
    bootstrapReplicates: replicates,
    clusterUnit: BOOTSTRAP_CLUSTER_UNIT,
    confidenceLevel: 0.95,
    ciLower: percentile(bootstrapDeltas, 0.025),
    ciUpper: percentile(bootstrapDeltas, 0.975),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function bootstrapAllComparisons(input: {
  rows: PodLogLossRow[];
  comparisons: Array<{ baseline: string; challenger: string }>;
}): ReturnType<typeof bootstrapDeltaLogLossCI>[] {
  return input.comparisons.map(({ baseline, challenger }) =>
    bootstrapDeltaLogLossCI({
      rows: input.rows,
      baselineModel: baseline,
      challengerModel: challenger,
    }),
  );
}
