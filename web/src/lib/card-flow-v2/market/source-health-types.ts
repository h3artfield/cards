import type { ConditionEstimate } from "../../types";
import type { MarketSource, CompRejectionReason } from "./types";

export type MarketSourceHealth = {
  source: MarketSource;
  attempted: boolean;
  apiPath?: string;
  query?: string;
  productId?: string;
  catalogId?: string;
  httpStatus?: number;
  rawResultCount: number;
  normalizedResultCount: number;
  acceptedCount: number;
  maybeCount: number;
  rejectedCount: number;
  priceSignalsFound: number;
  fatalError?: string;
  warnings: string[];
  reasonIfSkipped?: string;
};

export type QueryStrategyAudit = {
  source: MarketSource;
  query: string;
  purpose: string;
  rawResults: number;
  accepted: number;
  maybe: number;
  rejected: number;
  topRejectionReasons: CompRejectionReason[];
  httpStatus?: number;
  fatalError?: string;
};

export type TcgplayerMappingAudit = {
  attempted: boolean;
  productId?: string;
  /** Canonical TCGplayer product page from catalog API (preferred for staff links). */
  productUrl?: string;
  groupId?: string;
  subtype?: string;
  finishRequested?: string;
  finishMatched?: string;
  priceVariantCount?: number;
  availableVariantNames: string[];
  selectedVariantName?: string;
  marketPrice?: number;
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  /** Lowest active listing per NM/LP/MP/HP/DMG from TCGplayer listings API. */
  conditionLowPrices?: Partial<Record<ConditionEstimate, number>>;
  /** Listing printing filter used when fetching conditionLowPrices. */
  conditionLowPrinting?: string;
  variantsFound: string[];
  error?: string;
  reasonIfSkipped?: string;
};

export type PriceChartingMappingAudit = {
  attempted: boolean;
  productId?: string;
  productName?: string;
  queryUsed?: string;
  tierSelected?: string;
  tiersExcluded: string[];
  loosePrice?: number;
  gradedPrice?: number;
  gradeSpecificPrice?: number;
  manualOnlyPrice?: number;
  identityMismatch?: {
    expectedSetCode?: string;
    expectedCollectorNumber?: string;
    priceChartingTitle: string;
    parsedCollectorNumber?: string;
    reason: string;
  };
  warnings: string[];
  error?: string;
  reasonIfSkipped?: string;
};

export type PricingSignalDetail = {
  source: MarketSource;
  label: string;
  price: number;
};

export type MarketOutcomeSummary = {
  acceptedSoldComps: number;
  maybeListings: number;
  rejectedListings: number;
  pricingSignals: number;
  /** Human-readable explanation — never just "no accepted comps". */
  summaryLabel: string;
  /** Plain-English staff-facing summary. */
  plainEnglishSummary?: string;
  pricingSignalDetails?: PricingSignalDetail[];
};

export type MarketDataCoverage = {
  acceptedSoldCompsCount: number;
  pricingSignalsCount: number;
  activeOnlyCount: number;
  noMarketDataCount: number;
  ebaySoldAuthFailureCount: number;
  tcgplayerMappedCount: number;
  tcgplayerSkippedCount: number;
  priceChartingSignalCount: number;
};

export type EbayApiDiagnostic = {
  configured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  tokenMintOk: boolean;
  tokenScopeRequested: string;
  tokenScopesGranted?: string;
  soldApiPath: string;
  activeApiPath: string;
  browseWorks: boolean;
  browseStatus?: number;
  insightsWorks: boolean;
  insightsStatus?: number;
  insightsErrorBody?: string;
  /** A–E classification per Directive 005D. */
  insightsConclusion?: "A" | "B" | "C" | "D" | "E";
  notes: string[];
};
