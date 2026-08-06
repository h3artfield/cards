import type { CardCategory, IdentityLockStatus } from "../types";
import type {
  CardFlowV2MarketBundle,
  StaffConfirmedMarketPromotion,
} from "../market/types";

export type V2AuditAgreement =
  | "matches_current"
  | "v2_higher"
  | "v2_lower"
  | "current_has_price_v2_none"
  | "v2_has_price_current_none"
  | "both_no_price"
  | "not_comparable";

export type V2AuditRiskLevel = "low" | "medium" | "high" | "critical";

export type V2AuditIssue =
  | "identity_not_locked"
  | "variant_uncertainty"
  | "no_candidates"
  | "no_accepted_comps"
  | "current_price_without_locked_identity"
  | "v2_rejected_many_current_like_comps"
  | "large_price_disagreement"
  | "raw_graded_mismatch_risk"
  | "parallel_or_foil_uncertainty"
  | "pricecharting_tier_warning"
  | "v1_possible_wrong_pricecharting_mapping"
  | "slab_label_mismatch"
  | "staff_review_needed"
  | "stale_v2_reprocess_recommended";

export type V2PriceComparison = {
  currentMarketPrice?: number;
  currentPricingSource?: string;

  v2ValueLow?: number;
  v2ValueMedian?: number;
  v2ValueHigh?: number;
  v2Confidence: "high" | "medium" | "low" | "none";

  absoluteDifference?: number;
  percentDifference?: number;

  agreement: V2AuditAgreement;
};

export type V2StaffReviewStatus =
  | "not_reviewed"
  | "staff_confirmed_v2"
  | "staff_confirmed_current"
  | "staff_corrected_identity"
  | "staff_corrected_value"
  | "staff_requested_rescan"
  | "staff_manual_price";

export type V2StaffCorrection = {
  status: V2StaffReviewStatus;

  correctedCategory?: CardCategory;
  correctedName?: string;
  correctedSetName?: string;
  correctedSetCode?: string;
  correctedCardNumber?: string;
  correctedVariant?: string;
  correctedGradeContext?: string;
  correctedMarketValue?: number;

  notes?: string;

  reviewedAt?: string;
  reviewedBy?: string;
};

export type V2IdentityBasis =
  | "vision_locked"
  | "staff_confirmed"
  | "unlocked_candidates"
  | "no_candidates";

export type CardFlowV2AuditRecord = {
  cardId: string;
  orderId?: string;

  category: CardCategory;

  currentCardName?: string;
  currentMarketPrice?: number;
  currentCashOffer?: number;
  currentTradeOffer?: number;
  currentStatus?: string;

  v2Locked: boolean;
  v2LockStatus: IdentityLockStatus;
  v2IdentityConfidence: number;
  /** How V2 identity was resolved for this audit row. */
  v2IdentityBasis: V2IdentityBasis;

  v2MarketMode: CardFlowV2MarketBundle["mode"];
  v2MarketConfidence: "high" | "medium" | "low" | "none";

  topV2MarketProductName?: string;

  priceComparison: V2PriceComparison;

  acceptedCompCount: number;
  rejectedCompCount: number;
  maybeCompCount: number;

  issues: V2AuditIssue[];
  riskLevel: V2AuditRiskLevel;

  recommendedStaffAction: string;

  staffCorrection?: V2StaffCorrection;

  /** Whether staff-confirmed market used a prepared snapshot or refetched. */
  v2StaffMarketPromotion?: StaffConfirmedMarketPromotion;

  versionMetadata?: import("../version-metadata").CardFlowV2VersionMetadata;

  createdAt: string;
};

export type V2AuditSummary = {
  totalCards: number;

  lockedCount: number;
  unlockedCount: number;

  highConfidenceMarketCount: number;
  mediumConfidenceMarketCount: number;
  lowConfidenceMarketCount: number;
  noMarketCount: number;

  agreementCounts: Record<V2AuditAgreement, number>;
  riskCounts: Record<V2AuditRiskLevel, number>;

  topIssues: Array<{
    issue: V2AuditIssue;
    count: number;
  }>;

  examples: {
    largeDisagreements: string[];
    identityNotLocked: string[];
    noAcceptedComps: string[];
    slabMismatches: string[];
    pricechartingWarnings: string[];
  };

  avgIdentityConfidence?: number;

  identityBasisCounts: Record<V2IdentityBasis, number>;

  /** Aggregated per-source health from V2 market snapshots on audited cards. */
  sourceHealthStats?: Record<string, number>;

  marketDataCoverage?: import("../market/source-health-types").MarketDataCoverage;

  /** Directive 006 — shadow offer preview rollup. */
  offerPreviewSummary?: import("../offer/offer-preview-summary").V2OfferPreviewSummary;

  /** Directive 006E — staff confirmation + variant uncertainty rollup. */
  staffConfirmationMetrics?: import("../staff-confirmation-queue").StaffConfirmationCoverageMetrics;
};
