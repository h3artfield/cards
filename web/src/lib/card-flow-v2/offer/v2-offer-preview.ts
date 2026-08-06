import type { ScannedCard, StoreRule, StoreSettings, VisionResult } from "../../types";
import {
  applyStoreRules,
  enrichVisionForStoreRules,
  rulePricingOptions,
  type RuleEngineResult,
} from "../../processing/rules-engine";
import {
  applyConditionPricing,
} from "../../processing/condition-ladder";
import {
  effectiveCardCondition,
} from "../../processing/apply-market-pricing";
import { usesSlabGradePricing } from "../../processing/slab-pricing";
import { mapLegacyCategoryToV2 } from "../audit/compare-pricing";
import type { V2MarketValueDecision, V2OfferPreview } from "./types";
import type { VariantUncertaintyStatus } from "../types";
import {
  getVariantUncertaintyStatus,
  resolveIdentityBasis,
} from "./market-value-decision";
import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "../types";
import type { CardFlowV2MarketBundle } from "../market/types";
import { resolvePricingReadinessState } from "./pricing-readiness";

function visionForPreview(card: ScannedCard): VisionResult {
  const existing = card.visionJson as VisionResult | undefined;
  const base =
    existing?.category
      ? existing
      : {
          category: card.category ?? "other",
          itemType: card.itemType === "graded" ? "graded" : "raw",
          cardName: card.detectedName ?? "",
          conditionEstimate: card.conditionEstimate ?? "LP",
          confidence: 0.7,
        };
  return enrichVisionForStoreRules(base as VisionResult, card);
}

function recommendedAction(
  decision: V2MarketValueDecision,
  identityBasis: ReturnType<typeof resolveIdentityBasis>,
  variantStatus: VariantUncertaintyStatus,
  storeRuleBlocked: boolean,
): V2OfferPreview["recommendedAction"] {
  if (storeRuleBlocked) {
    return "store_rule_rejected";
  }
  if (
    identityBasis !== "vision_locked" &&
    identityBasis !== "staff_confirmed"
  ) {
    return "identity_confirmation_required";
  }
  if (
    decision.blockers.includes("source_disagreement") ||
    decision.blockers.includes("high_value_requires_stronger_evidence") ||
    decision.blockers.includes("manual_review_required") ||
    decision.blockers.includes("sports_parallel_uncertainty") ||
    decision.blockers.includes("raw_graded_uncertainty")
  ) {
    return "staff_review_required";
  }
  if (
    decision.blockers.includes("variant_uncertainty") &&
    variantStatus !== "resolved_by_staff_confirmation" &&
    variantStatus !== "resolved_by_vision_lock"
  ) {
    return "staff_review_required";
  }
  if (decision.blockers.includes("no_market_data") || decision.basis === "none") {
    return "insufficient_market_data";
  }
  if (!decision.usableForOfferPreview) {
    return "staff_review_required";
  }
  if (decision.confidence === "low") {
    return "staff_review_required";
  }
  if (
    identityBasis === "staff_confirmed" &&
    variantStatus === "resolved_by_staff_confirmation" &&
    decision.usableForOfferPreview
  ) {
    return "staff_confirmed_preview_ready";
  }
  return "eligible_for_future_guarded_offer";
}

export function buildV2OfferPreview(input: {
  card: ScannedCard;
  decision: V2MarketValueDecision;
  settings: StoreSettings;
  rules: StoreRule[];
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  evidence?: CardFlowV2EvidenceBundle;
}): V2OfferPreview {
  const { card, decision, settings, rules } = input;
  const identityBasis = resolveIdentityBasis(input.identity, input.market);
  const variantStatus = getVariantUncertaintyStatus(input);
  let storeRuleBlocked = false;
  let storeRuleTitles: string[] = [];
  let storeRuleResult: RuleEngineResult | undefined;

  const currentMarketPrice = card.marketPrice;
  const currentCashOffer = card.cashOffer;
  const currentTradeOffer = card.tradeOffer;

  let previewMarketValue: number | undefined;
  let previewCashOffer: number | undefined;
  let previewTradeOffer: number | undefined;
  let pricingRuleApplied: string | undefined;

  const marketForStoreRules =
    decision.marketValue ?? currentMarketPrice ?? undefined;

  if (
    identityBasis === "staff_confirmed" &&
    marketForStoreRules != null &&
    marketForStoreRules > 0
  ) {
    storeRuleResult = applyStoreRules(
      rules,
      visionForPreview(card),
      marketForStoreRules,
      { resaleAnalysis: card.resaleAnalysis },
    );
    storeRuleBlocked = storeRuleResult.doNotBuy;
    storeRuleTitles = storeRuleBlocked ? storeRuleResult.matchedRules : [];
  }

  if (decision.usableForOfferPreview && decision.marketValue != null) {
    const vision = visionForPreview(card);
    const slabPricing = usesSlabGradePricing(card);
    const condition = effectiveCardCondition(card, vision);
    const ruleResult =
      storeRuleResult ??
      (identityBasis === "staff_confirmed"
        ? applyStoreRules(rules, vision, decision.marketValue, {
            resaleAnalysis: card.resaleAnalysis,
          })
        : {
            doNotBuy: false,
            manualReview: false,
            matchedRules: [] as string[],
            notes: [] as string[],
          });
    storeRuleBlocked = ruleResult.doNotBuy;
    storeRuleTitles = storeRuleBlocked ? ruleResult.matchedRules : [];

    const isSlab = vision.itemType === "graded";
    let cashPercent = isSlab
      ? settings.slabCashPercent
      : settings.defaultCashPercent;
    let tradePercent = isSlab
      ? settings.slabTradePercent
      : settings.defaultTradePercent;
    if (ruleResult.cashPercentOverride != null) {
      cashPercent = ruleResult.cashPercentOverride;
    }
    if (ruleResult.tradePercentOverride != null) {
      tradePercent = ruleResult.tradePercentOverride;
    }

    const priced = applyConditionPricing(
      decision.marketValue,
      slabPricing ? "NM" : condition,
      settings,
      cashPercent,
      tradePercent,
      {
        skipConditionMultiplier:
          slabPricing || Boolean(decision.tcgConditionApplied),
        ...rulePricingOptions(ruleResult),
      },
    );

    previewMarketValue = priced.marketValue;
    // Keep informational offers when a store rule blocks buy — clerk still sees what we would pay.
    previewCashOffer = priced.cashOffer;
    previewTradeOffer = priced.tradeOffer;
    pricingRuleApplied = ruleResult.matchedRules.length
      ? ruleResult.matchedRules.join(", ")
      : `default ${Math.round(cashPercent * 100)}% cash / ${Math.round(tradePercent * 100)}% trade`;
  }

  const action = recommendedAction(
    decision,
    identityBasis,
    variantStatus,
    storeRuleBlocked,
  );

  const cashDifference =
    previewCashOffer != null && currentCashOffer != null
      ? previewCashOffer - currentCashOffer
      : undefined;
  const tradeDifference =
    previewTradeOffer != null && currentTradeOffer != null
      ? previewTradeOffer - currentTradeOffer
      : undefined;

  return {
    enabled: true,
    eligible: decision.usableForOfferPreview && !storeRuleBlocked,
    marketDecision: decision,
    currentMarketPrice,
    currentCashOffer,
    currentTradeOffer,
    previewMarketValue,
    previewCashOffer,
    previewTradeOffer,
    cashDifference,
    tradeDifference,
    pricingRuleApplied,
    storeRuleBlocked,
    storeRuleTitles,
    recommendedAction: action,
    identityBasis,
    variantUncertaintyStatus: variantStatus,
    pricingReadinessState: resolvePricingReadinessState({
      preview: {
        enabled: true,
        eligible: decision.usableForOfferPreview,
        marketDecision: decision,
        recommendedAction: action,
        identityBasis,
        variantUncertaintyStatus: variantStatus,
        createdAt: new Date().toISOString(),
      },
      identity: input.identity,
      market: input.market,
    }),
    createdAt: new Date().toISOString(),
  };
}

/** Test helper — ensures preview fields are never copied to production offer fields. */
export function assertPreviewDoesNotMutateProduction(card: ScannedCard): {
  marketPrice: number | undefined;
  cashOffer: number | undefined;
  tradeOffer: number | undefined;
  status: ScannedCard["status"];
} {
  return {
    marketPrice: card.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    status: card.status,
  };
}

export function formatOfferPreviewCategory(card: ScannedCard): string {
  const v = card.visionJson as VisionResult | undefined;
  return mapLegacyCategoryToV2(v?.category ?? card.category);
}
