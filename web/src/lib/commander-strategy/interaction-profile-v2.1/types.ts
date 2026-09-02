/** Interaction Profile v2.1 — pruned ontology + tightened reliance semantics. RC8 frozen. */
export const CARD_INTERACTION_PROFILE_V2_1_VERSION = "card-interaction-profile-v2.1";
export const DECK_INTERACTION_PROFILE_V2_1_VERSION = "deck-interaction-profile-v2.1";
export const INTERACTION_PROFILE_V2_1_SPEC_VERSION = "interaction-profile-v2.1-spec-v1";
export const MATCHUP_ONTOLOGY_V2_1_VERSION = "matchup-ontology-v2.1";

export type RpsAxisFamily =
  | "creatures"
  | "artifacts"
  | "enchantments"
  | "lands"
  | "tokens"
  | "graveyard"
  | "library_search"
  | "hand_resources"
  | "exile"
  | "spells_stack"
  | "activated_abilities"
  | "triggered_abilities"
  | "mana_acceleration"
  | "recursion";

export type RpsVectorKind = "exposure" | "reliance" | "disruption" | "resilience";

export type AxisZone = "mainboard" | "commandZone";

export type DeadAxisDisposition =
  | "IMPLEMENTATION_GAP"
  | "STRUCTURALLY_NOT_APPLICABLE"
  | "UNSUPPORTED_BY_CURRENT_SEMANTICS"
  | "GENUINELY_ZERO_IN_TRAIN";

export type ScoredAxisValue = {
  score: number;
  evidence: Array<{ oracleId: string; rule: string; note?: string }>;
};

export type CardInteractionProfileV2_1 = {
  oracleId: string;
  profileVersion: typeof CARD_INTERACTION_PROFILE_V2_1_VERSION;
  axes: Partial<Record<RpsAxisFamily, Partial<Record<RpsVectorKind, ScoredAxisValue>>>>;
};

export type DeckInteractionProfileV2_1 = {
  profileVersion: typeof DECK_INTERACTION_PROFILE_V2_1_VERSION;
  mainboard: Record<string, number>;
  commandZone: Record<string, number>;
};

export type SaturationFlag =
  | "saturated"
  | "near_constant"
  | "healthy_variation"
  | "sparse_but_usable";
