import type { CardCategory } from "../types";
import type { IdentityLockStatus } from "../types";
import type { MarketSnapshotReason } from "./market-snapshot-reason";

export type MarketSource =
  | "ebay_sold"
  | "ebay_active"
  | "tcgplayer"
  | "pricecharting"
  | "scryfall_print_price"
  | "sports_cards_pro"
  | "manual"
  | "unknown";

export type MarketQueryPurpose =
  | "exact"
  | "narrow"
  | "broad_candidate_discovery"
  | "graded_exact"
  | "raw_exact"
  | "active_sanity_check";

export type MarketSearchQuery = {
  query: string;
  purpose: MarketQueryPurpose;
  requiredTerms: string[];
  forbiddenTerms: string[];
  /** Minus-syntax terms applied to this eBay query (subset of plan exclusions). */
  queryExclusionTerms?: string[];
  notes: string[];
};

export type MarketSearchPlan = {
  planId: string;
  suspectId?: string;
  lockedIdentityUsed: boolean;
  category: CardCategory;
  marketProductName: string;
  gradeContext: "raw" | "graded" | "unknown";
  gradingCompany?: string;
  grade?: string;
  exactQueries: MarketSearchQuery[];
  narrowQueries: MarketSearchQuery[];
  broadQueries: MarketSearchQuery[];
  requiredTerms: string[];
  forbiddenTerms: string[];
  /** High-value minus-syntax terms for eBay queries (subset of forbiddenTerms). */
  queryExclusionTerms: string[];
  /** Canonical finish from identity (e.g. reverse_holo, normal, foil) for comp validation. */
  identityFinish?: string;
  /** Identity fields for catalog pricing lookups (Pokémon TCG API, etc.). */
  identitySetCode?: string;
  identityCollectorNumber?: string;
  identityLanguage?: string;
  catalogSource?: string;
  /** Verified TCGplayer Japan product for scan-derived Japanese Pokémon. */
  tcgplayerJapanProductId?: string;
  /** Broader eBay queries for active listing sanity (MTG — omit finish terms). */
  activeSanityQueries?: MarketSearchQuery[];
  /** Exact Scryfall print payload for scryfall_print_price signal. */
  scryfallCatalogData?: Record<string, unknown>;
  warnings: string[];
};

export type RawMarketComp = {
  source: MarketSource;
  title: string;
  price: number;
  shipping?: number;
  totalPrice?: number;
  soldDate?: string;
  listingDate?: string;
  conditionText?: string;
  url?: string;
  queryUsed?: string;
  rawData?: unknown;
};

export type CompMatchStatus = "accepted" | "rejected" | "maybe";

export type CompRejectionReason =
  | "wrong_card"
  | "wrong_set"
  | "wrong_number"
  | "wrong_language"
  | "wrong_finish"
  | "wrong_edition"
  | "wrong_parallel"
  | "wrong_grade"
  | "wrong_grading_company"
  | "raw_vs_graded_mismatch"
  | "lot_or_bundle"
  | "sealed_product"
  | "proxy_or_custom"
  | "digital_or_code_card"
  | "damaged_condition_mismatch"
  | "active_listing_not_sold"
  | "title_too_ambiguous"
  | "price_outlier"
  | "pricecharting_product_identity_mismatch"
  | "pricing_signal_outlier"
  | "unknown";

export type CompMatchAssessment = {
  comp: RawMarketComp;
  status: CompMatchStatus;
  matchScore: number;
  acceptedReasons: string[];
  rejectionReasons: CompRejectionReason[];
  notes: string[];
};

export type CandidateMarketSnapshot = {
  suspectId?: string;
  /** Why this suspect received a prepared snapshot at ingest. */
  marketSnapshotReason?: MarketSnapshotReason;
  lockedIdentityUsed: boolean;
  marketProductName: string;
  searchPlan: MarketSearchPlan;
  rawComps: RawMarketComp[];
  compAssessments: CompMatchAssessment[];
  acceptedComps: CompMatchAssessment[];
  rejectedComps: CompMatchAssessment[];
  maybeComps: CompMatchAssessment[];
  valueLow?: number;
  valueMedian?: number;
  valueHigh?: number;
  confidence: "high" | "medium" | "low" | "none";
  pricingMethod: string;
  warnings: string[];
  createdAt?: string;
  sourceHealth: import("./source-health-types").MarketSourceHealth[];
  queryAudits: import("./source-health-types").QueryStrategyAudit[];
  marketOutcome: import("./source-health-types").MarketOutcomeSummary;
  tcgplayerMapping?: import("./source-health-types").TcgplayerMappingAudit;
  priceChartingMapping?: import("./source-health-types").PriceChartingMappingAudit;
};

export type MarketRefetchReason =
  | "snapshot_missing"
  | "snapshot_stale"
  | "no_accepted_comps"
  | "low_confidence"
  | "manual_refresh_requested";

export type StaffConfirmedMarketPromotion = {
  confirmedSuspectId: string;
  promotedFromSnapshot: boolean;
  promotedSnapshotId?: string;
  marketRefetchRequired: boolean;
  marketRefetchReason?: MarketRefetchReason;
  confirmedAt: string;
  confirmedBy?: string;
};

export type CardFlowV2MarketBundle = {
  mode:
    | "locked_identity_market"
    | "candidate_market_comparison"
    | "staff_confirmed_identity_market"
    | "no_market_run";
  lockedIdentityStatus: IdentityLockStatus;
  snapshots: CandidateMarketSnapshot[];
  /** When staff confirms a suspect, points at the promoted snapshot. */
  selectedSuspectId?: string;
  identitySource?: "auto_locked" | "staff_confirmed" | "candidate";
  staffConfirmedPromotion?: StaffConfirmedMarketPromotion;
  recommendedStaffAction: string;
  warnings: string[];
  createdAt: string;
  versionMetadata?: import("../version-metadata").CardFlowV2VersionMetadata;
};

export type { MarketSnapshotReason } from "./market-snapshot-reason";
export type MarketIdentityFields = {
  category: CardCategory;
  canonicalName?: string;
  marketProductName?: string;
  setName?: string;
  setCode?: string;
  cardNumber?: string;
  collectorNumber?: string;
  language?: string;
  rarity?: string;
  finish?: string;
  edition?: string;
  variantTags?: string[];
  gradingCompany?: string;
  grade?: string;
  suspectId?: string;
  catalogSource?: string;
  tcgplayerJapanProductId?: string;
  /** Exact Scryfall print payload — used for scryfall_print_price signal only. */
  scryfallCatalogData?: Record<string, unknown>;
};
