import type {
  CandidateMarketSnapshot,
  CompMatchAssessment,
  CompRejectionReason,
  MarketSearchPlan,
  RawMarketComp,
} from "./types";
import { assessMarketComps, partitionCompAssessments } from "./comp-matcher";
import { fetchMarketCompsForPlan } from "./market-fetchers";
import type { MarketSourceHealth } from "./source-health-types";
import {
  buildMarketOutcomeSummary,
  buildQueryStrategyAudits,
  extractPricingSignalDetails,
  mergeAssessmentCountsIntoHealth,
} from "./source-health";

function soldCompSources(source: RawMarketComp["source"]): boolean {
  return source === "ebay_sold";
}

function pricingSignalSources(source: RawMarketComp["source"]): boolean {
  return (
    source === "tcgplayer" ||
    source === "pricecharting" ||
    source === "scryfall_print_price"
  );
}

function applyPricingSignalOutlierPass(
  accepted: CompMatchAssessment[],
  allAssessments: CompMatchAssessment[],
): {
  updated: CompMatchAssessment[];
  warnings: string[];
} {
  const activePrices = allAssessments
    .filter((a) => a.comp.source === "ebay_active" && a.comp.price > 0)
    .map((a) => a.comp.price);
  if (activePrices.length < 2) {
    return { updated: accepted, warnings: [] };
  }

  const sorted = [...activePrices].sort((a, b) => a - b);
  const sanityLow = sorted[0]!;
  const sanityHigh = sorted[sorted.length - 1]!;
  const warnings: string[] = [];

  const updated = accepted.map((a) => {
    if (a.status !== "accepted" || !pricingSignalSources(a.comp.source)) {
      return a;
    }
    const p = a.comp.price;
    const isOutlier =
      p > sanityHigh * 2.5 && p > sanityLow + 5 && p > sanityHigh + 10;
    if (!isOutlier) return a;

    warnings.push(
      `Pricing signal outlier blocked: $${p.toFixed(2)} vs active sanity range $${sanityLow.toFixed(2)}–$${sanityHigh.toFixed(2)} (${a.comp.source})`,
    );
    return {
      ...a,
      status: "rejected" as const,
      rejectionReasons: [
        ...a.rejectionReasons,
        "pricing_signal_outlier",
      ] as CompRejectionReason[],
      notes: [
        ...a.notes,
        `Active listing sanity range $${sanityLow.toFixed(2)}–$${sanityHigh.toFixed(2)} — signal $${p.toFixed(2)} flagged as outlier.`,
      ],
    };
  });

  return { updated, warnings };
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function applyOutlierPass(
  accepted: CompMatchAssessment[],
): {
  finalAccepted: CompMatchAssessment[];
  outlierMaybe: CompMatchAssessment[];
  warnings: string[];
} {
  const soldAccepted = accepted.filter((a) => soldCompSources(a.comp.source));
  const prices = soldAccepted.map((a) => a.comp.price).filter((p) => p > 0);
  const med = median(prices);
  const warnings: string[] = [];
  const outlierMaybe: CompMatchAssessment[] = [];
  const finalAccepted: CompMatchAssessment[] = [];

  if (!med || prices.length < 2) {
    return { finalAccepted: accepted, outlierMaybe, warnings };
  }

  for (const a of accepted) {
    const p = a.comp.price;
    if (p > med * 3 || p < med / 3) {
      outlierMaybe.push({
        ...a,
        status: "maybe",
        rejectionReasons: [...a.rejectionReasons, "price_outlier"],
        notes: [
          ...a.notes,
          `Potential outlier: $${p.toFixed(2)} vs median cluster ~$${med.toFixed(2)}`,
        ],
      });
      warnings.push(`Outlier comp moved to maybe: ${a.comp.title.slice(0, 60)}`);
    } else {
      finalAccepted.push(a);
    }
  }

  return { finalAccepted, outlierMaybe, warnings };
}

function ebaySoldAuthFailure(sourceHealth?: MarketSourceHealth[]): boolean {
  const ebaySold = sourceHealth?.find((h) => h.source === "ebay_sold");
  return (
    ebaySold?.fatalError === "authorization_or_scope_failure" ||
    ebaySold?.httpStatus === 403
  );
}

export function calculateShadowMarketValue(input: {
  plan: MarketSearchPlan;
  assessments: CompMatchAssessment[];
  lockedIdentityUsed: boolean;
  fetchWarnings: string[];
  sourceHealth?: MarketSourceHealth[];
}): Pick<
  CandidateMarketSnapshot,
  | "valueLow"
  | "valueMedian"
  | "valueHigh"
  | "confidence"
  | "pricingMethod"
  | "warnings"
  | "acceptedComps"
  | "rejectedComps"
  | "maybeComps"
> {
  const { accepted, rejected, maybe } = partitionCompAssessments(input.assessments);
  const { finalAccepted, outlierMaybe, warnings: outlierWarnings } =
    applyOutlierPass(accepted);
  const { updated: outlierChecked, warnings: signalOutlierWarnings } =
    applyPricingSignalOutlierPass(finalAccepted, input.assessments);
  const postOutlierAccepted = outlierChecked.filter((a) => a.status === "accepted");
  const signalOutlierRejected = outlierChecked.filter((a) => a.status === "rejected");

  const maybeAll = [...maybe, ...outlierMaybe, ...signalOutlierRejected];
  const soldAccepted = postOutlierAccepted.filter((a) => soldCompSources(a.comp.source));
  const prices = soldAccepted.map((a) => a.comp.price).filter((p) => p > 0);

  const pricingSignalAssessments = postOutlierAccepted.filter((a) =>
    pricingSignalSources(a.comp.source),
  );
  const signalPrices = pricingSignalAssessments
    .map((a) => a.comp.price)
    .filter((p) => p > 0);

  const warnings = [...input.fetchWarnings, ...outlierWarnings, ...signalOutlierWarnings];

  // Case A: accepted sold comps
  if (prices.length) {
    const med = median(prices)!;
    const sorted = [...prices].sort((a, b) => a - b);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];

    let confidence: CandidateMarketSnapshot["confidence"] = "low";
    if (
      input.lockedIdentityUsed &&
      soldAccepted.length >= 3 &&
      warnings.filter((w) => w.includes("variant") || w.includes("Excluded")).length ===
        0
    ) {
      confidence = "high";
    } else if (input.lockedIdentityUsed && soldAccepted.length >= 1) {
      confidence = "medium";
    } else if (!input.lockedIdentityUsed) {
      confidence = "low";
      warnings.push("Identity not locked — candidate snapshot only.");
    }

    if (maybeAll.length > 0 && soldAccepted.length < 3) {
      confidence = confidence === "high" ? "medium" : "low";
    }

    const pricingMethod =
      soldAccepted.length >= 3
        ? "accepted_sold_comps_median"
        : "accepted_sold_comps_thin";

    return {
      acceptedComps: postOutlierAccepted,
      rejectedComps: [...rejected, ...signalOutlierRejected],
      maybeComps: maybeAll,
      valueLow: low,
      valueMedian: med,
      valueHigh: high,
      confidence,
      pricingMethod,
      warnings,
    };
  }

  // Case B: pricing signals only (TCGplayer / PriceCharting)
  if (signalPrices.length) {
    const med = median(signalPrices)!;
    const sorted = [...signalPrices].sort((a, b) => a - b);
    const sources = new Set(pricingSignalAssessments.map((a) => a.comp.source));
    const hasPc = sources.has("pricecharting");
    const hasTcg = sources.has("tcgplayer");

    let pricingMethod = "price_signal_only";
    if (hasPc && hasTcg) pricingMethod = "price_signal_blend_tcgplayer_pricecharting";
    else if (hasPc) pricingMethod = "price_signal_only_pricecharting";
    else if (hasTcg) pricingMethod = "price_signal_only_tcgplayer";
    else if (sources.has("scryfall_print_price"))
      pricingMethod = "price_signal_only_scryfall_print_price";

    let confidence: CandidateMarketSnapshot["confidence"] = "low";
    if (signalPrices.length >= 2 && sources.size >= 2) {
      confidence = "medium";
    }

    const signalLabels = pricingSignalAssessments
      .map((a) => `${a.comp.source} ${a.comp.conditionText ?? ""}`.trim())
      .join(", ");
    warnings.push(
      `Shadow value from pricing signal(s): ${signalLabels} — not sold comps.`,
    );
    if (ebaySoldAuthFailure(input.sourceHealth)) {
      warnings.push("eBay sold unavailable due to authorization/scope failure (403).");
    }
    if (!input.lockedIdentityUsed) {
      warnings.push("Identity not locked — candidate snapshot only.");
    }

    return {
      acceptedComps: postOutlierAccepted,
      rejectedComps: [...rejected, ...signalOutlierRejected],
      maybeComps: maybeAll,
      valueLow: sorted[0],
      valueMedian: med,
      valueHigh: sorted[sorted.length - 1],
      confidence,
      pricingMethod,
      warnings,
    };
  }

  // Case C: active listings sanity check only
  const hasActiveMaybe = maybeAll.some((a) => a.comp.source === "ebay_active");
  if (hasActiveMaybe) {
    if (ebaySoldAuthFailure(input.sourceHealth)) {
      warnings.push("eBay sold unavailable — active listings are sanity check only.");
    }
    return {
      acceptedComps: postOutlierAccepted,
      rejectedComps: [...rejected, ...signalOutlierRejected],
      maybeComps: maybeAll,
      confidence: "none",
      pricingMethod: "active_listings_only_sanity_check",
      warnings,
    };
  }

  // Case D: no market data
  return {
    acceptedComps: postOutlierAccepted,
    rejectedComps: [...rejected, ...signalOutlierRejected],
    maybeComps: maybeAll,
    confidence: "none",
    pricingMethod: "no_market_data",
    warnings,
  };
}

export async function buildCandidateMarketSnapshot(
  plan: MarketSearchPlan,
): Promise<CandidateMarketSnapshot> {
  const fetchResult = await fetchMarketCompsForPlan(plan);
  const { comps, warnings: fetchWarnings, sourceHealth: fetchHealth, queryFetchMeta } =
    fetchResult;
  const assessments = assessMarketComps(comps, plan);

  const sourceHealth = mergeAssessmentCountsIntoHealth(fetchHealth, assessments);
  const queryAudits = buildQueryStrategyAudits(assessments, queryFetchMeta);
  const pricingSignalDetails = extractPricingSignalDetails(assessments);

  const value = calculateShadowMarketValue({
    plan,
    assessments,
    lockedIdentityUsed: plan.lockedIdentityUsed,
    fetchWarnings,
    sourceHealth,
  });

  const marketOutcome = buildMarketOutcomeSummary({
    sourceHealth,
    assessments,
    pricingSignalDetails,
    pricingMethod: value.pricingMethod,
    valueMedian: value.valueMedian,
    confidence: value.confidence,
    tcgplayerMapping: fetchResult.tcgplayerMapping,
    priceChartingMapping: fetchResult.priceChartingMapping,
  });

  return {
    suspectId: plan.suspectId,
    lockedIdentityUsed: plan.lockedIdentityUsed,
    marketProductName: plan.marketProductName,
    searchPlan: plan,
    rawComps: comps,
    compAssessments: assessments,
    sourceHealth,
    queryAudits,
    marketOutcome: {
      ...marketOutcome,
    },
    tcgplayerMapping: fetchResult.tcgplayerMapping,
    priceChartingMapping: fetchResult.priceChartingMapping,
    createdAt: new Date().toISOString(),
    ...value,
  };
}
