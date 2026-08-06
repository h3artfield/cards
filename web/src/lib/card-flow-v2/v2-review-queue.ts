import type { CardFlowV2AuditRecord } from "./audit/types";
import { runCardAuditV2 } from "./audit/run-card-audit-v2";
import type { ScannedCard } from "../types";
import { detectStaleV2Metadata } from "./version-metadata";
import {
  recommendedStaffActionForReview,
  resolveV2ReviewStatus,
  riskLevelForReview,
  type V2ReviewStatus,
} from "./v2-review-status";

export type V2ReviewQueueReason =
  | "identity_not_locked_or_confirmed"
  | "source_disagreement"
  | "v1_possible_wrong_pricecharting_mapping"
  | "pricing_signal_outlier"
  | "active_only"
  | "sports_parallel_uncertainty"
  | "slab_grade_uncertain"
  | "high_value_requires_stronger_evidence"
  | "stale_v2_reprocess_recommended";

export type V2ReviewQueueItem = {
  cardId: string;
  orderId: string;
  orderNumber?: string;
  name?: string;
  frontImageUrl: string;
  category?: string;
  v2ReviewStatus: V2ReviewStatus;
  productionMarketPrice?: number;
  v2PreviewMarketPrice?: number;
  priceDifference?: number;
  priceDifferencePercent?: number;
  riskLevel: ReturnType<typeof riskLevelForReview>;
  recommendedAction: string;
  reasons: V2ReviewQueueReason[];
};

function deriveReviewQueueReasons(
  card: ScannedCard,
  audit: CardFlowV2AuditRecord,
): V2ReviewQueueReason[] {
  const reasons: V2ReviewQueueReason[] = [];
  const preview = card.cardFlowV2OfferPreview;
  const identity = card.cardFlowV2Identity;

  if (
    !identity?.staffSelection?.suspectId &&
    !identity?.lockedIdentity.locked
  ) {
    reasons.push("identity_not_locked_or_confirmed");
  }

  if (audit.issues.includes("v1_possible_wrong_pricecharting_mapping")) {
    reasons.push("v1_possible_wrong_pricecharting_mapping");
  }

  if (preview?.marketDecision.blockers.includes("source_disagreement")) {
    reasons.push("source_disagreement");
  }

  if (preview?.marketDecision.blockers.includes("price_outlier")) {
    reasons.push("pricing_signal_outlier");
  }

  if (preview?.marketDecision.blockers.includes("active_only")) {
    reasons.push("active_only");
  }

  if (preview?.marketDecision.blockers.includes("sports_parallel_uncertainty")) {
    reasons.push("sports_parallel_uncertainty");
  }

  if (preview?.marketDecision.blockers.includes("raw_graded_uncertainty")) {
    reasons.push("slab_grade_uncertain");
  }

  if (
    preview?.marketDecision.blockers.includes("high_value_requires_stronger_evidence")
  ) {
    reasons.push("high_value_requires_stronger_evidence");
  }

  if (detectStaleV2Metadata(card.cardFlowV2VersionMetadata).stale) {
    reasons.push("stale_v2_reprocess_recommended");
  }

  return [...new Set(reasons)];
}

export function buildV2ReviewQueueItem(
  card: ScannedCard,
  orderNumber?: string,
): V2ReviewQueueItem | null {
  if (!card.cardFlowV2Identity && !card.cardFlowV2Market && !card.cardFlowV2Evidence) {
    return null;
  }

  const audit =
    card.cardFlowV2Audit ?? runCardAuditV2({ card });
  const reasons = deriveReviewQueueReasons(card, audit);

  if (!reasons.length) return null;

  const reviewStatus = resolveV2ReviewStatus({ card, audit });
  const productionMarketPrice = card.marketPrice;
  const v2PreviewMarketPrice =
    card.cardFlowV2OfferPreview?.previewMarketValue ??
    card.cardFlowV2OfferPreview?.marketDecision.marketValue ??
    audit.priceComparison.v2ValueMedian;

  let priceDifference: number | undefined;
  let priceDifferencePercent: number | undefined;
  if (
    productionMarketPrice != null &&
    v2PreviewMarketPrice != null &&
    productionMarketPrice > 0
  ) {
    priceDifference = Math.abs(productionMarketPrice - v2PreviewMarketPrice);
    priceDifferencePercent =
      priceDifference / Math.max(productionMarketPrice, v2PreviewMarketPrice);
  }

  return {
    cardId: card.id,
    orderId: card.orderId,
    orderNumber,
    name: card.detectedName,
    frontImageUrl: card.frontImageUrl,
    category: card.category ?? card.cardFlowV2Identity?.category,
    v2ReviewStatus: reviewStatus,
    productionMarketPrice,
    v2PreviewMarketPrice,
    priceDifference,
    priceDifferencePercent,
    riskLevel: riskLevelForReview({ card, audit, reviewStatus }),
    recommendedAction: recommendedStaffActionForReview({
      card,
      audit,
      reviewStatus,
    }),
    reasons,
  };
}

export function buildV2ReviewQueue(
  cards: ScannedCard[],
  orderNumbers: Record<string, string> = {},
): V2ReviewQueueItem[] {
  const riskScore = (item: V2ReviewQueueItem) => {
    const riskMap = { critical: 4, high: 3, medium: 2, low: 1 };
    return (
      riskMap[item.riskLevel] +
      (item.reasons.includes("v1_possible_wrong_pricecharting_mapping") ? 2 : 0) +
      (item.priceDifferencePercent ?? 0) * 10
    );
  };

  return cards
    .map((c) => buildV2ReviewQueueItem(c, orderNumbers[c.orderId]))
    .filter((x): x is V2ReviewQueueItem => x != null)
    .sort((a, b) => riskScore(b) - riskScore(a));
}
