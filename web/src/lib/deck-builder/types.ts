import type { CommanderClassification } from "./commander-classification";

/** Canonical MTG card from Scryfall — keyed by Scryfall UUID (printing level). */
export interface CatalogCard {
  id: string;
  oracleId?: string;
  name: string;
  set: string;
  setName?: string;
  collectorNumber: string;
  manaCost?: string;
  cmc: number;
  typeLine: string;
  oracleText?: string;
  keywords?: string[];
  colors?: string[];
  colorIdentity: string[];
  rarity?: string;
  /** Legal to include in a Commander-format deck (NOT legal as commander). */
  commanderFormatLegal?: boolean;
  /** Whether this printing can occupy the command zone — always derive from oracle doc. */
  isCommander: boolean;
  /** Lifecycle status for golden-catalog printings. Customer queries use `current` only. */
  catalogStatus?: "current" | "stale" | "removed" | "review_required";
  lastSeenBulkVersion?: string;
  missingFromCurrentBulkAt?: string;
  /** Scryfall format legalities when available on printing records. */
  legalities?: Record<string, string | undefined>;
  imageNormal?: string;
  imageArtCrop?: string;
  tcgplayerId?: string;
  edhrecRank?: number;
  gameChanger?: boolean;
  scryfallUri?: string;
  updatedAt: string;
}

export type CommanderEligibilityBasis =
  | "legendary_creature"
  | "card_text_allows_commander"
  | "background"
  | "doctor_companion"
  | "partner_variant"
  | "not_eligible";

/** Oracle-level commander eligibility — canonical for clerk/deck builder. */
export interface CommanderEligibility {
  eligible: boolean;
  basis: CommanderEligibilityBasis;
  commanderColorIdentity: string[];
  partnerRestrictions?: string[];
  reason: string;
  sourceVersion: string;
}

/** Canonical Magic oracle card — keyed by Scryfall oracle_id. */
export interface CatalogOracleCard {
  id: string;
  canonicalName: string;
  oracleText?: string;
  manaCost?: string;
  cmc: number;
  typeLine: string;
  colorIdentity: string[];
  colors?: string[];
  keywords: string[];
  oracleTags: string[];
  legalities?: Record<string, string | undefined>;
  commanderClassification?: CommanderClassification;
  commanderEligibility: CommanderEligibility;
  commanderEligibilityVersion?: string;
  /**
   * Tag-derived functional profile v0 — not the finished functional system.
   * Expand later with oracle-text parsing and explicit action structures.
   */
  tagDerivedProfileV0?: TagDerivedProfileV0;
  /** @deprecated Use tagDerivedProfileV0 */
  functionalProfile?: Record<string, FunctionalRoleScore>;
  /** Linked Scryfall printing UUIDs (catalogCards / catalogPrintings). */
  printingIds: string[];
  sourceVersion: string;
  updatedAt: string;
}

export interface FunctionalRoleScore {
  score: number;
  confidence: number;
  derivationMethod: "oracle_tags" | "keywords" | "deterministic" | "llm" | "manual";
  evidence: string[];
}

/** Tag-derived functional profile v0 — oracle tags/keywords only. */
export interface TagDerivedProfileV0 {
  profileVersion: "tag-derived-v0";
  roles: Record<string, FunctionalRoleScore>;
}

/** Global catalog + inventory version metadata for clerk answers (P1 §19). */
export interface CatalogSyncState {
  id: "global";
  scryfallBulkVersion?: string;
  oracleProfileVersion?: string;
  catalogPrintingCount?: number;
  catalogOracleCardCount?: number;
  lastOracleCardSyncAt?: string;
  lastInventoryEnrichAt?: string;
  edhrecSyncVersion?: string;
  lastEdhrecSyncAt?: string;
  ragCorpusVersion?: string;
  relationshipGraphVersion?: string;
  /** Golden catalog bulk sync (Scryfall oracle_cards / default_cards / oracle_tags). */
  oracleCardsBulkUpdatedAt?: string;
  defaultCardsBulkUpdatedAt?: string;
  oracleTagsBulkUpdatedAt?: string;
  oracleCardsContentHash?: string;
  defaultCardsContentHash?: string;
  oracleTagsContentHash?: string;
  lastFullImportAt?: string;
  lastFullImportRunId?: string;
  updatedAt: string;
}

export interface ClerkDataVersions {
  scryfallBulkVersion?: string;
  oracleProfileVersion?: string;
  catalogOracleCardCount?: number;
  edhrecSyncVersion?: string;
  ragCorpusVersion?: string;
  relationshipGraphVersion?: string;
  inventorySnapshotId?: string;
  inventoryCheckedAt: string;
}

/** Per-card EDHREC recommendation row. */
export interface EdhrecCardRecommendation {
  scryfallId: string;
  name: string;
  slug: string;
  category: string;
  categoryTag: string;
  synergy: number;
  inclusion: number;
  numDecks: number;
  potentialDecks: number;
}

export interface EdhrecThemeLink {
  slug: string;
  label: string;
  count: number;
}

export interface EdhrecCommanderMeta {
  id: string;
  commanderSlug: string;
  themeSlug?: string;
  commanderName: string;
  scryfallId?: string;
  rank?: number;
  numDecks?: number;
  colorIdentity: string[];
  salt?: number;
  bracketCounts?: Record<string, number>;
  budgetCounts?: Record<string, number>;
  tagCounts?: Record<string, number>;
  themes: EdhrecThemeLink[];
  recommendations: EdhrecCardRecommendation[];
  similarCommanders: string[];
  manaCurve?: Record<string, number>;
  syncedAt: string;
}

export interface CardCrosswalk {
  id: string;
  storeId: string;
  inventoryItemId: string;
  tcgplayerProductId?: string;
  scryfallId: string;
  matchMethod: "tcgplayer_id" | "name_set" | "manual";
  updatedAt: string;
}

export interface StoreDeckCard {
  scryfallId: string;
  qty: number;
  board: "main" | "commander";
}

export interface StoreDeck {
  id: string;
  storeId: string;
  customerId?: string;
  shareToken?: string;
  name?: string;
  game: "magic";
  format: "commander";
  commanderScryfallId: string;
  commanderSlug?: string;
  commanderName?: string;
  themeSlug?: string;
  targetBracket?: 1 | 2 | 3 | 4 | 5;
  cards: StoreDeckCard[];
  createdAt: string;
  updatedAt: string;
}

export interface EdhrecSyncRun {
  id: string;
  storeId?: string;
  type: "commanders" | "themes" | "crosswalk" | "scryfall_cards";
  status: "running" | "completed" | "failed";
  processed: number;
  total: number;
  message?: string;
  startedAt: string;
  completedAt?: string;
}

/** Enriched inventory row for deck builder UI. */
export interface DeckBuilderInventoryCard {
  inventoryItemId: string;
  scryfallId: string;
  name: string;
  imageUrl?: string;
  qty: number;
  listPrice?: number;
  tcgLowPrice?: number;
  synergy?: number;
  inclusion?: number;
  category?: string;
  colorIdentity: string[];
  cmc: number;
  typeLine: string;
}

export interface DeckValidationIssue {
  code: string;
  message: string;
  scryfallId?: string;
}

export interface DeckValidationResult {
  valid: boolean;
  issues: DeckValidationIssue[];
  mainCount: number;
  commanderCount: number;
  gameChangerCount: number;
}
