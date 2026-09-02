/** Interaction Profile v2 — derived layer on frozen RC8. Does NOT modify RC8. */
export const CARD_INTERACTION_PROFILE_V2_VERSION = "card-interaction-profile-v2";
export const DECK_INTERACTION_PROFILE_V2_VERSION = "deck-interaction-profile-v2";
export const INTERACTION_PROFILE_V2_SPEC_VERSION = "interaction-profile-v2-spec-v1";
export const TARGET_OBJECT_CLASSIFIER_VERSION = "target-object-classifier-v1";
export const RC8_SOURCE_REGISTRY_VERSION = "rc8-source-registry-v1";

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

export type ScoredAxisValue = {
  score: number;
  evidence: Array<{ oracleId: string; rule: string; note?: string }>;
};

export type CardInteractionProfileV2 = {
  oracleId: string;
  profileVersion: typeof CARD_INTERACTION_PROFILE_V2_VERSION;
  axes: Partial<Record<RpsAxisFamily, Partial<Record<RpsVectorKind, ScoredAxisValue>>>>;
};

export type DeckInteractionProfileV2 = {
  profileVersion: typeof DECK_INTERACTION_PROFILE_V2_VERSION;
  mainboard: Record<string, number>;
  commandZone: Record<string, number>;
};
