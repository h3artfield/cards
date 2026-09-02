import type { ModelAMetrics } from "./model-a/types";
import type { ModelAPodObservation } from "./model-a/types";
import { uniformProbabilities } from "./model-a/baselines-v1";

/** Frozen metric definitions for Models A–C. Do not change without a version bump. */
export const EVALUATION_METRICS_VERSION = "commander-model-metrics-v1";

export const FROZEN_METRIC_DEFINITIONS = {
  version: EVALUATION_METRICS_VERSION,
  logLoss: {
    name: "pod_multiclass_log_loss",
    aggregationUnit: "pod",
    formula:
      "mean over pods of -log(predicted_probability[winner_seat]). One winner per pod; draws excluded.",
  },
  brierScore: {
    name: "multiclass_seat_brier_v1",
    aggregationUnit: "seat",
    formula:
      "mean over all (pod, seat) pairs of (predicted_probability[seat] - outcome[seat])^2 where outcome[winner]=1 and 0 otherwise.",
    normalization: "Divide by total seat count across evaluated pods (handles mixed 3/4-player pods).",
    deprecatedFormula:
      "Model A v1 incorrectly divided by pod_count * seats[0].length, understating Brier ~3.3% on mixed-size TEST.",
  },
  expectedCalibrationError: {
    name: "seat_level_ece_v1",
    aggregationUnit: "seat",
    formula:
      "Weighted mean absolute difference between bin predicted mean and bin actual win rate across seat-level predictions.",
  },
  topPredictedSeatAccuracy: {
    name: "pod_argmax_accuracy",
    aggregationUnit: "pod",
    note: "Secondary metric only. Ties at argmax use first-seat convention; unreliable for uniform/equal-probability models.",
  },
} as const;

export type SeatPredictionRow = { predicted: number; actual: number };

export function computeMetricsFromSeatPredictions(input: {
  observations: ModelAPodObservation[];
  seatPredictionsByPod: Map<string, number[]>;
}): ModelAMetrics {
  if (input.observations.length === 0) return emptyMetrics();

  let logLoss = 0;
  let brier = 0;
  let topCorrect = 0;
  let uniformLogLoss = 0;
  const seatPredictions: SeatPredictionRow[] = [];

  for (const obs of input.observations) {
    const probs = input.seatPredictionsByPod.get(obs.podId);
    if (!probs || probs.length !== obs.seats.length) {
      throw new Error(`Missing or mismatched predictions for pod ${obs.podId}`);
    }
    const uniform = uniformProbabilities(obs.podSize);
    logLoss -= Math.log(Math.max(probs[obs.winnerSeatIndex]!, 1e-15));
    uniformLogLoss -= Math.log(Math.max(uniform[obs.winnerSeatIndex]!, 1e-15));

    let bestIdx = 0;
    let bestP = probs[0] ?? 0;
    for (let i = 0; i < obs.seats.length; i++) {
      const target = i === obs.winnerSeatIndex ? 1 : 0;
      brier += (probs[i]! - target) ** 2;
      seatPredictions.push({ predicted: probs[i]!, actual: target });
      if ((probs[i] ?? 0) > bestP) {
        bestP = probs[i] ?? 0;
        bestIdx = i;
      }
    }
    if (bestIdx === obs.winnerSeatIndex) topCorrect += 1;
  }

  const podCount = input.observations.length;
  const seatCount = seatPredictions.length;
  const calibrationBins = buildCalibrationBins(seatPredictions);
  const ece =
    calibrationBins.reduce((sum, bin) => sum + bin.count * Math.abs(bin.predictedMean - bin.actualWinRate), 0) /
    seatCount;

  return {
    podCount,
    logLoss: logLoss / podCount,
    brierScore: brier / seatCount,
    topPredictedSeatAccuracy: topCorrect / podCount,
    expectedCalibrationError: ece,
    logLikelihoodImprovementOverUniform: uniformLogLoss / podCount - logLoss / podCount,
    calibrationBins,
  };
}

export function evaluateObservationPredictorV1(
  observations: ModelAPodObservation[],
  predict: (obs: ModelAPodObservation) => number[],
): ModelAMetrics {
  const seatPredictionsByPod = new Map<string, number[]>();
  for (const obs of observations) {
    seatPredictionsByPod.set(obs.podId, predict(obs));
  }
  return computeMetricsFromSeatPredictions({ observations, seatPredictionsByPod });
}

function buildCalibrationBins(
  seatPredictions: SeatPredictionRow[],
): ModelAMetrics["calibrationBins"] {
  const edges = [
    { label: "10-15%", lo: 0.1, hi: 0.15 },
    { label: "15-20%", lo: 0.15, hi: 0.2 },
    { label: "20-25%", lo: 0.2, hi: 0.25 },
    { label: "25-30%", lo: 0.25, hi: 0.3 },
    { label: "30-35%", lo: 0.3, hi: 0.35 },
    { label: "35-40%", lo: 0.35, hi: 0.4 },
    { label: "40%+", lo: 0.4, hi: 1.01 },
    { label: "<10%", lo: 0, hi: 0.1 },
  ];

  return edges
    .map(({ label, lo, hi }) => {
      let count = 0;
      let probSum = 0;
      let wins = 0;
      for (const row of seatPredictions) {
        if (row.predicted >= lo && row.predicted < hi) {
          count += 1;
          probSum += row.predicted;
          wins += row.actual;
        }
      }
      return {
        binLabel: label,
        predictedMean: count > 0 ? probSum / count : 0,
        actualWinRate: count > 0 ? wins / count : 0,
        count,
      };
    })
    .filter((b) => b.count > 0);
}

function emptyMetrics(): ModelAMetrics {
  return {
    podCount: 0,
    logLoss: NaN,
    brierScore: NaN,
    topPredictedSeatAccuracy: NaN,
    expectedCalibrationError: NaN,
    logLikelihoodImprovementOverUniform: NaN,
    calibrationBins: [],
  };
}

/** Deprecated Model A v1 Brier (for reconciliation report only). */
export function deprecatedModelABrierScore(
  observations: ModelAPodObservation[],
  predict: (obs: ModelAPodObservation) => number[],
): number {
  let brier = 0;
  for (const obs of observations) {
    const probs = predict(obs);
    for (let i = 0; i < obs.seats.length; i++) {
      const target = i === obs.winnerSeatIndex ? 1 : 0;
      brier += (probs[i]! - target) ** 2;
    }
  }
  const n = observations.length;
  return brier / (n * (observations[0]?.seats.length ?? 1));
}

export function countDistinctTournamentClusters(observations: ModelAPodObservation[]): number {
  return new Set(observations.map((o) => o.tournamentId)).size;
}
