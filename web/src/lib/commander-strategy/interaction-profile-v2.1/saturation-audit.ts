/**
 * Saturation / distribution audit helpers (P1).
 */
import type { SaturationFlag } from "./types";

export type DistributionStats = {
  count: number;
  mean: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  p5: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  fractionZero: number;
  distinctValueCount: number;
  saturationFlag: SaturationFlag;
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base] ?? 0;
  return (sorted[base] ?? 0) + rest * ((sorted[base + 1] ?? 0) - (sorted[base] ?? 0));
}

export function computeDistributionStats(values: number[]): DistributionStats {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const fractionZero = n > 0 ? values.filter((v) => v === 0).length / n : 0;
  const rounded = values.map((v) => Math.round(v * 1e6) / 1e6);
  const distinctValueCount = new Set(rounded).size;

  let saturationFlag: SaturationFlag = "healthy_variation";
  const nonzeroFrac = 1 - fractionZero;
  if (nonzeroFrac >= 0.98 && stdDev < 0.005) saturationFlag = "near_constant";
  else if (nonzeroFrac >= 0.95 && stdDev < 0.02) saturationFlag = "saturated";
  else if (nonzeroFrac < 0.05 && distinctValueCount > 1) saturationFlag = "sparse_but_usable";
  else if (variance === 0 && n > 0) saturationFlag = "near_constant";

  return {
    count: n,
    mean,
    stdDev,
    variance,
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
    p5: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    fractionZero,
    distinctValueCount,
    saturationFlag,
  };
}
