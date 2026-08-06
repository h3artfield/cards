import type { CardFlowV2AuditRecord } from "../audit/types";
import type { V2OfferPreview } from "../offer/types";
import type { V2ReviewStatus } from "../v2-review-status";
import type { CandidateMarketSnapshot } from "./types";

const PRICING_WEAK_BLOCKERS = new Set([
  "source_disagreement",
  "no_market_data",
  "active_only",
  "ebay_sold_unavailable",
  "high_value_requires_stronger_evidence",
  "manual_review_required",
  "sports_parallel_uncertainty",
  "raw_graded_uncertainty",
]);

export function shouldShowMarketResearchAssist(input: {
  reviewStatus: V2ReviewStatus;
  offerPreview?: V2OfferPreview;
  audit?: CardFlowV2AuditRecord;
  primarySnap?: CandidateMarketSnapshot;
}): boolean {
  const blockers = input.offerPreview?.marketDecision.blockers ?? [];
  const auditIssues = input.audit?.issues ?? [];

  if (input.reviewStatus === "v2_production_price_warning") return true;
  if (input.reviewStatus === "v2_source_disagreement") return true;
  if (input.reviewStatus === "v2_staff_confirmed_blocked") return true;
  if (input.reviewStatus === "v2_needs_pricing_review") return true;

  if (blockers.some((b) => PRICING_WEAK_BLOCKERS.has(b))) return true;
  if (auditIssues.includes("v1_possible_wrong_pricecharting_mapping")) return true;

  const snap = input.primarySnap;
  if (snap) {
    const soldAccepted = snap.acceptedComps.filter(
      (a) => a.comp.source === "ebay_sold" || a.comp.source === "manual",
    );
    const isActiveOnly =
      snap.pricingMethod === "active_listings_only_sanity_check" ||
      blockers.includes("active_only");
    const slabOrSports =
      snap.searchPlan.gradeContext === "graded" ||
      snap.searchPlan.category === "sports";
    if (isActiveOnly || (slabOrSports && soldAccepted.length === 0)) {
      return true;
    }
    if (
      snap.tcgplayerMapping?.reasonIfSkipped?.includes(
        "no TCGplayer price variants",
      )
    ) {
      return true;
    }
  }

  return false;
}
