import type { LoadedFeatureRow } from "./feature-matrix-io-v1";

const EPS = 1e-8;

export type FeatureStandardizer = {
  columnNames: string[];
  means: Float64Array;
  stds: Float64Array;
};

export function fitFeatureStandardizer(input: {
  rows: Iterable<LoadedFeatureRow>;
  columnCount: number;
}): FeatureStandardizer {
  const means = new Float64Array(input.columnCount);
  const m2 = new Float64Array(input.columnCount);
  let n = 0;

  for (const row of input.rows) {
    n += 1;
    for (let j = 0; j < input.columnCount; j += 1) {
      const x = row.denseValues[j] ?? 0;
      const delta = x - means[j]!;
      means[j]! += delta / n;
      const delta2 = x - means[j]!;
      m2[j]! += delta * delta2;
    }
  }

  const stds = new Float64Array(input.columnCount);
  for (let j = 0; j < input.columnCount; j += 1) {
    const variance = n > 1 ? m2[j]! / n : 0;
    stds[j] = Math.sqrt(Math.max(variance, 0));
    if (stds[j]! < EPS) stds[j] = 1;
  }

  return { columnNames: [], means, stds };
}

export function standardizeDenseValues(
  values: number[],
  standardizer: FeatureStandardizer,
): Float64Array {
  const out = new Float64Array(values.length);
  for (let j = 0; j < values.length; j += 1) {
    out[j] = (values[j]! - standardizer.means[j]!) / standardizer.stds[j]!;
  }
  return out;
}
