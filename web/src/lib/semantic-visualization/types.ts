/**
 * RC8 Semantic Map — visualization-only artifacts.
 * Never write these fields back into canonical Oracle / parser truth.
 */

export const SEMANTIC_VISUALIZATION_VERSION = "catalog-semantic-visualization-v1";
export const FEATURE_VECTOR_VERSION = "semantic-feature-vector-v1";
export const DERIVED_FEATURE_VERSION = "semantic-derived-features-v1";
export const PROJECTION_VERSION = "umap-3d-v1";
export const CLUSTER_VERSION = "kmeans-v1";

export const UMAP_RANDOM_SEED = 42;
export const UMAP_NEIGHBORS = 15;
export const UMAP_MIN_DIST = 0.1;
export const CLUSTER_COUNT = 64;
export const NEIGHBOR_COUNT = 20;

export type ParserQualityStatus = "publishable" | "needs_review" | "quarantined";

export type SemanticMapPoint = {
  oracleId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  x2: number;
  y2: number;
  clusterId: number;
  colorIdentity: string[];
  manaValue: number;
  manaCost?: string;
  typeLine: string;
  types: string[];
  subtypes: string[];
  layout?: string;
  commanderEligible: boolean;
  power?: string;
  toughness?: string;
  publishable: boolean;
  hasNeedsReview: boolean;
  structuralInvalid: boolean;
  qualityStatus: ParserQualityStatus;
  topActions: string[];
  abilityTypes: string[];
  zones: string[];
  semanticOwners: string[];
  derivedRoles: string[];
  normalizedName: string;
};

export type SemanticMapNeighbor = {
  oracleId: string;
  name: string;
  distance: number;
  imageUrl?: string;
};

export type SemanticMapNeighborExplanation = {
  sharedActions: string[];
  sharedZones: string[];
  sharedZoneFlows: string[];
  sharedAbilityTypes: string[];
  sharedSemanticOwners: string[];
  sharedDerivedRoles: string[];
};

export type SemanticMapClusterSummary = {
  clusterId: number;
  size: number;
  topActions: Array<{ action: string; count: number }>;
  topDerivedRoles: Array<{ role: string; count: number }>;
  topAbilityTypes: Array<{ abilityType: string; count: number }>;
  representativeCards: Array<{ oracleId: string; name: string }>;
};

export type SemanticMapCardDetail = {
  oracleId: string;
  name: string;
  manaCost?: string;
  manaValue: number;
  typeLine: string;
  colorIdentity: string[];
  oracleText?: string;
  faces: Array<{
    name: string;
    manaCost?: string;
    typeLine?: string;
    oracleText?: string;
    power?: string;
    toughness?: string;
  }>;
  imageUrl?: string;
  imageUrls?: string[];
  layout?: string;
  commanderEligible: boolean;
  qualityStatus: ParserQualityStatus;
  publishable: boolean;
  hasNeedsReview: boolean;
  structuralInvalid: boolean;
  parserVersion?: string;
  semanticActions: Array<{
    actionType: string;
    reviewStatus: string;
    sourceZones: string[];
    destinationZones: string[];
    semanticOwner?: string;
    executionContext?: string;
    abilityType?: string;
  }>;
  abilities: Array<{
    abilityType: string;
    abilityId: string;
  }>;
  zones: string[];
  semanticOwners: string[];
  derivedRoles: Array<{ role: string; version: string }>;
  coordinates: { x: number; y: number; z: number };
  clusterId: number;
  neighbors: SemanticMapNeighbor[];
  neighborExplanation?: SemanticMapNeighborExplanation;
};

export type SemanticMapCompareResult = {
  cardA: { oracleId: string; name: string; coordinates: { x: number; y: number; z: number } };
  cardB: { oracleId: string; name: string; coordinates: { x: number; y: number; z: number } };
  semanticDistance: number;
  sharedActions: string[];
  differentActionsA: string[];
  differentActionsB: string[];
  sharedZones: string[];
  sharedDerivedRoles: string[];
  abilityStructureA: string[];
  abilityStructureB: string[];
  abilityStructureDiff: { onlyA: string[]; onlyB: string[]; shared: string[] };
};

export type SemanticMapInventoryOverlay = {
  oracleId: string;
  inStock: boolean;
  totalQty: number;
  items: Array<{
    inventoryItemId: string;
    name: string;
    qty: number;
    listPrice?: number;
    tcgLowPrice?: number;
    imageUrl?: string;
    imageProxyUrl?: string;
    setName?: string;
  }>;
};

export type SemanticMapManifest = {
  artifactType: "CatalogSemanticVisualizationManifest";
  version: typeof SEMANTIC_VISUALIZATION_VERSION;
  generatedAt: string;
  status: "EXPERIMENTAL";
  label: "RC8 Semantic Map — Experimental";
  disclaimer: string;
  shadowParseManifestPath: string;
  shadowParseContentHash?: string;
  parserVersion: string;
  populationCount: number;
  embeddingVersion: string;
  featureVectorVersion: typeof FEATURE_VECTOR_VERSION;
  derivedFeatureVersion: typeof DERIVED_FEATURE_VERSION;
  projectionAlgorithm: "UMAP";
  projectionVersion: typeof PROJECTION_VERSION;
  projectionParameters: {
    nComponents: 3;
    nNeighbors: number;
    minDist: number;
    randomSeed: number;
    metric: "cosine";
  };
  pca2dVersion: "pca-2d-v1";
  clusterVersion: typeof CLUSTER_VERSION;
  clusterCount: number;
  randomSeed: number;
  pointsArtifactPath: string;
  neighborsArtifactPath: string;
  clustersArtifactPath: string;
  contentHash: string;
};

export type SemanticMapFilters = {
  showScope: "all" | "inventory";
  colorMode: "all" | "W" | "U" | "B" | "R" | "G" | "C" | "multicolor";
  includesColors: string[];
  exactColorIdentity: string[];
  commanderEligible: "all" | "yes" | "no";
  commanderOracleId?: string;
  cardTypes: string[];
  subtypeQuery?: string;
  manaValueMin: number;
  manaValueMax: number;
  semanticActions: string[];
  semanticActionMode: "any" | "all";
  abilityTypes: string[];
  zones: string[];
  zoneFlowFrom?: string;
  zoneFlowTo?: string;
  semanticOwners: string[];
  qualityFilter: "all" | "publishable" | "accepted" | "needs_review" | "quarantined";
  derivedRoles: string[];
  centerCommanderOracleId?: string;
  neighborLimit?: number;
  compareA?: string;
  compareB?: string;
};
