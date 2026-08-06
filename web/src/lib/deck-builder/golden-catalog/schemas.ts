/**
 * Golden catalog schemas — source-of-truth entity layer for MTG RAG and clerk.
 *
 * Firestore collection mapping:
 *   catalogOracleCards  → GoldenCatalogOracleCard (every functional Magic card)
 *   catalogCards        → CatalogPrinting (alias: catalogPrintings — every printing)
 *   inventory           → store listings (future: inventoryListings)
 *
 * The golden table is NOT the RAG. It is the canonical card universe that RAG joins to.
 */

import type { CommanderClassification } from "../commander-classification";
import type { CatalogCard, CatalogOracleCard, CommanderEligibility } from "../types";

/** Firestore alias: catalogPrintings === catalogCards */
export const CATALOG_PRINTINGS_COLLECTION = "catalogCards" as const;

export type OracleTagStatus =
  | "tagged"
  | "no_tags_in_source"
  | "join_failed"
  | "not_processed";

export interface CardFace {
  name?: string;
  manaCost?: string;
  typeLine?: string;
  oracleText?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
}

export interface CardLegalities {
  standard?: string;
  pioneer?: string;
  modern?: string;
  legacy?: string;
  vintage?: string;
  commander?: string;
  pauper?: string;
  historic?: string;
  alchemy?: string;
  brawl?: string;
  [format: string]: string | undefined;
}

export interface ReleaseInformation {
  releasedAt?: string;
  setCode?: string;
  setName?: string;
}

export interface GoldenCatalogEvidence {
  source: "scryfall_bulk" | "oracle_tags" | "derived" | "manual";
  bulkUpdatedAt?: string;
  profileVersion?: string;
}

/** Complete oracle golden record — superset of CatalogOracleCard. */
export interface GoldenCatalogOracleCard {
  id: string;
  oracleId: string;
  canonicalName: string;
  normalizedName: string;
  layout?: string;
  cardFaces?: CardFace[];
  manaCost?: string;
  manaValue: number;
  /** Legacy alias for clerk paths expecting CatalogOracleCard.cmc */
  cmc: number;
  colors: string[];
  colorIdentity: string[];
  typeLine: string;
  supertypes: string[];
  types: string[];
  subtypes: string[];
  oracleText?: string;
  keywords: string[];
  producedMana?: string[];
  legalities: CardLegalities;
  commanderClassification: CommanderClassification;
  commanderEligibility: CommanderEligibility;
  commanderEligibilityVersion: string;
  games?: string[];
  reserved?: boolean;
  releaseInformation?: ReleaseInformation;
  /** Derived functional dimensions (populated incrementally) */
  functionalRoles?: string[];
  tribalTags?: string[];
  archetypeTags?: string[];
  exileInteractions?: string[];
  graveyardInteractions?: string[];
  tokenInteractions?: string[];
  sacrificeInteractions?: string[];
  enablerRoles?: string[];
  payoffRoles?: string[];
  comboRoles?: string[];
  /** Scryfall Tagger slugs */
  oracleTags: string[];
  oracleTagStatus?: OracleTagStatus;
  tagDerivedProfileV0?: CatalogOracleCard["tagDerivedProfileV0"];
  /** Learned representations — populated by later enrichment jobs */
  semanticEmbedding?: number[];
  functionalEmbedding?: number[];
  profileVersion?: string;
  embeddingVersion?: string;
  evidence?: GoldenCatalogEvidence;
  confidence?: number;
  printingIds: string[];
  sourceVersion: string;
  updatedAt: string;
}

/** Complete printing golden record — superset of CatalogCard. */
export interface CatalogPrinting {
  scryfallId: string;
  oracleId: string;
  name: string;
  normalizedName: string;
  setCode: string;
  setName?: string;
  collectorNumber: string;
  language?: string;
  finishes?: string[];
  rarity?: string;
  releasedAt?: string;
  images?: {
    small?: string;
    normal?: string;
    large?: string;
    artCrop?: string;
  };
  tcgplayerId?: string;
  cardmarketId?: string;
  foil?: boolean;
  nonfoil?: boolean;
  promo?: boolean;
  digital?: boolean;
  games?: string[];
  commanderFormatLegal: boolean;
  colorIdentity: string[];
  colors?: string[];
  typeLine: string;
  oracleText?: string;
  manaCost?: string;
  cmc: number;
  keywords?: string[];
  catalogStatus?: "current" | "stale" | "removed" | "review_required";
  lastSeenBulkVersion?: string;
  missingFromCurrentBulkAt?: string;
  sourceVersion: string;
  updatedAt: string;
}

/** Future: thin store listing layer (inventory today is hybrid). */
export interface InventoryListingGolden {
  listingId: string;
  storeId: string;
  oracleId?: string;
  scryfallId?: string;
  condition?: string;
  finish?: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityCommitted: number;
  quantityAvailable: number;
  listPrice?: number;
  tcgLowPrice?: number;
  source?: string;
  updatedAt: string;
}

/** Versioned EDHREC / deck statistics row. */
export interface CardCommanderStats {
  id: string;
  commanderOracleId: string;
  cardOracleId: string;
  format: string;
  archetype?: string;
  category?: string;
  theme?: string;
  snapshotDate: string;
  numDecks: number;
  potentialDecks: number;
  inclusionPercentage: number;
  synergyScore?: number;
}

/** Sourced strategy claim — separate from canonical card facts. */
export interface StrategyClaim {
  id: string;
  cardOracleIds: string[];
  commanderOracleIds?: string[];
  archetypes?: string[];
  claimType: string;
  claimText: string;
  sourceId: string;
  timestamp: string;
  confidence: number;
  publishedAt?: string;
}

/** Card relationship edge for graph expansion. */
export interface CardRelationship {
  id: string;
  sourceOracleId: string;
  targetOracleId: string;
  commanderOracleId?: string;
  archetype?: string;
  format?: string;
  relationshipTypes: string[];
  rulesInteractionScore?: number;
  cooccurrenceLift?: number;
  functionalComplementarity?: number;
  comboEvidence?: string[];
  expertEvidence?: string[];
  overallScore?: number;
  evidenceIds?: string[];
  version: string;
  updatedAt: string;
}

/** Official ruling linked to oracle ID. */
export interface CardRuling {
  id: string;
  oracleId: string;
  publishedAt: string;
  rulingText: string;
  source: string;
}

export type BulkDatasetType =
  | "oracle_cards"
  | "default_cards"
  | "oracle_tags"
  | "rulings";

export interface BulkDatasetMetadata {
  type: BulkDatasetType;
  scryfallId: string;
  name: string;
  updatedAt: string;
  downloadUri: string;
  compressedSizeBytes: number;
}

export interface BulkImportDatasetReport {
  dataset: BulkDatasetType;
  bulkUpdatedAt: string;
  contentHash?: string;
  cachePath?: string;
  sourceRowCount: number;
  importedCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  skipped: boolean;
  skipReason?: string;
}

export interface BulkImportRun {
  id: string;
  status: "running" | "completed" | "failed" | "partial";
  startedAt: string;
  completedAt?: string;
  datasets: BulkImportDatasetReport[];
  message?: string;
}

export interface GoldenCatalogSyncState {
  id: "global";
  oracleCardsBulkUpdatedAt?: string;
  defaultCardsBulkUpdatedAt?: string;
  oracleTagsBulkUpdatedAt?: string;
  oracleCardsContentHash?: string;
  defaultCardsContentHash?: string;
  oracleTagsContentHash?: string;
  catalogOracleCardCount?: number;
  catalogPrintingCount?: number;
  lastFullImportAt?: string;
  lastFullImportRunId?: string;
  profileVersion?: string;
  updatedAt: string;
}

export interface GoldenCatalogAuditReport {
  generatedAt: string;
  firestoreAvailable: boolean;
  counts: {
    catalogOracleCards: number;
    catalogPrintings: number;
    catalogCrosswalk: number;
    inventoryMagicListings: number;
    inventoryWithOracleId: number;
    inventoryWithScryfallId: number;
    oracleCardsNotInInventory: number;
  };
  bulkExpected: {
    oracleCards?: number;
    defaultCardsPaper?: number;
    oracleTagsEntries?: number;
  };
  coverage: {
    oracleCardPct: number;
    oracleCardFormula?: string;
    printingPct: number;
    printingFormula?: string;
    oracleTagPct: number;
    oracleTagFormula?: string;
    inventoryOracleLinkPct: number;
    inventoryOracleLinkFormula?: string;
    inventoryPrintingLinkPct: number;
    inventoryPrintingLinkFormula?: string;
  };
  syncState: GoldenCatalogSyncState | null;
  lastImportRun: BulkImportRun | null;
  bulkMetadata: BulkDatasetMetadata[];
  samples: {
    oracleCard?: GoldenCatalogOracleCard;
    printing?: CatalogPrinting;
    inventoryListing?: InventoryListingGolden;
  };
  storageEstimate: {
    oracleDocs: number;
    printingDocs: number;
    estimatedOracleBytes: number;
    estimatedPrintingBytes: number;
    estimatedTotalMb: number;
    estimatedWriteOpsFullImport: number;
  };
  gaps: string[];
}

/** Convert golden oracle → legacy CatalogOracleCard for existing clerk paths. */
export function toCatalogOracleCard(
  golden: GoldenCatalogOracleCard,
): CatalogOracleCard {
  return {
    id: golden.oracleId,
    canonicalName: golden.canonicalName,
    oracleText: golden.oracleText,
    manaCost: golden.manaCost,
    cmc: golden.cmc ?? golden.manaValue,
    typeLine: golden.typeLine,
    colorIdentity: golden.colorIdentity,
    colors: golden.colors,
    keywords: golden.keywords,
    oracleTags: golden.oracleTags,
    commanderEligibility: golden.commanderEligibility,
    commanderClassification: golden.commanderClassification,
    commanderEligibilityVersion: golden.commanderEligibilityVersion,
    tagDerivedProfileV0: golden.tagDerivedProfileV0,
    printingIds: golden.printingIds,
    sourceVersion: golden.sourceVersion,
    updatedAt: golden.updatedAt,
  };
}

/** Convert golden printing → legacy CatalogCard for existing clerk paths. */
export function toCatalogCard(printing: CatalogPrinting): CatalogCard {
  return {
    id: printing.scryfallId,
    oracleId: printing.oracleId,
    name: printing.name,
    set: printing.setCode,
    setName: printing.setName,
    collectorNumber: printing.collectorNumber,
    manaCost: printing.manaCost,
    cmc: printing.cmc,
    typeLine: printing.typeLine,
    oracleText: printing.oracleText,
    keywords: printing.keywords,
    colors: printing.colors,
    colorIdentity: printing.colorIdentity,
    rarity: printing.rarity,
    commanderFormatLegal: printing.commanderFormatLegal,
    isCommander: false,
    imageNormal: printing.images?.normal,
    imageArtCrop: printing.images?.artCrop,
    tcgplayerId: printing.tcgplayerId,
    updatedAt: printing.updatedAt,
  };
}
