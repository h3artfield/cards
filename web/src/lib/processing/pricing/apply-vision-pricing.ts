import type {
  CardConditionReport,
  PricingResult,
  ScannedCard,
  VisionResult,
} from "../../types";
import {
  isAuthoritativeApiPrice,
  mergeVisionWithApiPricing,
  pickVisionEstimate,
} from "./merge-vision-pricing";
import { estimateMarketPriceFromVision } from "./vision-market-estimate";
import { applyMarketPricing } from "../apply-market-pricing";
import { applySportsVisionToCard } from "../sports-card-fields";
import { sanitizePriceChartingPricing } from "../pricing-verified";
import { usesSlabGradePricing } from "../slab-pricing";
import type { RefreshMarketContext } from "../refresh-pricing";

/** Layer AI vision pricing under API comps — API wins; vision fills $0 gaps. */
export async function applyVisionPricingLayer(
  card: ScannedCard,
  vision: VisionResult,
  apiPricing: PricingResult,
  conditionReport?: CardConditionReport,
): Promise<{ pricing: PricingResult; vision: VisionResult }> {
  const safeApi: PricingResult = apiPricing ?? {
    marketPrice: 0,
    source: "estimate",
    estimated: true,
  };

  let estimate = pickVisionEstimate(vision);
  const needsEstimate =
    safeApi.marketPrice <= 0 || !isAuthoritativeApiPrice(safeApi);

  if (needsEstimate && !estimate?.marketPrice) {
    estimate = await estimateMarketPriceFromVision(
      card,
      vision,
      conditionReport ?? card.conditionReport,
    );
  }

  if (estimate && !vision.visionPriceEstimate) {
    vision = { ...vision, visionPriceEstimate: estimate };
  }

  const pricing = mergeVisionWithApiPricing(safeApi, estimate);
  return { pricing, vision };
}

/** Re-run vision estimate after OpenCV condition grades (more accurate mid price). */
export async function refineVisionPricingAfterCondition(
  card: ScannedCard,
  conditionReport: CardConditionReport,
  ctx: RefreshMarketContext,
): Promise<ScannedCard> {
  if (usesSlabGradePricing(card)) return card;

  const vision = card.visionJson as unknown as VisionResult;
  const apiPricing = card.pricingJson as unknown as PricingResult | undefined;
  if (isAuthoritativeApiPrice(apiPricing)) return card;

  const visionFresh: VisionResult = { ...vision, visionPriceEstimate: undefined };
  const apiBase: PricingResult =
    apiPricing?.source === "vision_estimate"
      ? { ...apiPricing, marketPrice: 0, source: "sports_estimate" }
      : (apiPricing ?? { marketPrice: 0, source: "estimate", estimated: true });

  const { pricing, vision: enrichedVision } = await applyVisionPricingLayer(
    card,
    visionFresh,
    apiBase,
    conditionReport,
  );

  let updated = applySportsVisionToCard(
    { ...card, pricingJson: pricing as unknown as Record<string, unknown> },
    enrichedVision,
  );
  updated = applyMarketPricing(updated, ctx.settings, ctx.rules);
  return sanitizePriceChartingPricing(updated);
}
