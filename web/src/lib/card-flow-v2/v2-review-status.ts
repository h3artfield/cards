import type { CardFlowV2AuditRecord, V2AuditRiskLevel } from "./audit/types";
import { runCardAuditV2 } from "./audit/run-card-audit-v2";
import type { V2OfferPreview } from "./offer/types";
import type { ScannedCard } from "../types";
import { detectStaleV2Metadata } from "./version-metadata";

export type V2ReviewStatus =
  | "v2_ready_for_staff"
  | "v2_staff_confirmed_ready"
  | "v2_staff_confirmed_blocked"
  | "v2_needs_identity_confirmation"
  | "v2_needs_pricing_review"
  | "v2_production_price_warning"
  | "v2_source_disagreement"
  | "v2_not_ready";

const PRICING_REVIEW_BLOCKERS = new Set([
  "price_outlier",
  "high_value_requires_stronger_evidence",
  "active_only",
  "sports_parallel_uncertainty",
  "raw_graded_uncertainty",
  "manual_review_required",
  "no_market_data",
  "ebay_sold_unavailable",
]);

export function resolveV2ReviewStatus(input: {
  card: ScannedCard;
  audit?: CardFlowV2AuditRecord;
  offerPreview?: V2OfferPreview;
}): V2ReviewStatus {
  const { card } = input;
  const hasV2 =
    card.cardFlowV2Evidence ||
    card.cardFlowV2Identity ||
    card.cardFlowV2Market;

  if (!hasV2) return "v2_not_ready";

  const stale = detectStaleV2Metadata(card.cardFlowV2VersionMetadata);
  if (stale.stale) return "v2_not_ready";

  const audit =
    input.audit ??
    card.cardFlowV2Audit ??
    runCardAuditV2({ card });
  const preview = input.offerPreview ?? card.cardFlowV2OfferPreview;
  const identity = card.cardFlowV2Identity;

  const staffConfirmed = Boolean(identity?.staffSelection?.suspectId);

  if (staffConfirmed) {
    if (
      preview?.storeRuleBlocked ||
      preview?.recommendedAction === "store_rule_rejected"
    ) {
      return "v2_staff_confirmed_blocked";
    }
    if (
      preview?.eligible ||
      preview?.recommendedAction === "staff_confirmed_preview_ready"
    ) {
      return "v2_staff_confirmed_ready";
    }
    return "v2_staff_confirmed_blocked";
  }

  if (audit.issues.includes("v1_possible_wrong_pricecharting_mapping")) {
    return "v2_production_price_warning";
  }

  if (preview?.marketDecision.blockers.includes("source_disagreement")) {
    return "v2_source_disagreement";
  }

  if (
    preview?.marketDecision.blockers.some((b) => PRICING_REVIEW_BLOCKERS.has(b))
  ) {
    return "v2_needs_pricing_review";
  }

  if (!identity?.lockedIdentity.locked) {
    return "v2_needs_identity_confirmation";
  }

  return "v2_ready_for_staff";
}

export function v2ReviewStatusLabel(status: V2ReviewStatus): string {
  switch (status) {
    case "v2_ready_for_staff":
      return "Ready for staff review";
    case "v2_staff_confirmed_ready":
      return "Staff confirmed — preview ready";
    case "v2_staff_confirmed_blocked":
      return "Staff confirmed — pricing blocked";
    case "v2_needs_identity_confirmation":
      return "Needs identity confirmation";
    case "v2_needs_pricing_review":
      return "Needs pricing review";
    case "v2_production_price_warning":
      return "Production price warning";
    case "v2_source_disagreement":
      return "Source disagreement";
    case "v2_not_ready":
      return "V2 not ready / stale";
  }
}

export function v2ReviewStatusTone(
  status: V2ReviewStatus,
): "green" | "amber" | "red" | "violet" | "slate" {
  switch (status) {
    case "v2_staff_confirmed_ready":
      return "green";
    case "v2_production_price_warning":
    case "v2_staff_confirmed_blocked":
      return "red";
    case "v2_source_disagreement":
    case "v2_needs_pricing_review":
      return "amber";
    case "v2_needs_identity_confirmation":
      return "violet";
    case "v2_not_ready":
      return "slate";
    default:
      return "violet";
  }
}

export function recommendedStaffActionForReview(input: {
  card: ScannedCard;
  audit?: CardFlowV2AuditRecord;
  reviewStatus: V2ReviewStatus;
}): string {
  const audit =
    input.audit ??
    input.card.cardFlowV2Audit ??
    runCardAuditV2({ card: input.card });

  if (input.reviewStatus === "v2_production_price_warning") {
    return "Review production price — V2 suspects wrong PriceCharting print mapping.";
  }
  if (input.reviewStatus === "v2_source_disagreement") {
    return "Two pricing sources disagree — staff review required; do not average.";
  }
  if (input.reviewStatus === "v2_staff_confirmed_ready") {
    return "V2 preview ready — compare with production before accepting offer.";
  }
  if (input.reviewStatus === "v2_staff_confirmed_blocked") {
    return input.card.cardFlowV2OfferPreview?.marketDecision.explanation ??
      "Staff confirmed identity but pricing preview is blocked.";
  }
  if (input.reviewStatus === "v2_needs_identity_confirmation") {
    return "Confirm the correct printing in the V2 suspect picker.";
  }
  if (input.reviewStatus === "v2_not_ready") {
    return detectStaleV2Metadata(input.card.cardFlowV2VersionMetadata).message ??
      "Re-run shadow V2 reprocess.";
  }

  return audit.recommendedStaffAction;
}

export function riskLevelForReview(input: {
  card: ScannedCard;
  audit?: CardFlowV2AuditRecord;
  reviewStatus: V2ReviewStatus;
}): V2AuditRiskLevel {
  const audit =
    input.audit ??
    input.card.cardFlowV2Audit ??
    runCardAuditV2({ card: input.card });

  if (input.reviewStatus === "v2_production_price_warning") return "critical";
  if (input.reviewStatus === "v2_source_disagreement") return "high";
  if (input.reviewStatus === "v2_staff_confirmed_blocked") return "high";
  if (input.reviewStatus === "v2_not_ready") return "medium";
  return audit.riskLevel;
}
