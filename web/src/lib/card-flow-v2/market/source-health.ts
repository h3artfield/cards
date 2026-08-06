import type {
  CompMatchAssessment,
  MarketSource,
  RawMarketComp,
} from "./types";
import type {
  MarketDataCoverage,
  MarketOutcomeSummary,
  MarketSourceHealth,
  PriceChartingMappingAudit,
  PricingSignalDetail,
  QueryStrategyAudit,
  TcgplayerMappingAudit,
} from "./source-health-types";

const PRICING_SIGNAL_SOURCES: MarketSource[] = [
  "tcgplayer",
  "pricecharting",
  "scryfall_print_price",
];

const SOLD_COMP_SOURCES: MarketSource[] = ["ebay_sold"];

export function isPricingSignalSource(source: MarketSource): boolean {
  return PRICING_SIGNAL_SOURCES.includes(source);
}

export function emptySourceHealth(
  source: MarketSource,
  reasonIfSkipped: string,
): MarketSourceHealth {
  return {
    source,
    attempted: false,
    rawResultCount: 0,
    normalizedResultCount: 0,
    acceptedCount: 0,
    maybeCount: 0,
    rejectedCount: 0,
    priceSignalsFound: 0,
    warnings: [],
    reasonIfSkipped,
  };
}

export function mergeAssessmentCountsIntoHealth(
  healthRows: MarketSourceHealth[],
  assessments: CompMatchAssessment[],
): MarketSourceHealth[] {
  const bySource = new Map<MarketSource, MarketSourceHealth>();
  for (const h of healthRows) {
    bySource.set(h.source, { ...h });
  }

  for (const a of assessments) {
    const src = a.comp.source;
    let row = bySource.get(src);
    if (!row) {
      row = emptySourceHealth(src, "source not in fetch plan");
      row.attempted = true;
      bySource.set(src, row);
    }
    if (a.status === "accepted") row.acceptedCount += 1;
    else if (a.status === "maybe") row.maybeCount += 1;
    else row.rejectedCount += 1;

    if (isPricingSignalSource(src) && a.comp.price > 0) {
      row.priceSignalsFound += 1;
    }
  }

  return [...bySource.values()];
}

export function buildQueryStrategyAudits(
  assessments: CompMatchAssessment[],
  fetchMeta: Array<{
    source: MarketSource;
    query: string;
    purpose: string;
    rawResults: number;
    httpStatus?: number;
    fatalError?: string;
  }>,
): QueryStrategyAudit[] {
  const audits: QueryStrategyAudit[] = [];

  for (const meta of fetchMeta) {
    const related = assessments.filter(
      (a) =>
        a.comp.source === meta.source &&
        (a.comp.queryUsed === meta.query || meta.query === a.comp.queryUsed),
    );
    const reasonCounts = new Map<string, number>();
    for (const a of related) {
      for (const r of a.rejectionReasons) {
        reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
      }
    }
    const topRejectionReasons = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r]) => r as QueryStrategyAudit["topRejectionReasons"][number]);

    audits.push({
      source: meta.source,
      query: meta.query,
      purpose: meta.purpose,
      rawResults: meta.rawResults,
      accepted: related.filter((a) => a.status === "accepted").length,
      maybe: related.filter((a) => a.status === "maybe").length,
      rejected: related.filter((a) => a.status === "rejected").length,
      topRejectionReasons,
      httpStatus: meta.httpStatus,
      fatalError: meta.fatalError,
    });
  }

  return audits;
}

export function extractPricingSignalDetails(
  assessments: CompMatchAssessment[],
): PricingSignalDetail[] {
  return assessments
    .filter(
      (a) =>
        a.status === "accepted" &&
        isPricingSignalSource(a.comp.source) &&
        a.comp.price > 0,
    )
    .map((a) => ({
      source: a.comp.source,
      label: a.comp.conditionText ?? a.comp.title,
      price: a.comp.price,
    }));
}

export function buildPlainEnglishMarketSummary(input: {
  sourceHealth: MarketSourceHealth[];
  acceptedSoldComps: number;
  maybeListings: number;
  pricingSignalDetails: PricingSignalDetail[];
  pricingMethod?: string;
  valueMedian?: number;
  confidence?: string;
  tcgplayerMapping?: TcgplayerMappingAudit;
  priceChartingMapping?: PriceChartingMappingAudit;
}): string {
  const lines: string[] = ["Market source summary:"];

  const ebaySold = input.sourceHealth.find((h) => h.source === "ebay_sold");
  if (input.acceptedSoldComps > 0) {
    lines.push(`${input.acceptedSoldComps} accepted eBay sold comp(s).`);
  } else if (
    ebaySold?.fatalError === "authorization_or_scope_failure" ||
    ebaySold?.httpStatus === 403
  ) {
    lines.push("No accepted sold comps because eBay sold is unauthorized.");
  } else {
    lines.push("No accepted sold comps from eBay sold.");
  }

  for (const sig of input.pricingSignalDetails) {
    const src =
      sig.source === "pricecharting"
        ? "PriceCharting"
        : sig.source === "tcgplayer"
          ? "TCGplayer"
          : sig.source === "scryfall_print_price"
            ? "Scryfall"
            : sig.source;
    lines.push(`${src} found a pricing signal of $${sig.price.toFixed(2)} (${sig.label}).`);
  }

  const ebayActive = input.sourceHealth.find((h) => h.source === "ebay_active");
  if (ebayActive?.attempted && input.maybeListings > 0) {
    lines.push(
      `eBay active returned ${input.maybeListings} listing(s) for sanity check.`,
    );
  }

  if (input.tcgplayerMapping?.reasonIfSkipped && !input.tcgplayerMapping.marketPrice) {
    lines.push(`TCGplayer skipped: ${input.tcgplayerMapping.reasonIfSkipped}`);
  } else if (input.tcgplayerMapping?.selectedVariantName && input.tcgplayerMapping.marketPrice != null) {
    lines.push(
      `TCGplayer mapped ${input.tcgplayerMapping.selectedVariantName} market price $${input.tcgplayerMapping.marketPrice.toFixed(2)}.`,
    );
  }

  if (input.priceChartingMapping?.tierSelected && input.priceChartingMapping.loosePrice != null) {
    lines.push(
      `PriceCharting ${input.priceChartingMapping.tierSelected} pricing signal $${input.priceChartingMapping.loosePrice.toFixed(2)}.`,
    );
  }

  if (input.valueMedian != null && input.pricingMethod?.startsWith("price_signal")) {
    lines.push(
      `Shadow value: $${input.valueMedian.toFixed(2)} via ${input.pricingMethod.replace(/_/g, " ")}.`,
    );
    lines.push(`Confidence: ${input.confidence ?? "low"}.`);
  } else if (input.valueMedian != null && input.acceptedSoldComps > 0) {
    lines.push(`Shadow value: $${input.valueMedian.toFixed(2)} from sold comps.`);
    lines.push(`Confidence: ${input.confidence ?? "medium"}.`);
  }

  return lines.join("\n");
}

export function buildMarketOutcomeSummary(input: {
  sourceHealth: MarketSourceHealth[];
  assessments: CompMatchAssessment[];
  pricingSignalDetails?: PricingSignalDetail[];
  pricingMethod?: string;
  valueMedian?: number;
  confidence?: string;
  tcgplayerMapping?: TcgplayerMappingAudit;
  priceChartingMapping?: PriceChartingMappingAudit;
}): MarketOutcomeSummary {
  const acceptedSoldComps = input.assessments.filter(
    (a) => a.status === "accepted" && SOLD_COMP_SOURCES.includes(a.comp.source),
  ).length;
  const maybeListings = input.assessments.filter(
    (a) => a.status === "maybe" && a.comp.source === "ebay_active",
  ).length;
  const rejectedListings = input.assessments.filter(
    (a) => a.status === "rejected",
  ).length;
  const pricingSignalDetails =
    input.pricingSignalDetails ?? extractPricingSignalDetails(input.assessments);
  const pricingSignals = pricingSignalDetails.length;

  const summaryLabel = buildPreciseOutcomeLabel({
    sourceHealth: input.sourceHealth,
    acceptedSoldComps,
    maybeListings,
    pricingSignals,
  });

  const plainEnglishSummary = buildPlainEnglishMarketSummary({
    sourceHealth: input.sourceHealth,
    acceptedSoldComps,
    maybeListings,
    pricingSignalDetails,
    pricingMethod: input.pricingMethod,
    valueMedian: input.valueMedian,
    confidence: input.confidence,
    tcgplayerMapping: input.tcgplayerMapping,
    priceChartingMapping: input.priceChartingMapping,
  });

  return {
    acceptedSoldComps,
    maybeListings,
    rejectedListings,
    pricingSignals,
    summaryLabel,
    plainEnglishSummary,
    pricingSignalDetails,
  };
}

export function buildPreciseOutcomeLabel(input: {
  sourceHealth: MarketSourceHealth[];
  acceptedSoldComps: number;
  maybeListings: number;
  pricingSignals: number;
}): string {
  const parts: string[] = [];

  const ebaySold = input.sourceHealth.find((h) => h.source === "ebay_sold");
  if (ebaySold?.attempted) {
    if (ebaySold.fatalError === "authorization_or_scope_failure") {
      parts.push(
        `eBay sold: attempted, HTTP ${ebaySold.httpStatus ?? 403} authorization/scope failure`,
      );
    } else if (ebaySold.fatalError) {
      parts.push(`eBay sold: attempted, error — ${ebaySold.fatalError}`);
    } else if (ebaySold.rawResultCount === 0) {
      parts.push("eBay sold: attempted, 0 raw results for queries");
    } else {
      parts.push(
        `eBay sold: ${ebaySold.rawResultCount} raw, ${ebaySold.acceptedCount} accepted, ${ebaySold.rejectedCount} rejected`,
      );
    }
  } else if (ebaySold?.reasonIfSkipped) {
    parts.push(`eBay sold: skipped (${ebaySold.reasonIfSkipped})`);
  }

  const ebayActive = input.sourceHealth.find((h) => h.source === "ebay_active");
  if (ebayActive?.attempted) {
    parts.push(
      `eBay active: ${ebayActive.rawResultCount} raw, ${ebayActive.maybeCount} maybe, ${ebayActive.rejectedCount} rejected (active listings are not sold comps)`,
    );
  }

  const tcg = input.sourceHealth.find((h) => h.source === "tcgplayer");
  if (tcg?.attempted) {
    if (tcg.priceSignalsFound > 0) {
      parts.push(
        `TCGplayer: ${tcg.priceSignalsFound} pricing signal(s), not sold comps`,
      );
    } else if (tcg.reasonIfSkipped || tcg.fatalError) {
      parts.push(
        `TCGplayer: ${tcg.reasonIfSkipped ?? tcg.fatalError ?? "no pricing mapped"}`,
      );
    } else {
      parts.push("TCGplayer: attempted, no price signals mapped");
    }
  } else if (tcg?.reasonIfSkipped) {
    parts.push(`TCGplayer: skipped (${tcg.reasonIfSkipped})`);
  }

  const pc = input.sourceHealth.find((h) => h.source === "pricecharting");
  if (pc?.attempted) {
    if (pc.priceSignalsFound > 0) {
      parts.push(
        `PriceCharting: ${pc.priceSignalsFound} pricing signal(s), excluded from sold comp count`,
      );
    } else if (pc.warnings.length) {
      parts.push(`PriceCharting: ${pc.warnings[0]}`);
    } else {
      parts.push("PriceCharting: attempted, no tier selected");
    }
  } else if (pc?.reasonIfSkipped) {
    parts.push(`PriceCharting: skipped (${pc.reasonIfSkipped})`);
  }

  if (input.acceptedSoldComps > 0) {
    parts.unshift(`${input.acceptedSoldComps} accepted sold comp(s)`);
  } else if (!parts.length) {
    return "No market sources attempted — identity or flags may have skipped market run";
  } else if (
    input.acceptedSoldComps === 0 &&
    input.pricingSignals === 0 &&
    input.maybeListings === 0
  ) {
    parts.unshift("No accepted sold comps");
  }

  return parts.join("; ");
}

export function summarizeSourceHealthBatch(
  snapshots: Array<{ sourceHealth?: MarketSourceHealth[] }>,
): Record<string, number> {
  const stats: Record<string, number> = {
    ebaySoldAttempted: 0,
    ebaySold403: 0,
    ebaySoldRawResults: 0,
    ebaySoldAccepted: 0,
    ebayActiveAttempted: 0,
    ebayActiveRawResults: 0,
    ebayActiveMaybe: 0,
    tcgplayerAttempted: 0,
    tcgplayerMapped: 0,
    tcgplayerPricingSignals: 0,
    tcgplayerSkipped: 0,
    priceChartingAttempted: 0,
    priceChartingProducts: 0,
    priceChartingSignals: 0,
    priceChartingExcludedWarnings: 0,
  };

  for (const snap of snapshots) {
    for (const h of snap.sourceHealth ?? []) {
      switch (h.source) {
        case "ebay_sold":
          if (h.attempted) stats.ebaySoldAttempted += 1;
          if (h.httpStatus === 403 || h.fatalError === "authorization_or_scope_failure") {
            stats.ebaySold403 += 1;
          }
          stats.ebaySoldRawResults += h.rawResultCount;
          stats.ebaySoldAccepted += h.acceptedCount;
          break;
        case "ebay_active":
          if (h.attempted) stats.ebayActiveAttempted += 1;
          stats.ebayActiveRawResults += h.rawResultCount;
          stats.ebayActiveMaybe += h.maybeCount;
          break;
        case "tcgplayer":
          if (h.attempted) stats.tcgplayerAttempted += 1;
          else stats.tcgplayerSkipped += 1;
          if (h.productId) stats.tcgplayerMapped += 1;
          stats.tcgplayerPricingSignals += h.priceSignalsFound;
          break;
        case "pricecharting":
          if (h.attempted) stats.priceChartingAttempted += 1;
          if (h.catalogId) stats.priceChartingProducts += 1;
          stats.priceChartingSignals += h.priceSignalsFound;
          stats.priceChartingExcludedWarnings += h.warnings.length;
          break;
        default:
          break;
      }
    }
  }

  return stats;
}

export function summarizeMarketDataCoverage(
  snapshots: Array<{
    sourceHealth?: MarketSourceHealth[];
    marketOutcome?: MarketOutcomeSummary;
    pricingMethod?: string;
    valueMedian?: number;
  }>,
): MarketDataCoverage {
  const coverage: MarketDataCoverage = {
    acceptedSoldCompsCount: 0,
    pricingSignalsCount: 0,
    activeOnlyCount: 0,
    noMarketDataCount: 0,
    ebaySoldAuthFailureCount: 0,
    tcgplayerMappedCount: 0,
    tcgplayerSkippedCount: 0,
    priceChartingSignalCount: 0,
  };

  for (const snap of snapshots) {
    const outcome = snap.marketOutcome;
    if ((outcome?.acceptedSoldComps ?? 0) > 0) {
      coverage.acceptedSoldCompsCount += 1;
    }
    if ((outcome?.pricingSignals ?? 0) > 0) {
      coverage.pricingSignalsCount += 1;
    }
    if (
      snap.pricingMethod === "active_listings_only_sanity_check" ||
      ((outcome?.acceptedSoldComps ?? 0) === 0 &&
        (outcome?.pricingSignals ?? 0) === 0 &&
        (outcome?.maybeListings ?? 0) > 0)
    ) {
      coverage.activeOnlyCount += 1;
    }
    if (
      snap.pricingMethod === "no_market_data" ||
      (!snap.valueMedian &&
        (outcome?.acceptedSoldComps ?? 0) === 0 &&
        (outcome?.pricingSignals ?? 0) === 0)
    ) {
      coverage.noMarketDataCount += 1;
    }

    for (const h of snap.sourceHealth ?? []) {
      if (
        h.source === "ebay_sold" &&
        (h.httpStatus === 403 ||
          h.fatalError === "authorization_or_scope_failure")
      ) {
        coverage.ebaySoldAuthFailureCount += 1;
      }
      if (h.source === "tcgplayer") {
        if (h.productId) coverage.tcgplayerMappedCount += 1;
        if (h.reasonIfSkipped || h.fatalError) coverage.tcgplayerSkippedCount += 1;
      }
      if (h.source === "pricecharting" && h.priceSignalsFound > 0) {
        coverage.priceChartingSignalCount += 1;
      }
    }
  }

  return coverage;
}

export function printMarketDataCoverage(coverage: MarketDataCoverage): void {
  console.log("\n=== Market Data Coverage ===");
  console.log(`Cards with accepted sold comps: ${coverage.acceptedSoldCompsCount}`);
  console.log(`Cards with pricing signals: ${coverage.pricingSignalsCount}`);
  console.log(`Cards with active listings only: ${coverage.activeOnlyCount}`);
  console.log(`Cards with no market data: ${coverage.noMarketDataCount}`);
  console.log(`Cards blocked by eBay sold auth: ${coverage.ebaySoldAuthFailureCount}`);
  console.log(`TCGplayer mapped: ${coverage.tcgplayerMappedCount}`);
  console.log(`TCGplayer skipped/failed: ${coverage.tcgplayerSkippedCount}`);
  console.log(`PriceCharting signals: ${coverage.priceChartingSignalCount}`);
}
export function stubMarketSnapshotDiagnostics(
  acceptedSoldComps = 0,
): {
  sourceHealth: MarketSourceHealth[];
  queryAudits: QueryStrategyAudit[];
  marketOutcome: MarketOutcomeSummary;
} {
  return {
    sourceHealth: [],
    queryAudits: [],
    marketOutcome: {
      acceptedSoldComps,
      maybeListings: 0,
      rejectedListings: 0,
      pricingSignals: 0,
      summaryLabel:
        acceptedSoldComps > 0
          ? `${acceptedSoldComps} accepted sold comp(s)`
          : "Test snapshot — no live source health recorded",
    },
  };
}

export function printSourceHealthBatchSummary(
  stats: Record<string, number>,
): void {
  console.log("\n=== Market Source Health (batch) ===");
  console.log(`eBay sold attempted: ${stats.ebaySoldAttempted ?? 0}`);
  console.log(`eBay sold 403: ${stats.ebaySold403 ?? 0}`);
  console.log(`eBay sold raw results: ${stats.ebaySoldRawResults ?? 0}`);
  console.log(`eBay sold accepted comps: ${stats.ebaySoldAccepted ?? 0}`);
  console.log(`eBay active attempted: ${stats.ebayActiveAttempted ?? 0}`);
  console.log(`eBay active raw results: ${stats.ebayActiveRawResults ?? 0}`);
  console.log(`eBay active maybe listings: ${stats.ebayActiveMaybe ?? 0}`);
  console.log(`TCGplayer attempted: ${stats.tcgplayerAttempted ?? 0}`);
  console.log(`TCGplayer mapped product IDs: ${stats.tcgplayerMapped ?? 0}`);
  console.log(
    `TCGplayer pricing signals found: ${stats.tcgplayerPricingSignals ?? 0}`,
  );
  console.log(`TCGplayer skipped / failed: ${stats.tcgplayerSkipped ?? 0}`);
  console.log(`PriceCharting attempted: ${stats.priceChartingAttempted ?? 0}`);
  console.log(
    `PriceCharting product matches: ${stats.priceChartingProducts ?? 0}`,
  );
  console.log(
    `PriceCharting pricing signals: ${stats.priceChartingSignals ?? 0}`,
  );
  console.log(
    `PriceCharting excluded tier warnings: ${stats.priceChartingExcludedWarnings ?? 0}`,
  );
}
