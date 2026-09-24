export type PriceChartingProductCurrent = {
  priceChartingProductId: string;
  productName: string;
  consoleName?: string;
  genre?: string;
  upc?: string;
  epid?: string;
  asin?: string;
  releaseDate?: string;
  loosePrice?: number;
  cibPrice?: number;
  newPrice?: number;
  gradedPrice?: number;
  boxOnlyPrice?: number;
  manualOnlyPrice?: number;
  bgs10Price?: number;
  cgc10Price?: number;
  sgc10Price?: number;
  retailLooseBuy?: number;
  retailLooseSell?: number;
  retailNewBuy?: number;
  retailNewSell?: number;
  salesVolume?: number;
  importedAt: string;
  importRunId: string;
  rawRow: Record<string, unknown>;
  /** Inferred category from console/genre. */
  category?: CardPriceSnapshotCategory;
  /** Whether exact identity was resolved for snapshot eligibility. */
  exactIdentityMatch?: boolean;
  identityKey?: string;
  rejectedReason?: string;
  identityMatchReason?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  finish?: string;
  treatment?: string;
  cardName?: string;
  /** The List printing metadata. */
  printingSet?: string;
  originSet?: string;
  originCollectorNumber?: string;
};

export type CardPriceSnapshotCategory =
  | "mtg"
  | "pokemon"
  | "yugioh"
  | "sports"
  | "riftbound"
  | "onepiece"
  | "lorcana"
  | "unknown";

export type CardPriceSnapshot = {
  id: string;
  source: "pricecharting";
  capturedDate: string;
  capturedAt: string;
  importRunId: string;
  identityKey: string;
  sourceIdentityKey: string;
  category: CardPriceSnapshotCategory;
  priceChartingProductId: string;
  productName: string;
  consoleName?: string;
  genre?: string;
  cardName?: string;
  setName?: string;
  setCode?: string;
  collectorNumber?: string;
  finish?: string;
  treatment?: string;
  variant?: string;
  language?: string;
  /** The List printing metadata — keeps PLST separate from origin printing. */
  printingSet?: string;
  originSet?: string;
  originCollectorNumber?: string;
  rawUngraded?: number;
  grade8?: number;
  grade9?: number;
  grade95?: number;
  psa10?: number;
  bgs10?: number;
  cgc10?: number;
  sgc10?: number;
  retailBuy?: number;
  retailSell?: number;
  salesVolume?: number;
  currency: "USD";
  exactIdentityMatch: boolean;
  identityMatchReason?: string;
  rejectedReason?: string;
  rawSourceRow: Record<string, unknown>;
};

export type PriceChartingImportRun = {
  id: string;
  source: "pricecharting_csv";
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed";
  fileName?: string;
  capturedDate: string;
  rowsRead: number;
  /** Snapshots written (exact identity only). */
  rowsImported: number;
  /** All catalog products upserted (including unresolved identity). */
  rowsCataloged?: number;
  rowsSkipped: number;
  rowsRejected: number;
  identityRiskCount: number;
  errors: string[];
  /** Category filter used for this import run (mtg, pokemon, …). */
  importCategory?: string;
};

export type PriceChartingDailyReport = {
  date: string;
  jobExecutionId?: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed" | "warning";
  firestoreReportId?: string;
  downloads: Array<{ fileName: string; bytes: number; gcsPath?: string; path?: string }>;
  imports: Array<{
    category: string;
    fileName?: string;
    importRunId: string;
    skippedAlreadyImported?: boolean;
    rowsRead: number;
    rowsCataloged?: number;
    rowsImported: number;
    rowsRejected: number;
    identityRiskCount?: number;
    snapshotsWritten?: number;
    snapshotsDeduped?: number;
  }>;
  warehouse: {
    snapshotCountByCategory: Record<string, number>;
    productsCurrentTotal: number;
    snapshotsForDate?: number;
  };
  sampleChecks: Array<{
    label: string;
    identityKey?: string;
    pass: boolean;
    snapshotCount: number;
    pointCount?: number;
    currentValue?: number;
    capturedDate?: string;
    note?: string;
  }>;
  warnings: string[];
  errors: string[];
  archive?: {
    bucket: string;
    rawPrefix: string;
    rawPaths: string[];
    reportPath: string;
  };
};

export type CardPriceHistorySeries = {
  source: "pricecharting";
  label: string;
  points: { date: string; value: number; volume?: number }[];
};

export type CardPriceHistoryResponse = {
  identityKey: string;
  requestedIdentityKey?: string;
  lookupKeys?: string[];
  matchedKeys?: string[];
  emptyReason?: string;
  cardName?: string;
  currentEstimate?: number;
  retailBuy?: number;
  retailSell?: number;
  series: CardPriceHistorySeries[];
  trend: {
    sevenDayChangePct?: number;
    thirtyDayChangePct?: number;
    ninetyDayChangePct?: number;
    sampleCount: number;
    volatility?: "low" | "medium" | "high";
    marketTone?: "highly_up" | "up" | "down" | "highly_down";
    latestSalesVolume?: number;
    monthlySales?: {
      kind: "estimated_sales" | "reported_volume";
      buckets: { month: string; label: string; sales: number }[];
    };
  };
  lastUpdated?: string;
  sourceNote: string;
  reason?: string;
};
