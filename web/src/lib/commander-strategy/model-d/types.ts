export const MODEL_D_FEATURES_VERSION = "commander-model-d-features-v1";
export const MODEL_D_FEATURE_SPEC_VERSION = "commander-model-d-feature-spec-v1";
export const MODEL_D_VERSION = "commander-model-d-v1";

export type ModelDVariant = "D0" | "D1";

export type ModelDFeatureBlock =
  | "FROZEN_C2"
  | "OPPONENT_CONTEXT"
  | "SEMANTIC_MATCHUP"
  | "CARD_ID";

export type ModelDSeatRow = {
  podId: string;
  seatIndex: number;
  deckHash: string;
  split: "train" | "validation" | "test";
  opponentContext: Record<string, number>;
  semanticMatchup: Record<string, number>;
};
