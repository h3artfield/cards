import type { PricingResult, SoldComp, ScannedCard, VisionResult } from "../../types";
import { aggregateComps, type CompCandidate, type CompConfidence } from "./comp-stats";
import { fetchEbayComps } from "./ebay-comps";
import {
  fetchPriceChartingComps,
  type PriceChartingLookup,
} from "./pricecharting-pricing";
import { priceChartingProductMatchesVision } from "./pricecharting-match";
import { lookupCatalogPrice } from "../catalog-pricing";
import { isVisionGradedSlab, mergeVisionSlabFields } from "../slab-pricing";
import { normalizeVisionCardNumber } from "../pokemon-utils";
import { primaryCompSearchQuery } from "./build-search-query";
import {
  bestCatalogCompCandidates,
  mergeCompSources,
  slabPricingLooksRaw,
} from "./merge-comp-sources";
import { estimateMarketPriceFromVision } from "./vision-market-estimate";

function catalogCompCandidates(
  catalog: PricingResult,
  vision: VisionResult,
): CompCandidate[] {
  if (!catalog.raw) {
    if (catalog.marketPrice > 0) {
      return [
        {
          price: catalog.marketPrice,
          source: catalog.source,
          condition: vision.conditionEstimate,
          title: vision.cardName,
        },
      ];
    }
    return [];
  }

  const raw = catalog.raw as Record<string, unknown>;
  const candidates = bestCatalogCompCandidates(raw, vision);
  if (candidates.length) return candidates;

  if (catalog.marketPrice > 0) {
    return [
      {
        price: catalog.marketPrice,
        source: catalog.source,
        condition: vision.conditionEstimate,
        title: vision.cardName,
      },
    ];
  }
  return [];
}

function priceChartingCandidates(
  lookup: PriceChartingLookup | null,
  vision: VisionResult,
): CompCandidate[] {
  if (!lookup) return [];
  if (!priceChartingProductMatchesVision(lookup.product, vision)) return [];
  return lookup.candidates;
}

function uniqueSources(candidates: CompCandidate[]): string[] {
  return [...new Set(candidates.map((c) => c.source))];
}

function pickPrimarySource(sources: string[]): string {
  if (sources.length === 0) return "unknown";
  if (sources.length === 1) return sources[0]!;
  return "multi_source";
}

function pickSourceUrl(
  catalog: PricingResult,
  pc: PriceChartingLookup | null,
  ebaySearchUrl?: string,
): string | undefined {
  return pc?.sourceUrl ?? ebaySearchUrl ?? catalog.sourceUrl;
}

function isMostlyListedOnly(candidates: CompCandidate[]): boolean {
  if (!candidates.length) return true;
  const soldLike = candidates.filter((c) =>
    ["ebay_sold", "pricecharting", "tcgplayer_market", "cardmarket"].includes(
      c.source,
    ),
  );
  return soldLike.length === 0;
}

function inferEstimated(
  aggregation: { confidence: CompConfidence; compCount: number },
  candidates: CompCandidate[],
  sources: string[],
): boolean {
  if (aggregation.compCount === 0) return true;
  if (aggregation.confidence === "high") return false;
  if (sources.length >= 2 && aggregation.compCount >= 2) return false;
  if (isMostlyListedOnly(candidates)) return true;
  return aggregation.confidence === "low";
}

function buildPricingResult(
  base: Partial<PricingResult> & { marketPrice: number; source: string },
  aggregation: ReturnType<typeof aggregateComps>,
  extra?: Partial<PricingResult>,
): PricingResult {
  return {
    marketPrice: aggregation.marketPrice || base.marketPrice,
    source: base.source,
    sourceUrl: base.sourceUrl,
    raw: base.raw,
    estimated: base.estimated,
    matchQuery: base.matchQuery,
    comps: aggregation.comps,
    compsExcluded: aggregation.compsExcluded,
    compMethod: aggregation.compMethod,
    compCount: aggregation.compCount,
    compConfidence: aggregation.confidence,
    ...extra,
  };
}

export type ResolveMarketPriceOptions = {
  card?: Pick<ScannedCard, "frontImageUrl" | "backImageUrl" | "conditionReport">;
};

/** Multi-source market price: catalog + PriceCharting + eBay with smart merging. */
export async function resolveMarketPrice(
  vision: VisionResult,
  options?: ResolveMarketPriceOptions,
): Promise<PricingResult> {
  let v = mergeVisionSlabFields(vision);
  let catalog = await lookupCatalogPrice(v);

  if (v.category === "pokemon" && catalog.raw) {
    const fixed = normalizeVisionCardNumber(
      v,
      catalog.raw as Record<string, unknown>,
    );
    if (fixed.cardNumber !== v.cardNumber) {
      v = fixed;
      catalog = await lookupCatalogPrice(v);
    }
  }

  const slab = isVisionGradedSlab(v);

  const [pcLookup, ebayResult] = await Promise.all([
    fetchPriceChartingComps(v),
    fetchEbayComps(v),
  ]);

  const catalogCandidates = slab ? [] : catalogCompCandidates(catalog, v);
  const pcCandidates = priceChartingCandidates(pcLookup, v);
  const ebayCandidates = ebayResult?.candidates ?? [];

  let finalAgg = mergeCompSources(
    catalogCandidates,
    pcCandidates,
    ebayCandidates,
    {
      slab,
      ebaySold: ebayResult?.sold ?? false,
      vision: v,
    },
  );

  const allCandidates = [
    ...catalogCandidates,
    ...pcCandidates,
    ...ebayCandidates,
  ];

  if (
    slab &&
    options?.card?.frontImageUrl &&
    (finalAgg.marketPrice <= 0 || slabPricingLooksRaw(v, finalAgg.marketPrice))
  ) {
    const visionEst = await estimateMarketPriceFromVision(
      options.card as ScannedCard,
      v,
      options.card.conditionReport,
    );
    if (visionEst && visionEst.marketPrice > finalAgg.marketPrice) {
      finalAgg = {
        marketPrice: visionEst.marketPrice,
        comps: [
          {
            price: visionEst.marketPrice,
            source: "vision_estimate",
            condition: `${v.slabCompany} ${v.slabGrade}`,
            title: visionEst.rationale?.slice(0, 120),
          },
          ...finalAgg.comps,
        ],
        compsExcluded: finalAgg.compsExcluded,
        compMethod: "catalog_tier",
        compCount: finalAgg.compCount + 1,
        confidence: visionEst.confidence >= 0.7 ? "medium" : "low",
      };
    }
  }

  if (finalAgg.marketPrice <= 0 && !allCandidates.length) {
    const marketPrice = slab ? 0 : (catalog.marketPrice ?? 0);
    return {
      ...catalog,
      marketPrice,
      estimated: true,
      comps: [],
      compCount: 0,
      compConfidence: "low",
      matchQuery: slab ? primaryCompSearchQuery(v) : catalog.matchQuery,
    };
  }

  const displayCandidates: CompCandidate[] =
    finalAgg.comps.length > 0
      ? finalAgg.comps.map((c) => ({
          price: c.price,
          source: c.source,
          condition: c.condition,
          title: c.title,
          date: c.date,
        }))
      : allCandidates;

  const sources = uniqueSources(displayCandidates);
  const primarySource = pickPrimarySource(sources);

  const raw: Record<string, unknown> = {
    ...(catalog.raw ?? {}),
    pricingSources: sources,
  };
  if (pcLookup?.product) {
    raw.priceChartingProduct = pcLookup.product;
  }
  if (ebayResult) {
    raw.ebaySold = ebayResult.sold;
    raw.ebaySearchUrl = ebayResult.searchUrl;
  }

  const estimated = inferEstimated(finalAgg, displayCandidates, sources);

  return buildPricingResult(
    {
      marketPrice: finalAgg.marketPrice || (slab ? 0 : catalog.marketPrice),
      source: primarySource,
      sourceUrl: pickSourceUrl(catalog, pcLookup, ebayResult?.searchUrl),
      raw,
      estimated,
      matchQuery: slab ? primaryCompSearchQuery(v) : catalog.matchQuery,
    },
    finalAgg,
    { sources },
  );
}

export function pricingResultToSalesComps(pricing: PricingResult): {
  recentSales: SoldComp[];
  avgRecentSale?: number;
  dataSource: string;
  trendNote?: string;
  compConfidence?: CompConfidence;
} {
  const comps = pricing.comps ?? [];
  const sourceLabel =
    pricing.sources && pricing.sources.length > 1
      ? `multi-source (${pricing.sources.join(", ")})`
      : pricing.source;

  return {
    recentSales: comps,
    avgRecentSale: pricing.marketPrice,
    dataSource: sourceLabel,
    compConfidence: pricing.compConfidence,
    trendNote:
      pricing.compsExcluded?.length
        ? `${pricing.compCount} comps from ${sourceLabel} (${pricing.compsExcluded.length} outliers excluded) · ${pricing.compMethod}`
        : `${pricing.compCount ?? comps.length} comps from ${sourceLabel} · ${pricing.compMethod ?? "aggregate"}`,
  };
}
