import type {
  ConditionEstimate,
  PricingResult,
  ScannedCard,
  StoreRule,
  StoreSettings,
  VisionResult,
} from "../types";
import { applyStoreRules, rulePricingOptions } from "./rules-engine";
import {
  applyConditionPricing,
  buildConditionLadder,
} from "./condition-ladder";
import { getPrimaryMarketSnapshot } from "../card-flow-v2/market/promote-staff-confirmed-market";
import {
  buildTcgConditionLadder,
  tcgConditionLowForGrade,
} from "../card-flow-v2/market/tcg-condition-pricing";
import { slabLabel, usesSlabGradePricing } from "./slab-pricing";

/** Condition used for offers — staff override wins over vision estimate. */
export function effectiveCardCondition(
  card: Pick<ScannedCard, "conditionEstimate" | "conditionOverride">,
  vision?: VisionResult,
): ConditionEstimate {
  return (
    card.conditionOverride?.condition ??
    card.conditionEstimate ??
    vision?.conditionEstimate ??
    "LP"
  );
}

/** Recompute market value and offers from vision + pricingJson (after refresh or identity fix). */
export function applyMarketPricing(
  card: ScannedCard,
  settings: StoreSettings,
  rules: StoreRule[],
): ScannedCard {
  const vision = card.visionJson as VisionResult | undefined;
  const pricing = card.pricingJson as PricingResult | undefined;
  if (!vision || !pricing) return card;

  const condition = effectiveCardCondition(card, vision);
  const slabPricing = usesSlabGradePricing(card);
  const gradedLabel = slabPricing ? slabLabel(card) : undefined;

  const marketPrice = pricing.marketPrice ?? 0;
  const ruleResult = applyStoreRules(rules, vision, marketPrice);

  const isSlab = vision.itemType === "graded";
  let cashPercent = isSlab
    ? settings.slabCashPercent
    : settings.defaultCashPercent;
  let tradePercent = isSlab
    ? settings.slabTradePercent
    : settings.defaultTradePercent;

  if (ruleResult.cashPercentOverride != null)
    cashPercent = ruleResult.cashPercentOverride;
  if (ruleResult.tradePercentOverride != null)
    tradePercent = ruleResult.tradePercentOverride;

  const snapshot = getPrimaryMarketSnapshot(card.cardFlowV2Market);
  const tcgLow = tcgConditionLowForGrade(
    snapshot?.tcgplayerMapping,
    slabPricing ? "NM" : condition,
  );
  const tcgConditionPricing = tcgLow != null;

  const { marketValue, cashOffer, tradeOffer } = applyConditionPricing(
    tcgConditionPricing ? tcgLow : marketPrice,
    slabPricing ? "NM" : condition,
    settings,
    cashPercent,
    tradePercent,
    {
      skipConditionMultiplier: slabPricing || tcgConditionPricing,
      ...rulePricingOptions(ruleResult),
    },
  );

  const tcgLadder = tcgConditionPricing
    ? buildTcgConditionLadder({
        conditionLowPrices: snapshot!.tcgplayerMapping!.conditionLowPrices!,
        cashPercent,
        tradePercent,
        settings,
        estimatedCondition: slabPricing ? "NM" : condition,
      })
    : undefined;

  const ladder =
    tcgLadder ??
    buildConditionLadder(
      marketPrice,
      settings,
      cashPercent,
      tradePercent,
      slabPricing ? "NM" : condition,
      gradedLabel ? { slabLabel: gradedLabel } : undefined,
    );

  return {
    ...card,
    conditionEstimate: slabPricing ? "NM" : condition,
    marketPrice: marketValue,
    cashOffer: ruleResult.doNotBuy ? 0 : cashOffer,
    tradeOffer: ruleResult.doNotBuy ? 0 : tradeOffer,
    conditionLadder: ladder,
  };
}
