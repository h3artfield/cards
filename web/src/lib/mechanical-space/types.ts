export const MECHANICAL_SPACE_VERSION = "phase-rps-mechanical-v1";

export type FeatureSource =
  | "commander_spellbook"
  | "local_curated"
  | "rules_derived"
  | "semantic_predicted";

export type ConcreteInteractionSource =
  | "known_reference"
  | "deterministic_reconstruction"
  | "semantic_candidate";

export type EdgeProvenance = "GROUNDED" | "PREDICTED" | "RULE_DERIVED";

export type IdentityResolutionClass =
  | "EXACT_ID"
  | "EXACT_NAME_UNAMBIGUOUS"
  | "NORMALIZED_NAME_UNAMBIGUOUS"
  | "AMBIGUOUS"
  | "UNRESOLVED";

export type LabelState = "POSITIVE" | "NEGATIVE" | "UNKNOWN";

export type MechanicalRelation =
  | "ENABLES"
  | "PRODUCES"
  | "REQUIRES"
  | "CONSUMES"
  | "REMOVES"
  | "COUNTERS"
  | "DISRUPTS"
  | "INVALIDATES"
  | "PUNISHES"
  | "RESISTS"
  | "PROTECTS_FROM"
  | "OUTRACES"
  | "AMPLIFIES"
  | "DEPENDS_ON";

export const COMPOSITIONAL_RELATIONS = [
  "ENABLES",
  "PRODUCES",
  "REQUIRES",
  "CONSUMES",
  "REMOVES",
] as const satisfies readonly MechanicalRelation[];

export const ADVERSARIAL_RELATIONS = [
  "COUNTERS",
  "DISRUPTS",
  "INVALIDATES",
  "PUNISHES",
  "RESISTS",
  "PROTECTS_FROM",
  "OUTRACES",
  "AMPLIFIES",
  "DEPENDS_ON",
] as const satisfies readonly MechanicalRelation[];

export type MechanicalFeature = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  uncountable?: boolean;
  status?: string;
  source: FeatureSource;
  externalId?: string;
  provenance?: {
    sourceName?: string;
    sourceId?: string;
    sourceVersion?: string;
  };
};

export type OracleCardRef = {
  oracleId: string;
  name: string;
};

export type CardTemplate = {
  id: string;
  name: string;
  scryfallQuery?: string;
  explicitOracleIds?: string[];
  source: string;
  externalId?: string;
};

export type QuantityRef<T extends string = string> = {
  id: T;
  quantity: number;
};

export type InteractionRecipe = {
  id: string;
  name?: string;
  uses: Array<{ oracleId: string; quantity: number }>;
  requiresTemplates: Array<{ templateId: string; quantity: number }>;
  needsFeatures: Array<{ featureId: string; quantity?: number }>;
  producesFeatures: Array<{ featureId: string; quantity?: number }>;
  removesFeatures: Array<{ featureId: string; quantity?: number }>;
  prerequisites?: string[];
  steps?: string[];
  generator?: boolean;
  source: string;
  externalId?: string;
};

export type InteractionProofNode = {
  nodeType: "card" | "feature" | "template" | "recipe";
  id: string;
  name?: string;
  relation?: "provides" | "needs" | "requires" | "produces" | "removes";
  provenance?: EdgeProvenance;
  confidence?: number;
  children?: InteractionProofNode[];
};

export type ConcreteInteraction = {
  id: string;
  recipeId: string;
  cards: Array<{ oracleId: string; quantity: number }>;
  templates: Array<{ templateId: string; quantity: number }>;
  producedFeatures: string[];
  proof: InteractionProofNode[];
  minimal: boolean;
  source: ConcreteInteractionSource;
  minPredictedConfidence?: number;
};

export type OracleSemanticRecordMeta = {
  oracleId: string;
  name: string;
  embeddingDimensions: number;
  embeddingModel: string;
  embeddingVersion?: string;
  oracleText?: string;
  typeLine?: string;
};

export type SemanticOracleSnapshotManifest = {
  artifactType: "SemanticOracleSnapshot";
  version: string;
  createdAt: string;
  cardCount: number;
  vectorCount: number;
  dimensions: number;
  model: string;
  embeddingVersion: string;
  parserVersion: string;
  shadowParseContentHash: string;
  visualizationManifestHash: string;
  checksum: string;
  vectorsPath: string;
  indexPath: string;
  validationPath: string;
  notes: string[];
};

export type IdentityMappingRecord = {
  externalId: string;
  externalName: string;
  externalOracleId?: string;
  classification: IdentityResolutionClass;
  oracleId?: string;
  candidates?: OracleCardRef[];
  reason?: string;
};

export type ReviewDecision = "CONFIRMED" | "REJECTED" | "UNCERTAIN";

export type CandidateReview = {
  candidateId: string;
  decision: ReviewDecision;
  reason: string;
  reviewedAt: string;
};

export type VerificationResult = {
  ok: boolean;
  reasons: string[];
};

export interface MechanicalCandidateVerifier {
  verify(candidate: ConcreteInteraction): VerificationResult;
}
