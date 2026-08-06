export type V2MarketValueBasis =
  | "sold_comp_median"
  | "tcgplayer_low_listing"
  | "tcgplayer_market"
  | "pricecharting_value"
  | "scryfall_print_price"
  | "tcgplayer_pricecharting_blend"
  | "active_sanity_only"
  | "manual_staff_value"
  | "none";

export type V2MarketDecisionConfidence =
  | "high"
  | "medium"
  | "low"
  | "none";

export type V2MarketDecisionBlocker =
  | "identity_not_locked_or_confirmed"
  | "no_market_data"
  | "active_only"
  | "source_disagreement"
  | "high_value_requires_stronger_evidence"
  | "sports_parallel_uncertainty"
  | "raw_graded_uncertainty"
  | "variant_uncertainty"
  | "ebay_sold_unavailable"
  | "price_outlier"
  | "manual_review_required";

export type V2MarketValueDecision = {
  usableForOfferPreview: boolean;
  basis: V2MarketValueBasis;
  /** When set, marketValue is the TCG lowest listing for this condition (no store multiplier). */
  tcgConditionApplied?: import("../../types").ConditionEstimate;
  marketValue?: number;
  valueLow?: number;
  valueHigh?: number;
  confidence: V2MarketDecisionConfidence;
  blockers: V2MarketDecisionBlocker[];
  warnings: string[];
  sourceValues: Array<{
    source: "ebay_sold" | "tcgplayer" | "pricecharting" | "scryfall_print_price" | "manual" | "unknown";
    label: string;
    value: number;
    used: boolean;
    reason?: string;
  }>;
  explanation: string;
};

export type V2OfferPreviewRecommendedAction =
  | "eligible_for_future_guarded_offer"
  | "staff_confirmed_preview_ready"
  | "staff_review_required"
  | "manual_price_required"
  | "insufficient_market_data"
  | "identity_confirmation_required"
  | "store_rule_rejected";

export type V2OfferPreview = {
  enabled: boolean;
  eligible: boolean;
  marketDecision: V2MarketValueDecision;
  currentMarketPrice?: number;
  currentCashOffer?: number;
  currentTradeOffer?: number;
  previewMarketValue?: number;
  previewCashOffer?: number;
  previewTradeOffer?: number;
  cashDifference?: number;
  tradeDifference?: number;
  pricingRuleApplied?: string;
  /** Set when an active do_not_buy store rule matched at preview time. */
  storeRuleBlocked?: boolean;
  storeRuleTitles?: string[];
  recommendedAction: V2OfferPreviewRecommendedAction;
  identityBasis?: "vision_locked" | "staff_confirmed" | "unlocked_candidates" | "no_candidates";
  variantUncertaintyStatus?: import("../types").VariantUncertaintyStatus;
  /** Directive 006J — standardized pricing readiness after staff confirm. */
  pricingReadinessState?: import("./pricing-readiness").V2PricingReadinessState;
  createdAt: string;
  versionMetadata?: import("../version-metadata").CardFlowV2VersionMetadata;
};
