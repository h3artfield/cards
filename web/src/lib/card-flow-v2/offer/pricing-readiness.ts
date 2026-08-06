import type { CardCandidateBundle } from "../types";
import type { CardFlowV2MarketBundle } from "../market/types";
import type { V2MarketValueDecision, V2OfferPreview } from "./types";

export type V2PricingReadinessState =
  | "ready"
  | "ready_low_confidence"
  | "blocked_identity_unconfirmed"
  | "blocked_variant_unresolved"
  | "blocked_source_disagreement"
  | "blocked_insufficient_market_data"
  | "blocked_active_only"
  | "blocked_sports_parallel"
  | "blocked_slab_grade_uncertain"
  | "blocked_high_value_staff_review"
  | "stale_snapshot_needs_refresh";

export function resolvePricingReadinessState(input: {
  preview?: V2OfferPreview;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
}): V2PricingReadinessState {
  const { preview, identity, market } = input;
  const md = preview?.marketDecision;
  const promotion = market?.staffConfirmedPromotion;

  if (!identity?.staffSelection?.suspectId) {
    if (identity?.lockedIdentity?.locked) {
      // vision-locked path may still preview
    } else {
      return "blocked_identity_unconfirmed";
    }
  }

  if (
    promotion?.marketRefetchRequired &&
    promotion.marketRefetchReason === "snapshot_stale"
  ) {
    return "stale_snapshot_needs_refresh";
  }

  if (!md) return "blocked_insufficient_market_data";

  if (md.blockers.includes("variant_uncertainty")) {
    return "blocked_variant_unresolved";
  }
  if (md.blockers.includes("source_disagreement")) {
    return "blocked_source_disagreement";
  }
  if (md.blockers.includes("active_only")) {
    return "blocked_active_only";
  }
  if (md.blockers.includes("sports_parallel_uncertainty")) {
    return "blocked_sports_parallel";
  }
  if (md.blockers.includes("raw_graded_uncertainty")) {
    return "blocked_slab_grade_uncertain";
  }
  if (
    md.blockers.includes("high_value_requires_stronger_evidence") ||
    md.blockers.includes("manual_review_required")
  ) {
    return "blocked_high_value_staff_review";
  }
  if (md.blockers.includes("no_market_data") || md.basis === "none") {
    return "blocked_insufficient_market_data";
  }

  if (preview?.eligible && md.confidence === "low") {
    return "ready_low_confidence";
  }
  if (preview?.eligible) return "ready";

  return "blocked_insufficient_market_data";
}

export function pricingReadinessLabel(state: V2PricingReadinessState): string {
  return state.replace(/_/g, " ");
}

export function blockedPreviewFromDecision(
  decision: V2MarketValueDecision,
  explanation?: string,
): Pick<V2OfferPreview, "eligible" | "recommendedAction" | "marketDecision"> {
  return {
    eligible: false,
    recommendedAction:
      decision.blockers.includes("no_market_data") ||
      decision.basis === "none"
        ? "insufficient_market_data"
        : "staff_review_required",
    marketDecision: {
      ...decision,
      usableForOfferPreview: false,
      explanation:
        explanation ??
        decision.explanation ??
        "Confirmed identity was promoted, but pricing is blocked.",
    },
  };
}
