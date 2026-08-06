import type { CardIdentityVerification, PricingResult, ScannedCard, VisionResult } from "../types";
import type { PriceChartingProduct } from "./pricing/pricecharting-pricing";
import { priceChartingProductMatchesVision } from "./pricing/pricecharting-match";
import { aggregateComps } from "./pricing/comp-stats";

const ESTIMATE_SOURCES = new Set([
  "estimate",
  "pokemon_tcg_estimate",
  "scryfall_estimate",
  "ygoprodeck_estimate",
  "sports_estimate",
  "vision_estimate",
]);

export function isVerifiedMarketPrice(pricing: PricingResult | undefined): boolean {
  if (!pricing) return false;
  if (pricing.source === "vision_estimate") return false;
  if (pricing.marketPrice > 0 && (pricing.comps?.length || pricing.raw)) {
    if (pricing.source === "ebay_listed") {
      return (pricing.compCount ?? pricing.comps?.length ?? 0) >= 2;
    }
    if (pricing.source === "multi_source") {
      return (pricing.compCount ?? 0) >= 2 && pricing.compConfidence !== "low";
    }
    return true;
  }
  if (pricing.estimated === false) return pricing.marketPrice > 0;
  if (pricing.estimated === true) return pricing.marketPrice > 0 && pricing.compConfidence === "high";
  if (ESTIMATE_SOURCES.has(pricing.source)) return pricing.marketPrice > 0;
  return Boolean(pricing.raw && pricing.marketPrice > 0);
}

/** Whether offers should be treated as unverified for warnings / manual review. */
export function pricingNeedsVerification(
  card: ScannedCard,
  pricing?: PricingResult,
): boolean {
  const p =
    pricing ?? (card.pricingJson as PricingResult | undefined);
  if (p?.source === "vision_estimate") return true;
  if ((card.marketPrice ?? p?.marketPrice ?? 0) > 0 && p?.raw && isVerifiedMarketPrice(p)) {
    return false;
  }
  if (isVerifiedMarketPrice(p)) return false;
  return (p?.marketPrice ?? 0) <= 0;
}

export function identityBlocksPricing(
  verification?: CardIdentityVerification,
): boolean {
  if (!verification) return false;
  if (verification.verdict === "mismatch" && !verification.correctedMatch) {
    return true;
  }
  return false;
}

/** Drop catalog/PriceCharting pricing when identity does not match the attached product. */
export function clearPricingOnMismatch(card: ScannedCard): ScannedCard {
  const pricing: PricingResult = {
    marketPrice: 0,
    source: "identity_mismatch",
    estimated: true,
  };
  return {
    ...card,
    pricingJson: pricing as unknown as Record<string, unknown>,
    marketPrice: 0,
    cashOffer: 0,
    tradeOffer: 0,
  };
}

export function sanitizePriceChartingPricing(card: ScannedCard): ScannedCard {
  const pricing = card.pricingJson as PricingResult | undefined;
  if (!pricing?.raw) return card;

  const vision = card.visionJson as VisionResult | undefined;
  if (!vision) return card;

  const raw = pricing.raw as Record<string, unknown> & {
    priceChartingProduct?: import("./pricing/pricecharting-pricing").PriceChartingProduct;
  };

  if (pricing.source === "pricecharting") {
    if (!priceChartingProductMatchesVision(raw as PriceChartingProduct, vision)) {
      return clearPricingOnMismatch(card);
    }
    return card;
  }

  if (pricing.source === "multi_source" && raw.priceChartingProduct) {
    if (priceChartingProductMatchesVision(raw.priceChartingProduct as PriceChartingProduct, vision)) {
      return card;
    }
    const filteredComps = (pricing.comps ?? []).filter(
      (c) => c.source !== "pricecharting",
    );
    if (filteredComps.length === (pricing.comps ?? []).length) return card;
    if (!filteredComps.length) return clearPricingOnMismatch(card);

    const aggregation = aggregateComps(
      filteredComps.map((c) => ({
        price: c.price,
        source: c.source,
        condition: c.condition,
        title: c.title,
        date: c.date,
      })),
    );
    const sources = [...new Set(filteredComps.map((c) => c.source))];
    const { priceChartingProduct: _, ...rawRest } = raw;
    return {
      ...card,
      marketPrice: aggregation.marketPrice,
      pricingJson: {
        ...pricing,
        marketPrice: aggregation.marketPrice,
        source: sources.length > 1 ? "multi_source" : sources[0] ?? pricing.source,
        sources,
        comps: aggregation.comps,
        compsExcluded: aggregation.compsExcluded,
        compMethod: aggregation.compMethod,
        compCount: aggregation.compCount,
        compConfidence: aggregation.confidence,
        raw: rawRest,
      } as unknown as Record<string, unknown>,
    };
  }

  return card;
}
