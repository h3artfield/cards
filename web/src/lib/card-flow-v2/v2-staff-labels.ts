import type { V2ReviewStatus } from "./v2-review-status";
import type { V2ReviewQueueReason } from "./v2-review-queue";

/** Employee-friendly review status — hide internal enum names from staff UI. */
export function friendlyReviewStatus(status: V2ReviewStatus): string {
  switch (status) {
    case "v2_production_price_warning":
      return "Production price warning";
    case "v2_source_disagreement":
      return "Source disagreement";
    case "v2_staff_confirmed_ready":
      return "Staff-confirmed ready";
    case "v2_staff_confirmed_blocked":
      return "Pricing blocked";
    case "v2_needs_identity_confirmation":
      return "Needs identity confirmation";
    case "v2_needs_pricing_review":
      return "Needs pricing review";
    case "v2_ready_for_staff":
      return "Ready for staff review";
    case "v2_not_ready":
      return "V2 not ready";
  }
}

export function friendlyQueueReason(reason: V2ReviewQueueReason | string): string {
  switch (reason) {
    case "identity_not_locked_or_confirmed":
      return "Needs identity confirmation";
    case "source_disagreement":
      return "Source prices disagree";
    case "v1_possible_wrong_pricecharting_mapping":
      return "Production price may be wrong";
    case "pricing_signal_outlier":
      return "Pricing signal outlier";
    case "active_only":
      return "Active listings only";
    case "sports_parallel_uncertainty":
      return "Sports parallel uncertain";
    case "slab_grade_uncertain":
      return "Slab grade uncertain";
    case "high_value_requires_stronger_evidence":
      return "High value — needs stronger evidence";
    case "stale_v2_reprocess_recommended":
      return "V2 result may be stale";
    default:
      return reason.replace(/_/g, " ");
  }
}

export function friendlyBlocker(blocker: string): string {
  switch (blocker) {
    case "identity_not_locked_or_confirmed":
      return "Confirm the correct printing first";
    case "source_disagreement":
      return "Source prices disagree";
    case "no_market_data":
      return "Not enough market data";
    case "active_only":
      return "Active listings only — not sold value";
    case "ebay_sold_unavailable":
      return "eBay sold unavailable";
    case "price_outlier":
      return "Price signal outlier";
    case "high_value_requires_stronger_evidence":
      return "High value needs stronger evidence";
    case "sports_parallel_uncertainty":
      return "Sports parallel uncertain";
    case "raw_graded_uncertainty":
      return "Raw vs graded uncertain";
    case "variant_uncertainty":
      return "Variant uncertain";
    case "manual_review_required":
      return "Manual review required";
    default:
      return blocker.replace(/_/g, " ");
  }
}

export function friendlyPreviewAction(action?: string): string {
  switch (action) {
    case "staff_confirmed_preview_ready":
      return "Ready — low confidence";
    case "staff_review_required":
      return "Staff review required";
    case "identity_confirmation_required":
      return "Confirm printing first";
    case "insufficient_market_data":
      return "Not enough market data";
    case "manual_price_required":
      return "Manual price required";
    case "eligible_for_future_guarded_offer":
      return "Ready for future guarded offer";
    default:
      return action?.replace(/_/g, " ") ?? "Review needed";
  }
}

export function friendlyBasis(basis?: string): string {
  switch (basis) {
    case "scryfall_print_price":
      return "Exact Scryfall print price";
    case "tcgplayer_pricecharting_blend":
      return "TCGplayer + PriceCharting blend";
    case "tcgplayer_low_listing":
      return "TCGplayer lowest listing";
    case "tcgplayer_market":
      return "TCGplayer market average (30d)";
    case "pricecharting_value":
      return "PriceCharting value";
    case "sold_comp_median":
      return "Sold comp median";
    case "active_sanity_only":
      return "Active listing sanity check";
    case "none":
      return "None";
    default:
      return basis?.replace(/_/g, " ") ?? "—";
  }
}

/** Short source label for collapsed card summary — e.g. "Scryfall". */
export function friendlyBasisShort(basis?: string): string {
  switch (basis) {
    case "scryfall_print_price":
      return "Scryfall";
    case "tcgplayer_pricecharting_blend":
      return "TCGplayer + PriceCharting";
    case "tcgplayer_low_listing":
      return "TCGplayer low";
    case "tcgplayer_market":
      return "TCGplayer avg";
    case "pricecharting_value":
      return "PriceCharting";
    case "sold_comp_median":
      return "Sold comps";
    case "active_sanity_only":
      return "Active listings";
    case "manual_staff_value":
      return "Staff value";
    case "none":
      return "—";
    default:
      return basis?.replace(/_/g, " ") ?? "—";
  }
}

export function friendlyPcSkipReason(reason?: string): string {
  if (reason === "pricecharting_product_identity_mismatch") {
    return "Wrong PriceCharting printing rejected";
  }
  return reason?.replace(/_/g, " ") ?? "";
}

export function formatPriceDiffPercent(
  production?: number,
  preview?: number,
): string | undefined {
  if (production == null || preview == null || production <= 0) return undefined;
  const pct = ((preview - production) / production) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}
