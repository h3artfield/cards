import type {
  CardConditionReport,
  CardIdentityVerification,
  CardResaleAnalysis,
  CardSalesComps,
  ScannedCard,
  StoreRule,
} from "../types";
import { cardDisplayName } from "./card-display-name";
import { buildMarketSnapshot } from "./market-snapshot";
import { TCGPLAYER_CONDITION_GUIDE } from "./tcgplayer-condition-standards";

const ANALYSIS_SCHEMA = `Return JSON only:
{
  "sentiment": "bullish|bearish|neutral",
  "salesFrequency": "high|medium|low|unknown",
  "latestSaleEstimate": number,
  "latestSaleNote": string|null,
  "suggestedCashOffer": number,
  "suggestedTradeOffer": number|null,
  "targetResalePrice": number,
  "estimatedMarginPercent": number,
  "recommendation": "buy|pass|review",
  "summary": string,
  "priceRationale": string,
  "liquidityNotes": string|null,
  "risks": string[],
  "opportunities": string[],
  "confidence": number between 0 and 1
}`;

const RESELLER_SYSTEM = `You are the buyback pricing agent for a retail card shop. You have FINAL AUTHORITY on what cash offer to make. The shop owner reads your report and uses your numbers — they do not haggle based on your notes.

Audience: store owner/buyer only. Never address the customer selling the card.

Critical rules:
- ALWAYS output concrete dollar amounts for suggestedCashOffer, targetResalePrice, and latestSaleEstimate when ANY market data exists (TCGPlayer tiers, PriceCharting, comps, catalog mid, condition-adjusted estimates, or visionEstimate in marketSnapshot dataNotes / pricingJson.raw.visionEstimate).
- When marketSnapshot lists an AI vision estimate and no sold comps, use that estimate for latestSaleEstimate and suggestedCashOffer (discounted for shop margin) — do not output $0 unless identity mismatch.
- suggestedCashOffer is YOUR recommended cash buy price for THIS copy in THIS condition — not a range, not "consider offering", not "negotiate down". One number.
- NEVER use words like negotiate, haggle, counter, or "try to get them down". Either recommend buying at suggestedCashOffer or pass.
- recommendation: "buy" = pay suggestedCashOffer (good risk/reward), "pass" = do not buy at any reasonable price, "review" = ONLY when identity is wrong or zero market signal exists.
- summary: 2-3 sentences stating your suggested cash offer, expected resale, margin, and the key data behind it (comps, trend, liquidity, condition).
- When marketSnapshot.tcgplayer or cardmarket prices match the confirmed card printing and rarity, USE them for latestSaleEstimate and suggestedCashOffer — they ARE the market price for this variant. Never dismiss catalog API prices as "not applicable" when identity is confirmed/likely and the catalog record matches set + number.
- Use conditionReport subgrades and salesComps — comps may include tcgplayer_market, pricecharting, ebay_sold, and ebay_listed tagged by source; prefer sold/API tiers over active listings and visionEstimate.
- Store condition grades (NM/LP/MP/HP/DMG) follow TCGPlayer standards; conditionReport OpenCV scan supports the estimate.
${TCGPLAYER_CONDITION_GUIDE}
- If identityVerification shows mismatch, recommendation must be pass or review and suggestedCashOffer should be 0.
- Trade offer: if store trade multiplier applies, suggestedTradeOffer ≈ suggestedCashOffer × (tradeOffer/cashOffer) when both store offers exist.
- When storeOffer.cash and storeOffer.trade are present and > 0, use those exact values for suggestedCashOffer and suggestedTradeOffer — they reflect the owner's configured buy percentages.
- storeRules lists owner policies you MUST follow (e.g. slow movers, do-not-buy categories, margin floors). When a rule applies to this card, reflect it in recommendation, risks, and suggestedCashOffer. Qualitative rules like "slow to sell" or "slow movers" mean pass unless comps show high liquidity.
- ruleMatches lists store rules already flagged for this card — align your recommendation with them.`;

export async function analyzeCardResale(
  card: ScannedCard,
  context?: {
    identityVerification?: CardIdentityVerification;
    conditionReport?: CardConditionReport;
    salesComps?: CardSalesComps;
    rules?: StoreRule[];
  },
): Promise<CardResaleAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for resale analysis. Add it to web/.env.local.",
    );
  }

  const marketSnapshot = buildMarketSnapshot(card);
  const model = process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o";
  const displayName = cardDisplayName(card);

  const userPayload = {
    card: {
      name: displayName,
      set: card.setName,
      number: card.cardNumber,
      category: card.category,
      condition: card.conditionEstimate,
      variant: card.variant,
      slab: card.slabCompany
        ? `${card.slabCompany} ${card.slabGrade}`
        : undefined,
    },
    storeOffer: {
      cash: card.cashOffer,
      trade: card.tradeOffer,
      marketEstimate: card.marketPrice,
    },
    marketSnapshot,
    identityVerification: context?.identityVerification ?? card.identityVerification,
    conditionReport: context?.conditionReport ?? card.conditionReport,
    salesComps: context?.salesComps ?? card.salesComps,
    warnings: card.warnings ?? [],
    ruleMatches: card.ruleMatches ?? [],
    storeRules: (context?.rules ?? [])
      .filter((r) => r.active)
      .map((r) => ({
        title: r.title,
        type: r.ruleType,
        text: r.ruleText,
        categories: r.appliesToCategories,
      })),
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${RESELLER_SYSTEM}\n${ANALYSIS_SCHEMA}` },
        {
          role: "user",
          content: `Analyze this buyback card for resale:\n${JSON.stringify(userPayload, null, 2)}`,
        },
      ],
      max_tokens: 1100,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resale analysis failed: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content) as Partial<CardResaleAnalysis>;

  const analysis = normalizeAnalysis(parsed, marketSnapshot, model);
  if ((card.cashOffer ?? 0) > 0) {
    analysis.suggestedCashOffer = card.cashOffer;
  }
  if ((card.tradeOffer ?? 0) > 0) {
    analysis.suggestedTradeOffer = card.tradeOffer;
  }
  return analysis;
}

function normalizeAnalysis(
  raw: Partial<CardResaleAnalysis> & {
    suggestedCashOffer?: number;
    maxBuyPrice?: number;
    priceRationale?: string;
  },
  marketSnapshot: ReturnType<typeof buildMarketSnapshot>,
  model: string,
): CardResaleAnalysis {
  const sentiments = ["bullish", "bearish", "neutral"] as const;
  const frequencies = ["high", "medium", "low", "unknown"] as const;
  const recs = ["buy", "pass", "review"] as const;

  const suggestedCash =
    raw.suggestedCashOffer != null
      ? Number(raw.suggestedCashOffer)
      : raw.maxBuyPrice != null
        ? Number(raw.maxBuyPrice)
        : undefined;

  let recommendation = recs.includes(
    raw.recommendation as (typeof recs)[number],
  )
    ? (raw.recommendation as CardResaleAnalysis["recommendation"])
    : "review";

  if (raw.recommendation === "negotiate") {
    recommendation = suggestedCash != null && suggestedCash > 0 ? "buy" : "review";
  }

  const rationale = raw.priceRationale?.trim();
  const summary = raw.summary?.trim() || "No summary returned.";

  return {
    sentiment: sentiments.includes(raw.sentiment as (typeof sentiments)[number])
      ? (raw.sentiment as CardResaleAnalysis["sentiment"])
      : "neutral",
    salesFrequency: frequencies.includes(
      raw.salesFrequency as (typeof frequencies)[number],
    )
      ? (raw.salesFrequency as CardResaleAnalysis["salesFrequency"])
      : "unknown",
    latestSaleEstimate:
      raw.latestSaleEstimate != null ? Number(raw.latestSaleEstimate) : undefined,
    latestSaleNote: raw.latestSaleNote ?? undefined,
    suggestedCashOffer: suggestedCash,
    suggestedTradeOffer:
      raw.suggestedTradeOffer != null ? Number(raw.suggestedTradeOffer) : undefined,
    maxBuyPrice: suggestedCash,
    targetResalePrice:
      raw.targetResalePrice != null ? Number(raw.targetResalePrice) : undefined,
    estimatedMarginPercent:
      raw.estimatedMarginPercent != null
        ? Number(raw.estimatedMarginPercent)
        : undefined,
    recommendation,
    summary,
    priceRationale: rationale,
    liquidityNotes: raw.liquidityNotes ?? undefined,
    risks: Array.isArray(raw.risks) ? raw.risks.map(String).slice(0, 6) : [],
    opportunities: Array.isArray(raw.opportunities)
      ? raw.opportunities.map(String).slice(0, 6)
      : [],
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.5)),
    analyzedAt: new Date().toISOString(),
    model,
    marketSnapshot,
  };
}
