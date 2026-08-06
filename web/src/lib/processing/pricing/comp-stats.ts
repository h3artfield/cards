import type { SoldComp } from "../../types";

export type CompMethod = "trimmed_mean" | "median" | "single_tier" | "catalog_tier";
export type CompConfidence = "high" | "medium" | "low";

export interface CompCandidate {
  price: number;
  date?: string;
  source: string;
  condition?: string;
  title?: string;
}

export interface CompAggregation {
  marketPrice: number;
  comps: SoldComp[];
  compsExcluded: SoldComp[];
  compMethod: CompMethod;
  compCount: number;
  confidence: CompConfidence;
}

const MAD_Z_THRESHOLD = 3.5;
const MIN_COMPS_FOR_TRIMMED_MEAN = 5;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function trimmedMean(values: number[], trimFraction = 0.1): number {
  if (!values.length) return 0;
  if (values.length < MIN_COMPS_FOR_TRIMMED_MEAN) return median(values);

  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * trimFraction);
  const slice = sorted.slice(trim, sorted.length - trim || undefined);
  if (!slice.length) return median(sorted);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

/** Modified Z-score (MAD) outlier filter — drops typo/mistake listings. */
export function filterOutlierPrices(
  candidates: CompCandidate[],
): { kept: CompCandidate[]; excluded: CompCandidate[] } {
  if (candidates.length <= 2) {
    return { kept: candidates, excluded: [] };
  }

  const prices = candidates.map((c) => c.price);
  const med = median(prices);
  const absDeviations = prices.map((p) => Math.abs(p - med));
  const mad = median(absDeviations);

  if (mad === 0) {
    return { kept: candidates, excluded: [] };
  }

  const kept: CompCandidate[] = [];
  const excluded: CompCandidate[] = [];

  for (const candidate of candidates) {
    const modifiedZ = (0.6745 * Math.abs(candidate.price - med)) / mad;
    if (modifiedZ > MAD_Z_THRESHOLD) excluded.push(candidate);
    else kept.push(candidate);
  }

  if (!kept.length) {
    return { kept: candidates, excluded: [] };
  }

  return { kept, excluded };
}

function toSoldComp(c: CompCandidate): SoldComp {
  return {
    price: c.price,
    date: c.date,
    source: c.source,
    condition: c.condition,
    title: c.title,
  };
}

function confidenceFrom(count: number, method: CompMethod): CompConfidence {
  if (method === "single_tier" || method === "catalog_tier") {
    return count >= 3 ? "medium" : "low";
  }
  if (count >= 5) return "high";
  if (count >= 3) return "medium";
  return "low";
}

/** Aggregate sold/listing candidates into a robust market price. */
export function aggregateComps(
  candidates: CompCandidate[],
  options?: { methodHint?: CompMethod },
): CompAggregation {
  const valid = candidates.filter((c) => c.price > 0 && Number.isFinite(c.price));
  if (!valid.length) {
    return {
      marketPrice: 0,
      comps: [],
      compsExcluded: [],
      compMethod: options?.methodHint ?? "median",
      compCount: 0,
      confidence: "low",
    };
  }

  if (valid.length === 1) {
    return {
      marketPrice: valid[0]!.price,
      comps: [toSoldComp(valid[0]!)],
      compsExcluded: [],
      compMethod: "single_tier",
      compCount: 1,
      confidence: "low",
    };
  }

  const { kept, excluded } = filterOutlierPrices(valid);
  const prices = kept.map((c) => c.price);

  let compMethod: CompMethod;
  let marketPrice: number;

  if (options?.methodHint === "catalog_tier") {
    compMethod = "catalog_tier";
    marketPrice = trimmedMean(prices);
  } else if (prices.length >= MIN_COMPS_FOR_TRIMMED_MEAN) {
    compMethod = "trimmed_mean";
    marketPrice = trimmedMean(prices);
  } else {
    compMethod = "median";
    marketPrice = median(prices);
  }

  return {
    marketPrice: Math.round(marketPrice * 100) / 100,
    comps: kept.map(toSoldComp),
    compsExcluded: excluded.map(toSoldComp),
    compMethod,
    compCount: kept.length,
    confidence: confidenceFrom(kept.length, compMethod),
  };
}
