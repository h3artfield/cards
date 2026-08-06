import type { MarketSnapshot, PricingResult, ScannedCard, VisionPriceEstimate } from "../types";
import { cardDisplayName } from "./card-display-name";

type PriceTier = { low?: number; mid?: number; market?: number; high?: number };

function pickPrimaryTier(
  prices: Record<string, PriceTier> | undefined,
): PriceTier | undefined {
  if (!prices) return undefined;
  return (
    prices.holofoil ??
    prices.normal ??
    prices.reverseHolofoil ??
    Object.values(prices)[0]
  );
}

function liquidityFromSpread(tier?: PriceTier): {
  spreadPct?: number;
  score?: number;
} {
  if (!tier?.market || tier.market <= 0) return {};
  const low = tier.low ?? tier.mid ?? tier.market;
  const high = tier.high ?? tier.market;
  const spreadPct = ((high - low) / tier.market) * 100;
  // Tighter spreads on liquid modern cards; wide spreads on illiquid vintage.
  const score = Math.max(0, Math.min(100, 100 - spreadPct * 2));
  return { spreadPct: Math.round(spreadPct), score: Math.round(score) };
}

export function buildMarketSnapshot(card: ScannedCard): MarketSnapshot {
  const pricing = card.pricingJson as
    | {
        marketPrice?: number;
        source?: string;
        estimated?: boolean;
        raw?: Record<string, unknown>;
      }
    | undefined;

  const raw = pricing?.raw ?? {};
  const tcgplayer = raw.tcgplayer as
    | { prices?: Record<string, PriceTier>; url?: string }
    | undefined;
  const cardmarket = raw.cardmarket as
    | { prices?: Record<string, number> }
    | undefined;
  const set = raw.set as { releaseDate?: string; name?: string } | undefined;

  const tier = pickPrimaryTier(tcgplayer?.prices);
  const { spreadPct, score } = liquidityFromSpread(tier);

  const notes: string[] = [];
  const pricingExt = pricing as PricingResult | undefined;
  const sourceUrl = (pricing as { sourceUrl?: string } | undefined)?.sourceUrl;
  const visionEst = (pricingExt?.raw as { visionEstimate?: VisionPriceEstimate } | undefined)
    ?.visionEstimate;

  if (pricingExt?.source === "vision_estimate" && visionEst?.marketPrice != null) {
    const range =
      visionEst.rangeLow != null && visionEst.rangeHigh != null
        ? ` (range $${visionEst.rangeLow}–$${visionEst.rangeHigh})`
        : "";
    notes.unshift(
      `AI vision market estimate: $${visionEst.marketPrice.toFixed(2)}${range}. ${visionEst.rationale ?? ""}`.trim(),
    );
  } else if (
    visionEst?.marketPrice != null &&
    (pricingExt?.marketPrice ?? 0) > 0 &&
    pricingExt?.source !== "vision_estimate"
  ) {
    notes.push(
      `AI cross-check estimate: $${visionEst.marketPrice.toFixed(2)}${visionEst.rationale ? ` — ${visionEst.rationale}` : ""}`,
    );
    const crossWarn = (pricingExt?.raw as { visionCrossCheckWarning?: string } | undefined)
      ?.visionCrossCheckWarning;
    if (crossWarn) notes.unshift(crossWarn);
  }

  if (sourceUrl?.includes("pricecharting.com")) {
    notes.unshift(`PriceCharting: ${sourceUrl}`);
  }
  const pricingSources = (pricingExt?.sources ??
    (raw.pricingSources as string[] | undefined)) as string[] | undefined;
  if (pricingExt?.source === "multi_source" && pricingSources?.length) {
    const bySource = (pricingExt.comps ?? []).reduce<Record<string, number>>(
      (acc, comp) => {
        acc[comp.source] = (acc[comp.source] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const breakdown = Object.entries(bySource)
      .map(([src, count]) => `${count} ${src}`)
      .join(", ");
    notes.unshift(
      `Multi-source market price from ${pricingSources.length} providers (${breakdown}).`,
    );
  }
  if (pricing?.estimated && (card.marketPrice ?? pricing?.marketPrice ?? 0) <= 0) {
    notes.push("No live comp found — confirm price before buying.");
  } else if (pricingExt?.source === "vision_estimate") {
    notes.push("Market from AI photo estimate — verify on eBay before buying.");
  } else if (pricingExt?.compCount && pricingExt.compCount > 0) {
    notes.unshift(
      `Market from ${pricingExt.compCount} comp${pricingExt.compCount === 1 ? "" : "s"} (${pricingExt.source}, ${pricingExt.compMethod ?? "aggregate"}).`,
    );
  } else if (pricing?.source === "pokemon_tcg") {
    notes.unshift("Live TCGPlayer tiers from Pokémon TCG API.");
  }
  notes.push(
    "Sales frequency is inferred from comp count, liquidity spread, and set demand.",
  );

  return {
    cardName: cardDisplayName(card),
    setName: card.setName ?? set?.name,
    cardNumber: card.cardNumber,
    category: card.category,
    rarity: typeof raw.rarity === "string" ? raw.rarity : undefined,
    condition: card.conditionEstimate,
    setReleaseDate: set?.releaseDate,
    listedMarketPrice: card.marketPrice ?? pricing?.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    priceSource: pricing?.source,
    priceEstimated: pricing?.estimated,
    tcgplayer: tcgplayer?.prices,
    cardmarket: cardmarket?.prices,
    liquidityScore: score,
    priceSpreadPercent: spreadPct,
    dataNotes: notes,
  };
}
