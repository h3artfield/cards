import type { CardSalesComps, ScannedCard, VisionResult } from "../types";
import { pricingResultToSalesComps } from "./pricing/resolve-market-price";
import { fetchPriceChartingComps } from "./pricing/pricecharting-pricing";
import { centsToUsd, pickPriceChartingTiers } from "./pricing/pricecharting-utils";
import type { PriceChartingProduct } from "./pricing/pricecharting-pricing";
import { normalizeSportsVisionFields } from "./pricing/sports-search-queries";

/** Build sales comps from resolved pricing or legacy PriceCharting fetch. */
export async function fetchSalesComps(card: ScannedCard): Promise<CardSalesComps> {
  const pricing = card.pricingJson as
    | {
        comps?: CardSalesComps["recentSales"];
        compsExcluded?: CardSalesComps["recentSales"];
        compCount?: number;
        compMethod?: string;
        marketPrice?: number;
        source?: string;
        compConfidence?: CardSalesComps["compConfidence"];
      }
    | undefined;

  if (pricing?.comps?.length) {
    const derived = pricingResultToSalesComps({
      marketPrice: card.marketPrice ?? pricing.marketPrice ?? 0,
      source: pricing.source ?? "resolved",
      comps: pricing.comps,
      compsExcluded: pricing.compsExcluded,
      compCount: pricing.compCount,
      compMethod: pricing.compMethod as CardSalesComps["compMethod"],
      compConfidence: pricing.compConfidence,
    });

    return {
      recentSales: derived.recentSales,
      trend: "unknown",
      trendNote: derived.trendNote,
      avgRecentSale: derived.avgRecentSale,
      dataSource: derived.dataSource,
      compConfidence: derived.compConfidence,
      fetchedAt: new Date().toISOString(),
    };
  }

  return fetchLegacyPriceChartingComps(card);
}

async function fetchLegacyPriceChartingComps(
  card: ScannedCard,
): Promise<CardSalesComps> {
  const vision = cardToVision(card);
  const lookup = await fetchPriceChartingComps(vision);
  if (lookup) {
    return buildFromPriceCharting(lookup.product, vision);
  }
  return buildFromTcgTiers(card);
}

function cardToVision(card: ScannedCard): VisionResult {
  const vision = card.visionJson as VisionResult | undefined;
  const merged: VisionResult = {
    category: vision?.category ?? card.category ?? "pokemon",
    itemType:
      vision?.itemType ??
      (card.slabCompany ? "graded" : card.itemType === "graded" ? "graded" : "raw"),
    cardName: card.detectedName ?? vision?.cardName ?? "",
    setName: card.setName ?? vision?.setName,
    cardNumber: card.cardNumber ?? vision?.cardNumber,
    variant: card.variant ?? vision?.variant,
    brand: vision?.brand,
    team: card.team ?? vision?.team,
    year: card.year ?? vision?.year,
    slabCompany: card.slabCompany ?? vision?.slabCompany,
    slabGrade: card.slabGrade ?? vision?.slabGrade,
    playerName: card.playerName ?? vision?.playerName,
    conditionEstimate: card.conditionEstimate ?? vision?.conditionEstimate ?? "LP",
    confidence: card.conditionConfidence ?? vision?.confidence ?? 0.5,
    agentSearchQueries: vision?.agentSearchQueries,
  };
  if (merged.category === "sports") {
    return normalizeSportsVisionFields(merged);
  }
  return merged;
}

function buildFromPriceCharting(
  product: PriceChartingProduct,
  vision: VisionResult,
): CardSalesComps {
  const prices: CardSalesComps["recentSales"] = [];
  for (const tier of pickPriceChartingTiers(product, vision)) {
    const price = centsToUsd(tier.cents);
    if (price == null) continue;
    prices.push({
      price,
      source: "pricecharting",
      condition: tier.label,
      title: product["product-name"],
    });
  }

  prices.sort((a, b) => b.price - a.price);
  const recent = prices.slice(0, 3);
  const avg =
    recent.length > 0
      ? recent.reduce((s, p) => s + p.price, 0) / recent.length
      : undefined;

  return {
    recentSales: recent,
    trend: "unknown",
    trendNote: "PriceCharting eBay-derived aggregate tiers.",
    avgRecentSale: avg,
    dataSource: "pricecharting",
    compConfidence: "medium",
    fetchedAt: new Date().toISOString(),
  };
}

function buildFromTcgTiers(card: ScannedCard): CardSalesComps {
  const pricing = card.pricingJson as
    | {
        raw?: {
          tcgplayer?: {
            prices?: Record<string, { market?: number; mid?: number; low?: number }>;
          };
        };
      }
    | undefined;

  const tiers = pricing?.raw?.tcgplayer?.prices ?? {};
  const recent: CardSalesComps["recentSales"] = [];

  for (const [variant, tier] of Object.entries(tiers)) {
    const market = tier.market ?? tier.mid;
    if (market != null && market > 0) {
      recent.push({
        price: market,
        source: "tcgplayer_market",
        condition: variant,
        title: `${card.detectedName} (${variant})`,
      });
    }
  }

  recent.sort((a, b) => b.price - a.price);
  const top3 = recent.slice(0, 3);

  return {
    recentSales: top3,
    trend: "unknown",
    trendNote:
      top3.length > 0
        ? "TCGPlayer market tiers from catalog."
        : "No comps yet — reprocess after pricing update.",
    avgRecentSale:
      top3.length > 0
        ? top3.reduce((s, p) => s + p.price, 0) / top3.length
        : undefined,
    dataSource: "tcgplayer_market",
    compConfidence: top3.length >= 3 ? "medium" : "low",
    fetchedAt: new Date().toISOString(),
  };
}
