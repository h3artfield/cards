/**
 * Permutation-invariant opponent reducers — frozen convention for D2 experiment.
 * varianceAcrossOpponents uses SAMPLE variance (divide by n-1 when n > 1).
 */
export const OPPONENT_REDUCERS = [
  "meanAcrossOpponents",
  "maxAcrossOpponents",
  "minAcrossOpponents",
  "varianceAcrossOpponents",
] as const;

export type OpponentReducer = (typeof OPPONENT_REDUCERS)[number];

export const VARIANCE_CONVENTION = "sample_variance_divide_by_n_minus_1" as const;

export function meanAcrossOpponents(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function maxAcrossOpponents(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

export function minAcrossOpponents(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/** Sample variance; 0 when n <= 1. */
export function varianceAcrossOpponents(values: number[]): number {
  const n = values.length;
  if (n <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
}

export function applyOpponentReducer(values: number[], reducer: OpponentReducer): number {
  switch (reducer) {
    case "meanAcrossOpponents":
      return meanAcrossOpponents(values);
    case "maxAcrossOpponents":
      return maxAcrossOpponents(values);
    case "minAcrossOpponents":
      return minAcrossOpponents(values);
    case "varianceAcrossOpponents":
      return varianceAcrossOpponents(values);
    default:
      return 0;
  }
}

export function reduceAcrossOpponents(
  values: number[],
): Record<OpponentReducer, number> {
  return {
    meanAcrossOpponents: meanAcrossOpponents(values),
    maxAcrossOpponents: maxAcrossOpponents(values),
    minAcrossOpponents: minAcrossOpponents(values),
    varianceAcrossOpponents: varianceAcrossOpponents(values),
  };
}
