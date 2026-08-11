import { PRIMITIVE_ACTION_TYPES } from "@/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

/** Ordered literal semantic feature names — bump FEATURE_VECTOR_VERSION when changed. */
export const PRIMITIVE_ACTION_FEATURES = [...PRIMITIVE_ACTION_TYPES] as const;

export const ABILITY_STRUCTURE_FEATURES = [
  "ability_static",
  "ability_activated",
  "ability_triggered",
  "ability_spell_effect",
  "ability_replacement",
  "ability_loyalty",
  "ability_saga",
  "ability_modal",
] as const;

export const SEMANTIC_STRUCTURE_FEATURES = [
  "semantic_source_card",
  "semantic_granted_object",
  "semantic_created_object",
  "semantic_granted_ability",
  "semantic_token_definition",
  "semantic_optional",
  "semantic_conditional",
  "semantic_replacement_consequence",
  "semantic_immediate_execution",
  "semantic_persistent_permission",
] as const;

export const ZONE_FEATURES = [
  "zone_hand",
  "zone_library",
  "zone_battlefield",
  "zone_graveyard",
  "zone_exile",
  "zone_stack",
] as const;

export const ZONE_FLOW_FEATURES = [
  "flow_graveyard_to_battlefield",
  "flow_graveyard_to_hand",
  "flow_exile_to_battlefield",
  "flow_exile_to_hand",
  "flow_hand_to_battlefield",
  "flow_library_to_hand",
  "flow_battlefield_to_graveyard",
  "flow_battlefield_to_exile",
  "flow_battlefield_to_hand",
  "flow_stack_to_battlefield",
] as const;

export const OBJECT_TYPE_FEATURES = [
  "obj_creature",
  "obj_artifact",
  "obj_enchantment",
  "obj_instant",
  "obj_sorcery",
  "obj_planeswalker",
  "obj_land",
  "obj_token",
  "obj_spell",
  "obj_permanent",
  "obj_battle",
  "obj_kindred",
] as const;

export const METADATA_FEATURES = [
  "meta_color_W",
  "meta_color_U",
  "meta_color_B",
  "meta_color_R",
  "meta_color_G",
  "meta_colorless",
  "meta_multicolor",
  "meta_mana_value_norm",
  "meta_commander_eligible",
  "meta_power_norm",
  "meta_toughness_norm",
  "meta_layout_normal",
  "meta_layout_transform",
  "meta_layout_modal_dfc",
  "meta_layout_split",
  "meta_layout_adventure",
  "meta_layout_other",
] as const;

export const FEATURE_NAMES = [
  ...PRIMITIVE_ACTION_FEATURES,
  ...ABILITY_STRUCTURE_FEATURES,
  ...SEMANTIC_STRUCTURE_FEATURES,
  ...ZONE_FEATURES,
  ...ZONE_FLOW_FEATURES,
  ...OBJECT_TYPE_FEATURES,
  ...METADATA_FEATURES,
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export function featureIndex(name: FeatureName): number {
  const idx = FEATURE_NAMES.indexOf(name);
  if (idx < 0) throw new Error(`Unknown feature: ${name}`);
  return idx;
}

export function createEmptyFeatureVector(): number[] {
  return new Array(FEATURE_NAMES.length).fill(0);
}
