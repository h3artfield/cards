/**
 * COS_V1_UNIVERSAL_COVERAGE_V1
 *
 * Coverage/calibration around frozen COS v1. Does not change MODEL/REFERENCE/FORMULA/SCHEMA
 * hashes or the n>=30 commander-specific BO/profile path.
 */
import { COS_V1_MIN_COMMANDER_UNIQUE } from "./constants";
import { percentileFromGrid } from "./percentile";
import type { CosV1Reference } from "./types";

export const COS_V1_UNIVERSAL_COVERAGE_VERSION = "COS_V1_UNIVERSAL_COVERAGE_V1" as const;

export type CosV1ReferenceDepth = "STRONG" | "MODERATE" | "LIMITED" | "NEW_COMMANDER";

export type CosV1OracleCardFacts = {
  name?: string;
  typeLine?: string;
  manaValue?: number | null;
  oracleText?: string;
  colorIdentity?: string[];
};

export type CosV1OracleLookup = {
  resolveName?: (name: string) => { oracleId: string; name: string } | null;
  cardByOracleId?: (oracleId: string) => CosV1OracleCardFacts | null;
};

export function mainboardCopies(
  mainboard: Array<{ quantity?: number }>,
): number {
  return mainboard.reduce((sum, card) => sum + Math.max(0, Number(card.quantity || 1)), 0);
}

export function commanderReferenceDepth(args: {
  commanderKnown: boolean;
  nUnique: number;
}): CosV1ReferenceDepth {
  if (!args.commanderKnown || args.nUnique <= 0) return "NEW_COMMANDER";
  if (args.nUnique >= COS_V1_MIN_COMMANDER_UNIQUE) return "STRONG";
  if (args.nUnique >= 10) return "MODERATE";
  return "LIMITED";
}

/** Frozen monotonic blend weight: w = n / 30, clamped to [0, 1]. */
export function commanderBlendWeight(nUnique: number): number {
  if (nUnique <= 0) return 0;
  if (nUnique >= COS_V1_MIN_COMMANDER_UNIQUE) return 1;
  return nUnique / COS_V1_MIN_COMMANDER_UNIQUE;
}

export function mixturePercentile(
  value: number,
  parts: Array<{ weight: number; grid: number[] }>,
): number {
  if (!parts.length) return 0;
  let p = 0;
  let w = 0;
  for (const part of parts) {
    if (!part.grid.length || part.weight <= 0) continue;
    p += part.weight * percentileFromGrid(value, part.grid);
    w += part.weight;
  }
  return w > 0 ? p / w : 0;
}

let cachedMixture: { key: CosV1Reference; parts: Array<{ weight: number; grid: number[] }> } | null =
  null;

export function globalResidualMixture(reference: CosV1Reference): Array<{ weight: number; grid: number[] }> {
  if (cachedMixture?.key === reference) return cachedMixture.parts;
  const rows = Object.values(reference.commanders).filter(
    (cmd) =>
      cmd.eligibleBuildOptimization &&
      cmd.nUnique >= COS_V1_MIN_COMMANDER_UNIQUE &&
      cmd.residualQuantiles?.length === 101,
  );
  const total = rows.reduce((sum, cmd) => sum + cmd.nUnique, 0) || 1;
  const parts = rows.map((cmd) => ({
    weight: cmd.nUnique / total,
    grid: cmd.residualQuantiles as number[],
  }));
  cachedMixture = { key: reference, parts };
  return parts;
}

export function globalProfileMixture(
  reference: CosV1Reference,
  axisId: string,
): Array<{ weight: number; grid: number[] }> {
  const rows = Object.values(reference.commanders).filter(
    (cmd) =>
      cmd.nUnique >= COS_V1_MIN_COMMANDER_UNIQUE &&
      cmd.profileQuantiles?.[axisId]?.length === 101,
  );
  const total = rows.reduce((sum, cmd) => sum + cmd.nUnique, 0) || 1;
  return rows.map((cmd) => ({
    weight: cmd.nUnique / total,
    grid: cmd.profileQuantiles[axisId] as number[],
  }));
}

/**
 * n>=30: caller must use the frozen commander grid directly (bit-identical).
 * 1..29: F* = w F_c + (1-w) F_global when F_c exists; otherwise F_global.
 * 0: F_global.
 */
export function blendedReferencePercentile(args: {
  value: number;
  nUnique: number;
  commanderGrid: number[] | null | undefined;
  globalPercentile: number;
}): number {
  const w = commanderBlendWeight(args.nUnique);
  if (w >= 1 && args.commanderGrid?.length === 101) {
    return percentileFromGrid(args.value, args.commanderGrid);
  }
  if (w > 0 && args.commanderGrid?.length === 101) {
    return w * percentileFromGrid(args.value, args.commanderGrid) + (1 - w) * args.globalPercentile;
  }
  return args.globalPercentile;
}

export function referenceDepthCopy(depth: CosV1ReferenceDepth, nUnique: number): string {
  switch (depth) {
    case "STRONG":
      return `${nUnique} same-commander reference decks`;
    case "MODERATE":
      return `${nUnique} same-commander decks · blended with broader COS reference`;
    case "LIMITED":
      return `Limited commander history · ${nUnique} observed list${nUnique === 1 ? "" : "s"}`;
    case "NEW_COMMANDER":
      return "New commander · broader COS reference used";
  }
}
