import type { ResolvedDeckCard } from "../types";

export const MODEL_C_FEATURES_VERSION = "commander-model-c-features-v3";
export const MODEL_C_VERSION = "commander-model-c-v1";

export type ModelCVariant = "C0" | "G" | "C1" | "ID" | "C2";

export type EligibleMainboardCard = {
  oracleId: string;
  quantity: number;
  card: ResolvedDeckCard;
};

export type SemanticCardBucket =
  | "usable"
  | "needs_review"
  | "structurally_invalid"
  | "absent"
  | "unresolved";

export type DeckSemanticCensus = {
  deckHash: string;
  commanderOracleIds: string[];
  commanderZoneCardCount: number;
  commanderConfigurationType: string;
  eligibleMainboardCardQuantity: number;
  eligibleMainboardUniqueOracleIds: number;
  bucketsByQuantity: Record<SemanticCardBucket, number>;
  bucketsByUniqueOracleId: Record<SemanticCardBucket, number>;
  cardsRepresentedSemantically: number;
  cardsMissingSemantics: number;
  semanticCoverageByQuantity: number;
  semanticCoverageByUniqueOracleId: number;
  aggregatableCoverageByQuantity: number;
  digitalOnlyOracleIdsInFeatures: number;
  commanderExclusionFailures: number;
  commanderInMainboardBeforeExclusion: number;
};

export type ModelCSeatRow = {
  podId: string;
  seatIndex: number;
  deckHash: string;
  split: "train" | "validation" | "test";
  basicStructure: Record<string, number>;
  gameChanger: Record<string, number>;
  semantic: Record<string, number>;
  cardIdentity: Record<string, number>;
  census: DeckSemanticCensus;
};

export type FeatureColumnFamily =
  | "BASIC_STRUCTURE"
  | "GAME_CHANGER"
  | "RC8_ACTIONS"
  | "RC8_ABILITY_STRUCTURES"
  | "RC8_ZONES_TRANSITIONS"
  | "RC8_OWNERSHIP_CONTEXT"
  | "RC8_DERIVED_ROLES"
  | "RC8_ATTACK_VECTORS"
  | "RC8_VULNERABILITY_VECTORS"
  | "RC8_MISSINGNESS"
  | "CARD_ID";
