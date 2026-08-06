import type { VisionResult } from "../../types";
import { tcgPlayerAnyPrice, tcgPlayerMarketForRarity } from "../pokemon-utils";
import {
  aggregateComps,
  type CompAggregation,
  type CompCandidate,
} from "./comp-stats";
import { isVisionGradedSlab, slabSearchTag } from "../slab-pricing";

type PriceTier = { market?: number; mid?: number; low?: number; high?: number };

const CATALOG_SOURCES = new Set([
  "tcgplayer_market",
  "cardmarket",
  "pricecharting",
]);

/** One TCGPlayer tier for this printing — not every holo/normal/reverse tier at once. */
export function bestCatalogCompCandidates(
  raw: Record<string, unknown>,
  vision: VisionResult,
): CompCandidate[] {
  const tcgplayer = raw.tcgplayer as
    | { prices?: Record<string, PriceTier> }
    | undefined;
  const prices = tcgplayer?.prices;
  const title = String(raw.name ?? vision.cardName ?? "");
  const rarity = String(raw.rarity ?? "");

  if (prices) {
    const price =
      tcgPlayerMarketForRarity(
        prices,
        rarity,
        vision.variant,
        vision.conditionEstimate,
      ) || tcgPlayerAnyPrice(prices);
    if (price > 0) {
      return [
        {
          price,
          source: "tcgplayer_market",
          condition: rarity || vision.variant || "market",
          title,
        },
      ];
    }
  }

  const cardmarket = raw.cardmarket as
    | { prices?: { averageSellPrice?: number; trendPrice?: number } }
    | undefined;
  const avg = cardmarket?.prices?.averageSellPrice;
  if (avg && avg > 0) {
    return [{ price: avg, source: "cardmarket", condition: "avg_sell", title }];
  }
  const trend = cardmarket?.prices?.trendPrice;
  if (trend && trend > 0) {
    return [{ price: trend, source: "cardmarket", condition: "trend", title }];
  }

  return [];
}

/** Keep eBay comps that mention the slab grader + grade in the listing title. */
export function filterSlabEbayComps(
  candidates: CompCandidate[],
  vision: VisionResult,
): CompCandidate[] {
  const company = vision.slabCompany?.trim().toLowerCase();
  const grade = vision.slabGrade?.trim();
  if (!company || !grade) return candidates;

  const filtered = candidates.filter((c) => {
    const title = (c.title ?? "").toLowerCase();
    if (!title.includes(company)) return false;
    const gradeRe = new RegExp(`\\b${grade.replace(".", "\\.")}\\b`);
    return gradeRe.test(title);
  });

  return filtered.length ? filtered : [];
}

function emptyAggregation(): CompAggregation {
  return {
    marketPrice: 0,
    comps: [],
    compsExcluded: [],
    compMethod: "median",
    compCount: 0,
    confidence: "low",
  };
}

/**
 * Merge catalog API tiers, PriceCharting, and eBay without averaging $48 TCGPlayer with $1 listings.
 */
export function mergeCompSources(
  catalogCandidates: CompCandidate[],
  pcCandidates: CompCandidate[],
  ebayCandidates: CompCandidate[],
  options: {
    slab: boolean;
    ebaySold: boolean;
    vision: VisionResult;
  },
): CompAggregation {
  const { slab, ebaySold, vision } = options;

  let ebayPool = ebayCandidates;
  if (slab) {
    ebayPool = filterSlabEbayComps(ebayCandidates, vision);
  }

  const catalogPool = [...catalogCandidates, ...pcCandidates].filter(
    (c) => c.price > 0,
  );
  const ebaySoldComps = ebayPool.filter((c) => c.source === "ebay_sold");
  const ebayListedComps = ebayPool.filter((c) => c.source === "ebay_listed");

  const catalogAgg =
    catalogPool.length > 0
      ? aggregateComps(catalogPool, { methodHint: "catalog_tier" })
      : null;

  const ebayForAgg =
    ebaySoldComps.length > 0 ? ebaySoldComps : ebayListedComps;
  const ebayAgg =
    ebayForAgg.length > 0 ? aggregateComps(ebayForAgg) : null;

  if (slab) {
    const slabPool = [...pcCandidates, ...ebayPool].filter((c) => c.price > 0);
    if (slabPool.length > 0) {
      return aggregateComps(slabPool, { methodHint: "catalog_tier" });
    }
    if (pcCandidates.length > 0) {
      return aggregateComps(pcCandidates, { methodHint: "catalog_tier" });
    }
    return emptyAggregation();
  }

  if (catalogAgg && catalogAgg.marketPrice > 0) {
    if (!ebayAgg || ebayAgg.marketPrice <= 0) {
      return catalogAgg;
    }

    const catalogPrice = catalogAgg.marketPrice;
    const ebayPrice = ebayAgg.marketPrice;
    const mostlyListings =
      ebayListedComps.length > 0 && ebaySoldComps.length === 0;
    const listingsNoise =
      mostlyListings && catalogPrice > ebayPrice * 1.75;

    if (listingsNoise) {
      return {
        ...catalogAgg,
        comps: [...catalogAgg.comps, ...ebayAgg.comps.slice(0, 3)],
        compCount: catalogAgg.compCount + Math.min(3, ebayAgg.compCount),
      };
    }

    if (ebaySoldComps.length > 0) {
      const spread = Math.abs(catalogPrice - ebayPrice) / catalogPrice;
      if (spread <= 0.45) {
        return aggregateComps(
          [
            { price: catalogPrice, source: "catalog_anchor", title: "catalog" },
            ...ebaySoldComps.slice(0, 8),
          ],
          { methodHint: "catalog_tier" },
        );
      }
    }

    if (mostlyListings || catalogPrice > ebayPrice * 1.5) {
      return catalogAgg;
    }

    return catalogPrice >= ebayPrice ? catalogAgg : ebayAgg;
  }

  if (ebayAgg) return ebayAgg;
  return emptyAggregation();
}

export function compSourcesUsed(candidates: CompCandidate[]): string[] {
  return [...new Set(candidates.map((c) => c.source))];
}

export function isCatalogSource(source: string): boolean {
  return CATALOG_SOURCES.has(source);
}

export function slabPricingLooksRaw(
  vision: VisionResult,
  marketPrice: number,
): boolean {
  if (!isVisionGradedSlab(vision)) return false;
  const grade = vision.slabGrade?.trim();
  if (grade === "10" && marketPrice > 0 && marketPrice < 8) return true;
  if (grade === "9" && marketPrice > 0 && marketPrice < 4) return true;
  return false;
}

export { slabSearchTag };
