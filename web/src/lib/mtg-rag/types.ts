import type { Timestamp } from "firebase-admin/firestore";

export type MtgKnowledgeSourceType =
  | "curated_glossary"
  | "curated_color_identity"
  | "curated_commander_primer"
  | "official_comprehensive_rules"
  | "community_transcript";

export type MtgKnowledgeAuthorityTier =
  | "live_canonical_data"
  | "official_rules"
  | "curated_internal"
  | "community_education";

export type MtgKnowledgeCorpus =
  | "glossary"
  | "color_identity"
  | "commander_primer"
  | "comprehensive_rules"
  | "youtube_transcript";

export type MtgKnowledgeSourceStatus =
  | "processing"
  | "active"
  | "failed"
  | "superseded";

export type MtgQueryIntent =
  | "inventory_lookup"
  | "price_lookup"
  | "card_identity_oracle"
  | "rules_question"
  | "terminology_question"
  | "color_identity_question"
  | "commander_strategy"
  | "deckbuilding_education"
  | "recommendation"
  | "mixed";

export interface MtgKnowledgeSource {
  sourceId: string;
  title: string;
  sourceType: MtgKnowledgeSourceType;
  authorityTier: MtgKnowledgeAuthorityTier;
  storagePath: string;
  originalFilename: string;
  version?: string;
  effectiveDate?: string;
  creator?: string;
  sourceUrl?: string;
  contentHash: string;
  byteCount: number;
  chunkCount: number;
  status: MtgKnowledgeSourceStatus;
  importedAt: Timestamp;
  updatedAt: Timestamp;
  embeddingModel: string;
  embeddingDimensions: number;
  ingestionVersion: string;
}

export interface MtgKnowledgeChunk {
  chunkId: string;
  sourceId: string;
  corpus: MtgKnowledgeCorpus;
  authorityTier: Exclude<MtgKnowledgeAuthorityTier, "live_canonical_data">;
  title: string;
  sectionTitle?: string;
  sectionPath?: string;
  text: string;
  retrievalText: string;
  aliases?: string[];
  normalizedTerms?: string[];
  keywords?: string[];
  tags?: string[];
  commander?: string;
  colorIdentity?: string[];
  archetypes?: string[];
  ruleNumberStart?: string;
  ruleNumberEnd?: string;
  parentRule?: string;
  transcriptName?: string;
  transcriptTopic?: string;
  citationLabel: string;
  sourceLocator: string;
  /** Populated in Phase 2+ when embeddings are generated. */
  embedding?: unknown;
  embeddingModel: string;
  embeddingDimensions: number;
  tokenCount: number;
  chunkIndex: number;
  chunkHash: string;
  active: boolean;
  importedAt: Timestamp;
}

export interface MtgKnowledgeAlias {
  aliasHash: string;
  alias: string;
  normalizedAlias: string;
  corpus: MtgKnowledgeCorpus;
  chunkId: string;
  sourceId: string;
  active: boolean;
  importedAt: Timestamp;
}

export type MtgKnowledgeIngestionRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface MtgKnowledgeIngestionRun {
  runId: string;
  sourceId: string;
  status: MtgKnowledgeIngestionRunStatus;
  contentHash: string;
  previousContentHash?: string;
  storagePath?: string;
  chunkCount: number;
  aliasCount: number;
  skippedReason?: string;
  errorMessage?: string;
  dryRun: boolean;
  forced: boolean;
  ingestionVersion: string;
  startedAt: Timestamp;
  completedAt?: Timestamp;
}

export interface MtgKnowledgeEvaluation {
  evaluationId: string;
  question: string;
  expectedIntent: MtgQueryIntent[];
  expectedCorpora: MtgKnowledgeCorpus[];
  forbiddenCorpora?: MtgKnowledgeCorpus[];
  expectedEntities?: string[];
  requiresInventory: boolean;
  requiresCardLookup: boolean;
  expectedRuleNumbers?: string[];
  forbiddenClaims?: string[];
  active: boolean;
  importedAt: Timestamp;
}

export interface MtgQueryEntities {
  commanderNames: string[];
  cardNames: string[];
  colorIdentities: string[];
  formats: string[];
  budget?: number;
  inStockOnly?: boolean;
  requestedRuleNumbers?: string[];
}
