/**
 * Canonical Oracle-action vocabulary — single source of truth for parser output
 * and evaluation labels. Do not introduce synonyms outside this module.
 */

export const CANONICAL_ACTION_TYPES = [
  "draw",
  "ramp / add mana",
  "tutor",
  "destroy",
  "exile",
  "counter",
  "bounce",
  "sacrifice",
  "create tokens",
  "copy",
  "reanimate",
  "mill",
  "discard",
  "cast/play from exile",
  "graveyard recursion",
  "protection",
  "board wipe",
  "deal damage",
  "gain life",
  "lose life",
  "scry",
  "surveil",
  "tap",
  "untap",
  "transform",
  "put counter",
] as const;

export type CanonicalActionType = (typeof CANONICAL_ACTION_TYPES)[number];

/** Eval-only pseudo-types — ability/evidence checks, not stored action types. */
export const EVAL_PSEUDO_ACTION_TYPES = ["triggered", "multiple", "optional"] as const;

export function isCanonicalActionType(value: string): value is CanonicalActionType {
  return (CANONICAL_ACTION_TYPES as readonly string[]).includes(value);
}

/** Legacy parser aliases → canonical labels. */
export const ACTION_TYPE_ALIASES: Record<string, CanonicalActionType> = {
  add_mana: "ramp / add mana",
  create_token: "create tokens",
  board_wipe: "board wipe",
  cast_from_exile: "cast/play from exile",
  deal_damage: "deal damage",
  gain_life: "gain life",
  lose_life: "lose life",
};

export function normalizeActionType(raw: string): string {
  return ACTION_TYPE_ALIASES[raw] ?? raw;
}

/** Map eval labels that predate taxonomy alignment. */
export function normalizeEvalExpectedActionType(
  actionType: string,
  evidenceContains?: string,
): string {
  if (actionType === "destroy" && evidenceContains?.toLowerCase().includes("damage")) {
    return "deal damage";
  }
  return normalizeActionType(actionType);
}

export const CANONICAL_SOURCE_ZONES = [
  "hand",
  "library",
  "graveyard",
  "exile",
  "battlefield",
  "stack",
  "command",
] as const;

export const CANONICAL_DESTINATION_ZONES = [
  "hand",
  "library",
  "graveyard",
  "exile",
  "battlefield",
  "stack",
  "mana_pool",
] as const;

export const CANONICAL_ABILITY_TYPES = [
  "spell_effect",
  "activated",
  "triggered",
  "static",
  "replacement",
] as const;

export type CanonicalAbilityType = (typeof CANONICAL_ABILITY_TYPES)[number];

export function normalizeAbilityType(raw: string): CanonicalAbilityType | string {
  if (raw === "preventing" || raw === "special_action") return "static";
  if (raw === "unknown") return "spell_effect";
  return raw;
}
