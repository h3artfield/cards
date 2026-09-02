/** Model D2 — IPV2.1 matched marginal-control ladder on frozen C2. */
export const MODEL_D2_FEATURES_VERSION = "commander-model-d2-features-v1";
export const MODEL_D2_FEATURE_SPEC_VERSION = "commander-model-d2-feature-spec-v1";
export const MODEL_D2_VERSION = "commander-model-d2-v1";

/** P0 = C2 + self IPV2.1; P1 = P0 + opp marginals; D2 = P1 + RPS interactions. */
export type ModelD2Variant = "P0" | "P1" | "D2";

export type ModelD2FeatureBlock =
  | "FROZEN_C2"
  | "CARD_ID"
  | "IPV2_1_SELF"
  | "IPV2_1_OPP_MARGINAL"
  | "IPV2_1_RPS_INTERACTION";
