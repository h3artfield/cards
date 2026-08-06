import type { ScannedCard, StoreRule, StoreSettings, VisionResult } from "../types";
import { applyMarketPricing } from "./apply-market-pricing";
import { enrichVisionFromPokemonCard, normalizeVisionCardNumber } from "./pokemon-utils";
import { findCatalogCard, lookupMarketPrice } from "./pricing";
import { enrichSportsCardIdentity } from "./enrich-sports-vision";
import { normalizeSportsVisionFields } from "./pricing/sports-search-queries";
import { applySportsVisionToCard } from "./sports-card-fields";
import { sanitizePriceChartingPricing } from "./pricing-verified";
import { applyVisionPricingLayer } from "./pricing/apply-vision-pricing";
import { visionForPricing, mergeVisionSlabFields, usesSlabGradePricing } from "./slab-pricing";

export interface RefreshMarketContext {
  settings: StoreSettings;
  rules: StoreRule[];
}

/** Pull fresh market tiers and ensure catalog raw (for reference art) is attached. */
export async function refreshCardMarketData(
  card: ScannedCard,
  ctx?: RefreshMarketContext,
): Promise<ScannedCard> {
  if (!card.visionJson) return card;

  let vision = visionForPricing(
    card.visionJson as unknown as VisionResult,
    card,
  );
  if (vision.category === "sports") {
    vision = normalizeSportsVisionFields(
      await enrichSportsCardIdentity(vision, {
        frontImageUrl: card.frontImageUrl,
        backImageUrl: card.backImageUrl,
      }),
    );
  }
  const priorVision = vision;
  let pricing = await lookupMarketPrice(vision, { card });

  if (
    vision.category === "pokemon" &&
    pricing.raw &&
    !pricing.estimated &&
    !usesSlabGradePricing(card)
  ) {
    vision = normalizeVisionCardNumber(
      mergeVisionSlabFields(enrichVisionFromPokemonCard(vision, pricing.raw)),
      pricing.raw as Record<string, unknown>,
    );
    if (
      vision.setName !== priorVision.setName ||
      vision.cardNumber !== priorVision.cardNumber
    ) {
      pricing = await lookupMarketPrice(vision, { card });
      if (pricing.raw && !pricing.estimated) {
        vision = mergeVisionSlabFields(
          enrichVisionFromPokemonCard(vision, pricing.raw),
        );
      }
    }
  }

  if (!pricing.raw) {
    const catalog = await findCatalogCard(vision);
    if (catalog) {
      pricing = {
        ...pricing,
        raw: catalog.raw,
        source: catalog.source,
        sourceUrl: catalog.sourceUrl,
      };
      if (vision.category === "pokemon") {
        vision = enrichVisionFromPokemonCard(vision, catalog.raw);
        const repriced = await lookupMarketPrice(vision, { card });
        if (repriced.marketPrice > 0 || repriced.raw) {
          pricing = { ...repriced, raw: repriced.raw ?? catalog.raw };
        }
      }
    }
  }

  const visionPricing = await applyVisionPricingLayer(card, vision, pricing);
  vision = visionPricing.vision;
  pricing = visionPricing.pricing;

  let updated: ScannedCard = applySportsVisionToCard(
    {
      ...card,
      pricingJson: pricing as unknown as Record<string, unknown>,
    },
    vision,
  );

  if (ctx) {
    updated = applyMarketPricing(updated, ctx.settings, ctx.rules);
  }

  return sanitizePriceChartingPricing(updated);
}
