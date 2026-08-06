import type { PricingResult, VisionPriceEstimate, VisionResult } from "../../types";

const PLACEHOLDER_SOURCES = new Set([
  "estimate",
  "pokemon_tcg_estimate",
  "scryfall_estimate",
  "ygoprodeck_estimate",
  "sports_estimate",
  "identity_mismatch",
]);

/** API/catalog comps outrank vision — vision fills gaps and cross-checks. */
export function isAuthoritativeApiPrice(pricing: PricingResult | undefined): boolean {
  if (!pricing || pricing.marketPrice == null || pricing.marketPrice <= 0) {
    return false;
  }
  if (pricing.source === "vision_estimate") return false;
  if (PLACEHOLDER_SOURCES.has(pricing.source)) return false;
  if (pricing.estimated === true && pricing.compConfidence === "low") return false;
  return true;
}

function parseEstimate(raw: Partial<VisionPriceEstimate> | undefined): VisionPriceEstimate | undefined {
  if (!raw) return undefined;
  const marketPrice = Number(raw.marketPrice);
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) return undefined;
  return {
    marketPrice: Math.round(marketPrice * 100) / 100,
    rangeLow:
      raw.rangeLow != null && raw.rangeLow > 0
        ? Math.round(Number(raw.rangeLow) * 100) / 100
        : undefined,
    rangeHigh:
      raw.rangeHigh != null && raw.rangeHigh > 0
        ? Math.round(Number(raw.rangeHigh) * 100) / 100
        : undefined,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.5)),
    rationale: raw.rationale?.trim(),
    conditionNote: raw.conditionNote?.trim(),
  };
}

export function visionEstimateFromEnrich(parsed: {
  marketPriceMid?: number | null;
  rawPriceLow?: number | null;
  rawPriceHigh?: number | null;
  priceConfidence?: number | null;
  priceRationale?: string | null;
  conditionNote?: string | null;
}): VisionPriceEstimate | undefined {
  return parseEstimate({
    marketPrice: parsed.marketPriceMid ?? undefined,
    rangeLow: parsed.rawPriceLow ?? undefined,
    rangeHigh: parsed.rawPriceHigh ?? undefined,
    confidence: parsed.priceConfidence ?? undefined,
    rationale: parsed.priceRationale ?? undefined,
    conditionNote: parsed.conditionNote ?? undefined,
  });
}

export function mergeVisionWithApiPricing(
  api: PricingResult | undefined,
  estimate: VisionPriceEstimate | undefined,
): PricingResult {
  const base: PricingResult = api ?? {
    marketPrice: 0,
    source: "estimate",
    estimated: true,
  };

  if (!estimate) return base;

  const raw: Record<string, unknown> = {
    ...(base.raw ?? {}),
    visionEstimate: estimate,
  };

  if (isAuthoritativeApiPrice(base)) {
    const divergence =
      Math.abs(base.marketPrice - estimate.marketPrice) / base.marketPrice;
    if (divergence > 0.45) {
      raw.visionCrossCheckWarning =
        `API market $${base.marketPrice.toFixed(2)} vs AI estimate $${estimate.marketPrice.toFixed(2)} — verify in hand`;
    }
    return { ...base, raw };
  }

  if (base.marketPrice <= 0) {
    return {
      ...base,
      marketPrice: estimate.marketPrice,
      source: "vision_estimate",
      estimated: true,
      compConfidence: "low",
      compCount: 1,
      compMethod: "median",
      comps: [
        {
          price: estimate.marketPrice,
          source: "vision_estimate",
          condition: estimate.conditionNote ?? "raw",
          title: estimate.rationale?.slice(0, 120),
        },
      ],
      raw,
    };
  }

  return { ...base, raw };
}

export function pickVisionEstimate(vision: VisionResult): VisionPriceEstimate | undefined {
  return parseEstimate(vision.visionPriceEstimate);
}
