import type { ScannedCard } from "../types";

export type ProductionFieldSnapshot = {
  marketPrice?: number;
  cashOffer?: number;
  tradeOffer?: number;
  status: ScannedCard["status"];
  pricingJson?: Record<string, unknown>;
  ruleMatches?: string[];
};

export function snapshotProductionFields(
  card: ScannedCard,
): ProductionFieldSnapshot {
  return {
    marketPrice: card.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    status: card.status,
    pricingJson: card.pricingJson
      ? { ...(card.pricingJson as Record<string, unknown>) }
      : undefined,
    ruleMatches: card.ruleMatches ? [...card.ruleMatches] : undefined,
  };
}

/** Merge async V1 enrichment without overwriting V2-primary production fields. */
export function mergeAsyncV1Enrichment(
  before: ProductionFieldSnapshot,
  enriched: ScannedCard,
): ScannedCard {
  return {
    ...enriched,
    marketPrice: before.marketPrice,
    cashOffer: before.cashOffer,
    tradeOffer: before.tradeOffer,
    status: before.status,
    pricingJson: before.pricingJson ?? enriched.pricingJson,
    ruleMatches: before.ruleMatches ?? enriched.ruleMatches,
  };
}

export function isV2PrimaryPricingSource(source?: string): boolean {
  return source === "v2_offer_influence" || source === "v2_market_only";
}
