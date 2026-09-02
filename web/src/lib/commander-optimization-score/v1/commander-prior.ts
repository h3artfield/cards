/**
 * COS_V1_UNIVERSAL_COMMANDER_BASELINE_V1
 *
 * Maps commander-card features → a provisional intercept Ŝ.
 * Frozen COS v1 S_c is used unchanged when the commander is in MODEL.
 * This prior is fit only on those frozen intercepts — not on new outcomes.
 */
import { COS_V1_COMMANDER_PRIOR_FEATURE_NAMES } from "./commander-prior-features";

export const COS_V1_UNIVERSAL_COMMANDER_BASELINE_VERSION = "COS_V1_UNIVERSAL_COMMANDER_BASELINE_V1" as const;

export type CosV1CommanderPriorArtifact = {
  version: typeof COS_V1_UNIVERSAL_COMMANDER_BASELINE_VERSION;
  method: "knn";
  k: number;
  featureNames: string[];
  mu: number[];
  sd: number[];
  commanders: Array<{ identity: string; z: number[]; S: number }>;
};

export function standardizePriorFeatures(x: number[], mu: number[], sd: number[]): number[] {
  return x.map((v, i) => {
    const scale = sd[i] && sd[i]! > 1e-9 ? sd[i]! : 1;
    return (v - (mu[i] ?? 0)) / scale;
  });
}

function squaredDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return s;
}

export function predictCommanderPriorIntercept(args: {
  x: number[];
  covered: number;
  prior: CosV1CommanderPriorArtifact;
}): number {
  if (args.prior.method !== "knn" || args.prior.commanders.length === 0) {
    return 0;
  }
  if (args.covered <= 0) {
    const mean = args.prior.commanders.reduce((s, row) => s + row.S, 0) / args.prior.commanders.length;
    return mean;
  }
  const z = standardizePriorFeatures(args.x, args.prior.mu, args.prior.sd);
  const ranked = args.prior.commanders
    .map((row) => ({ S: row.S, d2: squaredDistance(z, row.z) }))
    .sort((a, b) => a.d2 - b.d2 || a.S - b.S);
  const k = Math.min(args.prior.k, ranked.length);
  const neighbors = ranked.slice(0, k);
  let num = 0;
  let den = 0;
  for (const n of neighbors) {
    const w = 1 / (n.d2 + 1e-6);
    num += w * n.S;
    den += w;
  }
  return den > 0 ? num / den : neighbors[0]!.S;
}

export function assertCommanderPriorContract(prior: CosV1CommanderPriorArtifact): void {
  if (prior.version !== COS_V1_UNIVERSAL_COMMANDER_BASELINE_VERSION) {
    throw new Error("COS commander prior version mismatch");
  }
  if (prior.featureNames.join("|") !== COS_V1_COMMANDER_PRIOR_FEATURE_NAMES.join("|")) {
    throw new Error("COS commander prior feature contract mismatch");
  }
}
