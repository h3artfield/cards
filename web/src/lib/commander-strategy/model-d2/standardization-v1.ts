import type { LoadedFeatureRow } from "../model-c/feature-matrix-io-v1";

const EPS = 1e-8;

export type NewBlockStandardizer = {
  columnNames: string[];
  means: Float64Array;
  stds: Float64Array;
  rule: "train_mean_std_zscore";
};

export function fitNewBlockStandardizer(input: {
  rows: Iterable<LoadedFeatureRow>;
  columnIndices: number[];
  columnNames: string[];
}): NewBlockStandardizer {
  const d = input.columnIndices.length;
  const means = new Float64Array(d);
  const m2 = new Float64Array(d);
  let n = 0;

  for (const row of input.rows) {
    n += 1;
    for (let j = 0; j < d; j += 1) {
      const colIdx = input.columnIndices[j]!;
      const x = row.denseValues[colIdx] ?? 0;
      const delta = x - means[j]!;
      means[j]! += delta / n;
      const delta2 = x - means[j]!;
      m2[j]! += delta * delta2;
    }
  }

  const stds = new Float64Array(d);
  const zeroStdColumns: string[] = [];
  for (let j = 0; j < d; j += 1) {
    const variance = n > 1 ? m2[j]! / n : 0;
    stds[j] = Math.sqrt(Math.max(variance, 0));
    if (stds[j]! < EPS) {
      zeroStdColumns.push(input.columnNames[j] ?? String(j));
    }
  }
  if (zeroStdColumns.length > 0) {
    throw new Error(
      `Zero TRAIN standard deviation in new-block columns (hard fail): ${zeroStdColumns.join(", ")}`,
    );
  }

  return {
    columnNames: input.columnNames,
    means,
    stds,
    rule: "train_mean_std_zscore",
  };
}

export function standardizeNewBlockValues(
  row: LoadedFeatureRow,
  columnIndices: number[],
  standardizer: NewBlockStandardizer,
): Float64Array {
  const out = new Float64Array(columnIndices.length);
  for (let j = 0; j < columnIndices.length; j += 1) {
    const raw = row.denseValues[columnIndices[j]!] ?? 0;
    out[j] = (raw - standardizer.means[j]!) / standardizer.stds[j]!;
  }
  return out;
}

export function serializeStandardizer(standardizer: NewBlockStandardizer): Record<string, unknown> {
  return {
    rule: standardizer.rule,
    columnNames: standardizer.columnNames,
    means: [...standardizer.means],
    stds: [...standardizer.stds],
  };
}
