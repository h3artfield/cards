import type { ScannedCard, StoreRule, StoreSettings } from "../types";
import type { V2OfferPreview } from "../card-flow-v2/offer/types";
import { applyV2OfferInfluenceToCard } from "../card-flow-v2/offer/apply-v2-offer-influence";
import { evaluateClerkStoreRules } from "./clerk-store-rules";

function statusFromPreview(
  card: ScannedCard,
  preview: V2OfferPreview,
): ScannedCard["status"] {
  if (card.staffDecision === "no") return "do_not_buy";
  if (card.staffDecision === "yes") return "approved";

  const cash = preview.previewCashOffer ?? 0;
  const trade = preview.previewTradeOffer ?? 0;

  if (preview.recommendedAction === "store_rule_rejected") return "do_not_buy";
  if (cash === 0 && trade === 0 && preview.previewMarketValue != null) {
    if (preview.previewMarketValue <= 0) return "do_not_buy";
  }

  if (
    preview.recommendedAction === "staff_review_required" ||
    preview.recommendedAction === "manual_price_required" ||
    preview.recommendedAction === "identity_confirmation_required" ||
    preview.recommendedAction === "insufficient_market_data"
  ) {
    return "manual_review";
  }

  return "processed";
}

/** Apply V2 influence or v2_market_only production ownership. */
export function applyV2PrimaryProduction(input: {
  card: ScannedCard;
  settings: StoreSettings;
  rules: StoreRule[];
}): ScannedCard {
  const influence = applyV2OfferInfluenceToCard(input.card);
  if (influence.applied) {
    return applyStoreRulesToProduction(influence.card, input.rules);
  }

  const preview = input.card.cardFlowV2OfferPreview;
  if (!preview?.enabled) {
    return {
      ...input.card,
      status: "manual_review",
      warnings: [
        ...(input.card.warnings ?? []),
        "V2 offer preview unavailable — manual review required",
      ],
    };
  }

  const market = preview.previewMarketValue;
  const cash = preview.previewCashOffer ?? 0;
  const trade = preview.previewTradeOffer ?? 0;
  let status = statusFromPreview(input.card, preview);

  let result: ScannedCard = {
    ...input.card,
    marketPrice: market,
    cashOffer: cash,
    tradeOffer: trade,
    status,
    pricingJson: {
      ...((input.card.pricingJson as Record<string, unknown> | undefined) ?? {}),
      source: "v2_market_only",
      v2Basis: preview.marketDecision.basis,
      v2AppliedAt: new Date().toISOString(),
      v2RecommendedAction: preview.recommendedAction,
      v2InfluenceReason: influence.reason,
    },
  };

  result = applyStoreRulesToProduction(result, input.rules);
  return result;
}

function shouldDeferStoreRulesOnProduction(card: ScannedCard): boolean {
  return !Boolean(card.cardFlowV2Identity?.staffSelection?.suspectId);
}

function applyStoreRulesToProduction(
  card: ScannedCard,
  rules: StoreRule[],
): ScannedCard {
  if (shouldDeferStoreRulesOnProduction(card)) {
    return card;
  }

  const market = card.marketPrice ?? 0;
  const ruleResult = evaluateClerkStoreRules(card, rules, market);
  if (!ruleResult.doNotBuy && !ruleResult.manualReview) {
    return {
      ...card,
      ruleMatches: ruleResult.matchedRules,
      warnings: [...(card.warnings ?? []), ...ruleResult.notes],
    };
  }

  const warnings = [...(card.warnings ?? []), ...ruleResult.notes];
  if (ruleResult.doNotBuy) {
    return {
      ...card,
      status: "do_not_buy",
      ruleMatches: ruleResult.matchedRules,
      warnings,
    };
  }

  return {
    ...card,
    status: "manual_review",
    ruleMatches: ruleResult.matchedRules,
    warnings,
  };
}
