import type { CardFlowV2EvidenceBundle, CardCandidateBundle } from "./card-flow-v2/types";
import type { CardFlowV2MarketBundle } from "./card-flow-v2/market/types";
import type { CardFlowV2AuditRecord } from "./card-flow-v2/audit/types";

export type {
  CardFlowV2EvidenceBundle,
  CardCandidateBundle,
  CardFlowV2MarketBundle,
  CardFlowV2AuditRecord,
};

export type CardCategory =
  | "pokemon"
  | "magic"
  | "yugioh"
  | "sports"
  | "other";

export type ItemType = "raw" | "graded" | "unknown";

export type OrderStatus =
  | "draft"
  | "scanning"
  | "submitted"
  | "processing"
  | "under_review"
  | "offer_ready"
  | "accepted"
  | "declined"
  | "paid"
  | "cancelled";

export type CardStatus =
  | "pending"
  | "processing"
  | "processed"
  | "manual_review"
  | "approved"
  | "rejected"
  | "do_not_buy";

export type ConditionEstimate = "NM" | "LP" | "MP" | "HP" | "DMG";

/** Store staff override of AI pre-grade condition. */
export interface ConditionOverride {
  condition: ConditionEstimate;
  previousCondition?: ConditionEstimate;
  changedByName: string;
  changedAt: string;
}

/** Audit when staff edits offer fields via Edit. */
export interface StaffEditRecord {
  changedByName: string;
  changedAt: string;
}

export type BuyDecision = "cash" | "trade" | "pass";

/** Customer auth provider for buyback end-users (not store staff). */
export type CustomerAuthProvider = "guest" | "email" | "google" | "apple";

export type CustomerEmailVerificationMode =
  | "optional"
  | "required_before_submit"
  | "required_before_order_history"
  | "required_before_ready_email";

export interface Customer {
  id: string;
  role: "customer";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Store this customer signed up at */
  storeId?: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  authProviders: CustomerAuthProvider[];
  googleProviderId?: string;
  appleProviderId?: string;
  /** Guest checkout — no password / limited account access */
  isGuest?: boolean;
  guestId?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  /** Server-only — never returned to clients */
  passwordHash?: string;
  emailVerificationTokenHash?: string;
  emailVerificationSentAt?: string;
  passwordResetTokenHash?: string;
  passwordResetSentAt?: string;
}

export interface OrderCustomerInfo {
  customerId?: string;
  guestId?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  emailVerified: boolean;
  authProvider?: CustomerAuthProvider;
}

export interface CustomerSession {
  customerId: string;
  email: string;
  role: "customer";
}

/** Store staff yes/no on including this card in the order offer. */
export type StaffCardDecision = "yes" | "no";

export type RuleType =
  | "do_not_buy"
  | "manual_review"
  | "adjust_percentage"
  | "note_only"
  | "min_purchase_price"
  | "rarity_buy_override"
  | "round_up_offers";

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  do_not_buy: "Do not buy",
  manual_review: "Manager check",
  adjust_percentage: "Percentage change",
  note_only: "Notes only",
  min_purchase_price: "Min purchase price (by rarity)",
  rarity_buy_override: "Always buy (by rarity)",
  round_up_offers: "Round cash & trade up ($)",
};

export interface BuybackOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  /** Store this order belongs to */
  storeId?: string;
  storeSlug?: string;
  /** Snapshot of submitter at order creation */
  customer?: OrderCustomerInfo;
  status: OrderStatus;
  createdAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  totalMarketEstimate?: number;
  totalCashOffer?: number;
  totalTradeOffer?: number;
  manualReviewCount?: number;
  customerNotes?: string;
  adminNotes?: string;
  /** Final offer path chosen by store: cash or trade total. */
  offerType?: "cash" | "trade";
  /** When the store finalized the buy (cash/trade) or cancelled. */
  completedAt?: string;
  /** Amount actually paid on completion (cash or trade credit). */
  purchaseAmount?: number;
  /** Audit trail when staff reopens a finalized order. */
  reopenHistory?: OrderReopenRecord[];
  /** Customer notification delivery status (006W). */
  orderNotifications?: OrderNotifications;
  /** Directive 008 — Cloud Run Job / worker tracking. */
  processingJobId?: string;
  processingAttemptId?: string;
  processingStartedAt?: string;
  processingHeartbeatAt?: string;
  lastCompletedStep?: string;
  orderProcessingTimings?: OrderProcessingTimings;
}

export interface OrderProcessingTimings {
  workerMode: string;
  pipelineMode: string;
  jobExecutionId?: string;
  startedAt: string;
  completedAt?: string;
  totalMs?: number;
  cardsProcessed: number;
  cardsSkipped: number;
  cardsFailed: number;
}

export interface CardProcessingTimings {
  workerMode?: "after" | "cloud_run_job";
  pipelineMode?: "legacy_dual" | "v2_primary";
  v2EvidenceMs?: number;
  v2IdentityMs?: number;
  v2MarketMs?: number;
  v2AuditPreviewMs?: number;
  v2InfluenceMs?: number;
  storeRulesMs?: number;
  v1VisionMs?: number;
  v1PricingMs?: number;
  v1FullAnalysisMs?: number;
  totalMs?: number;
  startedAt?: string;
  completedAt?: string;
  apiCallCounts?: {
    openai?: number;
    ebay?: number;
    pricecharting?: number;
    tcgplayer?: number;
    scryfall?: number;
    pokemonTcg?: number;
  };
}

export interface OrderNotifications {
  readyForReviewEmail?: ReadyForReviewEmailNotification;
}

export interface ReadyForReviewEmailNotification {
  attemptedAt: string;
  sentAt?: string;
  status: "sent" | "failed" | "skipped";
  provider: "resend";
  to?: string;
  messageId?: string;
  error?: string;
}

export interface OrderReopenRecord {
  reopenedByName: string;
  reopenedAt: string;
  previousStatus: OrderStatus;
  previousCompletedAt?: string;
  previousOfferType?: "cash" | "trade";
  previousPurchaseAmount?: number;
}

export type PurchaseType = "cash" | "trade" | "cancelled";

/** Ledger row when an order is completed or cancelled. */
export interface BuybackTransaction {
  id: string;
  storeId: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  type: PurchaseType;
  amount: number;
  cardCount: number;
  createdAt: string;
}

/** Lifecycle of a physical card in store inventory. */
export type InventoryStatus = "on_hand" | "listed" | "sold" | "withdrawn";

/** Sales channel where inventory was sold or listed. */
export type InventorySalesChannel =
  | "shopify"
  | "ebay"
  | "tcgplayer"
  | "other";

/** Where this inventory row originated. Legacy rows omit source (buyback). */
export type InventorySource = "buyback" | "tcgplayer_import" | "shopify_import";

/** Shopify listing metadata stored on inventory (canonical for sold detection). */
export interface InventoryShopifyListing {
  sku: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  exportPrice: number;
  exportedAt: string;
  exportedBy?: string;
  productAdminUrl?: string;
  productOnlineUrl?: string;
}

/**
 * Store inventory — buyback singles (legacy) or TCGplayer CSV imports.
 * Buyback rows include orderId/cardId; imports use tcgplayerListingKey + quantity.
 */
export interface InventoryItem {
  id: string;
  storeId: string;
  /** buyback when unset (legacy). */
  source?: InventorySource;
  orderId?: string;
  orderNumber?: string;
  cardId?: string;
  displayName: string;
  category?: CardCategory;
  setName?: string;
  cardNumber?: string;
  playerName?: string;
  condition?: ConditionEstimate;
  itemType?: ItemType;
  slabCompany?: string;
  slabGrade?: string;
  frontImageUrl?: string;
  marketPrice?: number;
  purchaseType?: "cash" | "trade";
  purchasePrice?: number;
  acquiredAt: string;
  transactionId?: string;
  /** TCGplayer catalog product id — upsert key component. */
  tcgplayerProductId?: string;
  /** Normalized condition string from TCGplayer export. */
  tcgplayerCondition?: string;
  /** Stable upsert key: productId + condition. */
  tcgplayerListingKey?: string;
  productLine?: string;
  productName?: string;
  title?: string;
  rarity?: string;
  /** Sellable units — for TCGplayer imports, mirrors Total Quantity (`quantityOnHand`). */
  quantity?: number;
  /** Total inventory from TCGplayer CSV Total Quantity column. */
  quantityOnHand?: number;
  /** Application-held units (store reservations / holds) — subtracted from available. */
  quantityReserved?: number;
  /** Units committed to open orders — subtracted from available. */
  quantityCommitted?: number;
  /** Units flagged damaged and not sellable — subtracted from available. */
  quantityDamaged?: number;
  /** Customer-facing sellable units (derived or explicit). */
  quantityAvailable?: number;
  /** TCGplayer My Store Reserve Qty from CSV — reporting only, NOT an application hold. */
  tcgplayerReportedReserve?: number;
  /** Store list price from TCGplayer (My Store Price). */
  listPrice?: number;
  tcgMarketPrice?: number;
  /** TCGplayer lowest listing for this row's condition (same basis as scan offers). */
  tcgLowPrice?: number;
  tcgLowPriceAt?: string;
  lastTcgplayerImportAt?: string;
  /** Stable upsert key for Shopify variant GID. */
  shopifyVariantKey?: string;
  lastShopifyImportAt?: string;
  /** When product image was copied to Firebase Storage. */
  imageCachedAt?: string;
  /** Set when CDN + fallbacks could not resolve an image (skip re-try). */
  imageCacheFailedAt?: string;
  /** Defaults to on_hand when unset (legacy records). */
  status?: InventoryStatus;
  /** When the card was listed on a sales channel. */
  listedAt?: string;
  /** Active Shopify listing for this inventory unit. */
  shopifyListing?: InventoryShopifyListing;
  /** When the card sold. */
  soldAt?: string;
  soldChannel?: InventorySalesChannel;
  soldPrice?: number;
  /** External order reference (e.g. Shopify order id). */
  soldOrderId?: string;
  soldLineItemId?: string;
  /** Denormalized Scryfall catalog — golden-table dimensions for browse/clerk. */
  catalogScryfallId?: string;
  catalogOracleId?: string;
  catalogColorIdentity?: string[];
  catalogColors?: string[];
  catalogTypeLine?: string;
  catalogCommanderFormatLegal?: boolean;
  catalogCanBeSoleCommander?: boolean;
  catalogManaCost?: string;
  catalogCmc?: number;
  catalogOracleText?: string;
  catalogKeywords?: string[];
  catalogOracleTags?: string[];
  catalogRarity?: string;
  catalogSetCode?: string;
  catalogSyncedAt?: string;
  catalogMatchMethod?: "tcgplayer_id" | "set_search" | "name_search" | "name_fuzzy" | "manual" | "skipped" | "unresolved";
  /** Terminal identity outcome from review or enrichment. */
  catalogLinkOutcome?:
    | "confirmed_printing"
    | "confirmed_oracle_only"
    | "token_product"
    | "composite_product"
    | "non_card_product"
    | "identity_conflict"
    | "unresolved";
  /** Composite / token product modeling when a single printing ID is insufficient. */
  compositeInventoryIdentity?: {
    listingId: string;
    componentPrintingIds: string[];
    componentOracleIds: string[];
    productIdentityType: "double_sided_token" | "paired_card_product" | "composite";
  };
  /** Append-only audit trail for identity review decisions. */
  catalogIdentityDecisions?: Array<{
    previousOracleId?: string;
    previousScryfallId?: string;
    selectedOracleId?: string;
    selectedScryfallId?: string;
    outcome:
      | "confirmed_printing"
      | "confirmed_oracle_only"
      | "token_product"
      | "composite_product"
      | "non_card_product"
      | "identity_conflict"
      | "unresolved";
    decisionMethod: string;
    reviewer: string;
    decidedAt: string;
    supportingEvidence: string[];
  }>;
}

export interface ScannedCard {
  id: string;
  orderId: string;
  frontImageUrl: string;
  backImageUrl: string;
  itemType: ItemType;
  category?: CardCategory;
  detectedName?: string;
  brand?: string;
  setName?: string;
  year?: string;
  cardNumber?: string;
  playerName?: string;
  team?: string;
  variant?: string;
  parallel?: string;
  autograph?: boolean;
  relicPatch?: boolean;
  serialNumbered?: boolean;
  slabCompany?: string;
  slabGrade?: string;
  slabCertNumber?: string;
  conditionEstimate?: ConditionEstimate;
  conditionConfidence?: number;
  /** Store override of pre-grade condition with audit trail. */
  conditionOverride?: ConditionOverride;
  lastStaffEdit?: StaffEditRecord;
  /** Staff yes/no — overrides buyback report default for running total. */
  staffDecision?: StaffCardDecision;
  buyDecision?: BuyDecision;
  visionJson?: Record<string, unknown>;
  pricingJson?: Record<string, unknown>;
  marketPrice?: number;
  cashOffer?: number;
  tradeOffer?: number;
  conditionLadder?: ConditionLadderEntry[];
  status: CardStatus;
  warnings?: string[];
  ruleMatches?: string[];
  resaleAnalysis?: CardResaleAnalysis;
  identityVerification?: CardIdentityVerification;
  conditionReport?: CardConditionReport;
  salesComps?: CardSalesComps;
  /** Observational Card Flow V2 evidence — does not affect offers when enabled. */
  cardFlowV2Evidence?: CardFlowV2EvidenceBundle;
  /** Observational Card Flow V2 identity candidates + lock gate. */
  cardFlowV2Identity?: CardCandidateBundle;
  /** Observational Card Flow V2 shadow market report. */
  cardFlowV2Market?: CardFlowV2MarketBundle;
  /** Observational Card Flow V2 audit vs production pricing — does not change offers. */
  cardFlowV2Audit?: CardFlowV2AuditRecord;
  /** Directive 006 — shadow offer preview; never updates production offer fields. */
  cardFlowV2OfferPreview?: import("./card-flow-v2/offer/types").V2OfferPreview;
  /** Directive 006M — policy version metadata for all V2 bundles on this card. */
  cardFlowV2VersionMetadata?: import("./card-flow-v2/version-metadata").CardFlowV2VersionMetadata;
  /** Directive 006Q — staff-reviewed manual market comps (human-reviewed only). */
  cardFlowV2ManualComps?: import("./card-flow-v2/market/manual-market-comp").ManualMarketComp[];
  /** Directive 008 — per-card processing timings. */
  processingTimings?: CardProcessingTimings;
  processingAttemptId?: string;
  lastCompletedStep?: string;
  /** Directive 012 — Shopify product export state */
  shopifyExport?: import("./shopify/types").ShopifyCardExport;
  createdAt: string;
}

export type IdentityVerdict = "confirmed" | "likely" | "mismatch" | "inconclusive";

export interface CardIdentityVerification {
  verdict: IdentityVerdict;
  matchScore: number;
  referenceImageUrl?: string;
  referenceSource?: string;
  sameArtwork: boolean;
  sameSetAndNumber: boolean;
  summary: string;
  notes?: string[];
  verifiedAt: string;
  model?: string;
  /** How many catalog candidates were compared during recovery. */
  candidatesChecked?: number;
  /** True when identity was corrected to a different catalog printing. */
  correctedMatch?: boolean;
}

export interface CardConditionReport {
  centering: number;
  corners: number;
  edges: number;
  surface: number;
  estimatedGrade: string;
  gradeRange?: string;
  centeringCap?: number;
  compositeScore?: number;
  /** True when the card is a certified slab — OpenCV subgrades are not used. */
  slabCertified?: boolean;
  certifiedSlabCompany?: string;
  certifiedSlabGrade?: string;
  frontCentering?: { leftRight: string; topBottom: string };
  backCentering?: { leftRight: string; topBottom: string };
  disclaimer: string;
  gradedAt: string;
  serviceAvailable: boolean;
  raw?: Record<string, unknown>;
}

export interface SoldComp {
  price: number;
  date?: string;
  source: string;
  condition?: string;
  title?: string;
}

export interface CardSalesComps {
  recentSales: SoldComp[];
  trend: "rising" | "falling" | "stable" | "unknown";
  trendNote?: string;
  avgRecentSale?: number;
  dataSource: string;
  compConfidence?: "high" | "medium" | "low";
  compMethod?: "trimmed_mean" | "median" | "single_tier" | "catalog_tier";
  fetchedAt: string;
}

export type ResaleSentiment = "bullish" | "bearish" | "neutral";
export type SalesFrequency = "high" | "medium" | "low" | "unknown";
export type ResaleRecommendation = "buy" | "pass" | "review" | "negotiate";

export interface CardResaleAnalysis {
  sentiment: ResaleSentiment;
  salesFrequency: SalesFrequency;
  /** Estimated recent market clearing price in USD (from available price tiers). */
  latestSaleEstimate?: number;
  latestSaleNote?: string;
  /** Agent-recommended cash buy price (final authority). */
  suggestedCashOffer?: number;
  suggestedTradeOffer?: number;
  /** @deprecated Use suggestedCashOffer */
  maxBuyPrice?: number;
  targetResalePrice?: number;
  estimatedMarginPercent?: number;
  recommendation: ResaleRecommendation;
  summary: string;
  /** Why the agent chose suggestedCashOffer. */
  priceRationale?: string;
  liquidityNotes?: string;
  risks: string[];
  opportunities: string[];
  confidence: number;
  analyzedAt: string;
  model?: string;
  /** Snapshot passed to the model for transparency. */
  marketSnapshot?: MarketSnapshot;
}

export interface MarketSnapshot {
  cardName: string;
  setName?: string;
  cardNumber?: string;
  category?: string;
  rarity?: string;
  condition?: ConditionEstimate;
  setReleaseDate?: string;
  listedMarketPrice?: number;
  cashOffer?: number;
  tradeOffer?: number;
  priceSource?: string;
  priceEstimated?: boolean;
  tcgplayer?: Record<string, { low?: number; mid?: number; market?: number; high?: number }>;
  cardmarket?: Record<string, number>;
  liquidityScore?: number;
  priceSpreadPercent?: number;
  dataNotes?: string[];
}

export interface ConditionLadderEntry {
  condition: ConditionEstimate;
  label: string;
  multiplier: number;
  marketValue: number;
  cashOffer: number;
  tradeOffer: number;
  isEstimated?: boolean;
}

export interface StoreRule {
  id: string;
  storeId?: string;
  title: string;
  active: boolean;
  priority: number;
  appliesToCategories: CardCategory[];
  ruleType: RuleType;
  ruleText: string;
  structuredFilters?: Record<string, unknown>;
  cashPercentOverride?: number;
  tradePercentOverride?: number;
  ownerNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  /** URL slug for customer QR /s/{storeSlug} links */
  storeSlug: string;
  /** Logo shown on customer and admin pages (Storage URL or inline data URL) */
  storeLogoUrl?: string;
  ownerEmail: string;
  /** Primary contact name (public signup) */
  ownerName?: string;
  phone?: string;
  address?: string;
  website?: string;
  defaultCashPercent: number;
  defaultTradePercent: number;
  slabCashPercent: number;
  slabTradePercent: number;
  manualReviewThreshold: number;
  minimumOffer: number;
  conditionMultipliers: Record<ConditionEstimate, number>;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  /** Allow guest checkout on /s/[slug] (Directive 013) */
  customerGuestModeEnabled?: boolean;
  customerEmailVerificationMode?: CustomerEmailVerificationMode;
  /** SaaS billing — undefined for legacy stores provisioned before Stripe */
  subscription?: StoreSubscription;
  /** Directive 012 — Shopify catalog export integration */
  shopifyIntegration?: import("./shopify/types").ShopifyIntegration;
  /** Public events calendar — /s/{slug}/calendar and Shopify embed */
  calendarSettings?: import("./store-calendar/types").CalendarSettings;
}

export type StoreSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface StoreSubscription {
  provider: "stripe";
  status: StoreSubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  updatedAt: string;
}

export type AdminRole = "platform" | "store";

export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  /** Set for store owners — the store they manage */
  storeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSession {
  userId: string;
  email: string;
  role: AdminRole;
  /** Fixed store for store-role users */
  storeId?: string;
  /** Platform admin: currently selected store dashboard */
  activeStoreId?: string;
}

export interface VisionResult {
  category: CardCategory;
  itemType: ItemType;
  cardName: string;
  brand?: string;
  setName?: string;
  setCode?: string;
  year?: string;
  cardNumber?: string;
  playerName?: string;
  team?: string;
  variant?: string;
  /** Card language when known (e.g. jp, en) — used for Japanese catalog routing. */
  language?: string;
  parallel?: string;
  autograph?: boolean;
  relicPatch?: boolean;
  serialNumbered?: boolean;
  slabCompany?: string;
  slabGrade?: string;
  slabCertNumber?: string;
  conditionEstimate: ConditionEstimate;
  visibleDamage?: string;
  confidence: number;
  /** Printing rarity when known (from catalog / staff confirmation). */
  rarity?: string;
  /** Agent-generated marketplace queries (sports enrichment). */
  agentSearchQueries?: string[];
  /** AI vision market estimate from photo analysis (secondary to API comps). */
  visionPriceEstimate?: VisionPriceEstimate;
}

export interface VisionPriceEstimate {
  marketPrice: number;
  rangeLow?: number;
  rangeHigh?: number;
  confidence: number;
  rationale?: string;
  conditionNote?: string;
}

export interface PricingResult {
  marketPrice: number;
  source: string;
  sourceUrl?: string;
  raw?: Record<string, unknown>;
  /** True when price is a placeholder, not from a live provider lookup. */
  estimated?: boolean;
  matchQuery?: string;
  /** Individual comps used to derive marketPrice. */
  comps?: SoldComp[];
  compsExcluded?: SoldComp[];
  compMethod?: "trimmed_mean" | "median" | "single_tier" | "catalog_tier";
  compCount?: number;
  compConfidence?: "high" | "medium" | "low";
  /** When comps come from multiple providers (catalog + PriceCharting + eBay). */
  sources?: string[];
}

export interface RuleEngineResult {
  doNotBuy: boolean;
  manualReview: boolean;
  cashPercentOverride?: number;
  tradePercentOverride?: number;
  matchedRules: string[];
  notes: string[];
}

export type FeedbackStatus = "new" | "reviewed";

/** Store-submitted card report feedback for platform review. */
export interface CardFeedback {
  id: string;
  storeId: string;
  storeName?: string;
  orderId: string;
  orderNumber?: string;
  cardId: string;
  cardDisplayName: string;
  message: string;
  submittedByEmail: string;
  submittedByRole: AdminRole;
  createdAt: string;
  status: FeedbackStatus;
  cardSnapshot: {
    category?: CardCategory;
    setName?: string;
    cardNumber?: string;
    marketPrice?: number;
    cashOffer?: number;
    tradeOffer?: number;
    warnings?: string[];
    staffDecision?: StaffCardDecision;
    cardStatus?: CardStatus;
    frontImageUrl?: string;
    resaleAnalysis?: CardResaleAnalysis;
    identityVerification?: CardIdentityVerification;
    conditionReport?: CardConditionReport;
    salesComps?: CardSalesComps;
  };
}
