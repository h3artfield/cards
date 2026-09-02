import type { ModelD2Variant } from "./types";
import {
  interactionFeatureNames,
  opponentMarginalFeatureNames,
  selfProfileFeatureNames,
} from "./pod-ipv2-features-v1";

export function modelD2VariantFeatureNames(variant: ModelD2Variant): {
  selfProfile: string[];
  opponentMarginal: string[];
  interaction: string[];
  ipv2Added: string[];
  all: string[];
} {
  const selfProfile = selfProfileFeatureNames();
  const opponentMarginal = opponentMarginalFeatureNames();
  const interaction = interactionFeatureNames();

  if (variant === "P0") {
    return {
      selfProfile,
      opponentMarginal: [],
      interaction: [],
      ipv2Added: selfProfile,
      all: selfProfile,
    };
  }
  if (variant === "P1") {
    const ipv2Added = [...selfProfile, ...opponentMarginal];
    return {
      selfProfile,
      opponentMarginal,
      interaction: [],
      ipv2Added,
      all: ipv2Added,
    };
  }
  const ipv2Added = [...selfProfile, ...opponentMarginal, ...interaction];
  return {
    selfProfile,
    opponentMarginal,
    interaction,
    ipv2Added,
    all: ipv2Added,
  };
}

export function assertFeatureNesting(): {
  pass: boolean;
  checks: Array<{ check: string; pass: boolean }>;
} {
  const p0 = new Set(modelD2VariantFeatureNames("P0").all);
  const p1 = new Set(modelD2VariantFeatureNames("P1").all);
  const d2 = new Set(modelD2VariantFeatureNames("D2").all);
  const checks = [
    {
      check: "features(P0) ⊂ features(P1)",
      pass: [...p0].every((k) => p1.has(k)),
    },
    {
      check: "features(P1) ⊂ features(D2)",
      pass: [...p1].every((k) => d2.has(k)),
    },
    {
      check: "P1 adds only opponent marginals over P0",
      pass: modelD2VariantFeatureNames("P1").opponentMarginal.every((k) => p1.has(k) && !p0.has(k)),
    },
    {
      check: "D2 adds only interaction terms over P1",
      pass: modelD2VariantFeatureNames("D2").interaction.every((k) => d2.has(k) && !p1.has(k)),
    },
  ];
  return { pass: checks.every((c) => c.pass), checks };
}

export function sanitizeFeatureMap(features: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(features)) {
    out[key] = Number.isFinite(value) ? value : 0;
  }
  return out;
}

export function checkNumericIntegrity(features: Record<string, number>): {
  nanCount: number;
  infCount: number;
  keys: string[];
} {
  let nanCount = 0;
  let infCount = 0;
  const keys: string[] = [];
  for (const [key, value] of Object.entries(features)) {
    if (Number.isNaN(value)) {
      nanCount += 1;
      keys.push(key);
    } else if (!Number.isFinite(value)) {
      infCount += 1;
      keys.push(key);
    }
  }
  return { nanCount, infCount, keys };
}

export function computeColumnVariance(values: number[]): number {
  const n = values.length;
  if (n <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
}

export function findDuplicateColumns(
  columnNames: string[],
): { exactDuplicates: string[][]; pass: boolean } {
  const byName = new Map<string, number>();
  const exactDuplicates: string[][] = [];
  for (const name of columnNames) {
    const count = (byName.get(name) ?? 0) + 1;
    byName.set(name, count);
  }
  for (const [name, count] of byName) {
    if (count > 1) exactDuplicates.push(Array(count).fill(name));
  }
  return { exactDuplicates, pass: exactDuplicates.length === 0 };
}

export function findNearDuplicateColumns(input: {
  columnNames: string[];
  rowValues: number[][];
  tolerance?: number;
}): Array<{ colA: string; colB: string; maxAbsDiff: number }> {
  const tol = input.tolerance ?? 1e-12;
  const pairs: Array<{ colA: string; colB: string; maxAbsDiff: number }> = [];
  const n = input.columnNames.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let maxDiff = 0;
      for (const row of input.rowValues) {
        maxDiff = Math.max(maxDiff, Math.abs((row[i] ?? 0) - (row[j] ?? 0)));
      }
      if (maxDiff <= tol) {
        pairs.push({
          colA: input.columnNames[i]!,
          colB: input.columnNames[j]!,
          maxAbsDiff: maxDiff,
        });
      }
    }
  }
  return pairs;
}
