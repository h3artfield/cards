/**
 * Three-layer Oracle taxonomy — do not mix layers in labels or metrics.
 *
 * Layer 1: Ability structure (rules grammar)
 * Layer 2: Primitive Oracle actions (observable rules-text operations)
 * Layer 3: Derived deck roles (interpretation — references primitive action evidence)
 */

/** Layer 1 — ability structure properties. */
export const ABILITY_STRUCTURE_TYPES = [
  "static",
  "activated",
  "triggered",
  "spell_effect",
  "replacement",
] as const;

export type AbilityStructureType = (typeof ABILITY_STRUCTURE_TYPES)[number];

/** Layer 2 — primitive Oracle actions (stored on action records). No role names. */
export const PRIMITIVE_ACTION_TYPES = [
  "add_mana",
  "draw",
  "discard",
  "search_library",
  "deal_damage",
  "destroy",
  "exile",
  "counter",
  "return_to_hand",
  "return_to_battlefield",
  "create_token",
  "cast",
  "play",
  "copy",
  "sacrifice",
  "mill",
  "gain_life",
  "lose_life",
  "scry",
  "surveil",
  "tap",
  "put_counter",
  "shuffle_into_library",
] as const;

export type PrimitiveActionType = (typeof PRIMITIVE_ACTION_TYPES)[number];

/** Layer 3 — derived deck-building roles (never primitive action labels). */
export const DERIVED_DECK_ROLES = [
  "ramp",
  "tutor",
  "removal",
  "board_wipe",
  "card_advantage",
  "recursion",
  "protection",
  "enabler",
  "payoff",
] as const;

export type DerivedDeckRole = (typeof DERIVED_DECK_ROLES)[number];

/** Map legacy / mislabeled eval strings → primitive action type. */
export const LEGACY_TO_PRIMITIVE: Record<string, PrimitiveActionType | null> = {
  "ramp / add mana": "add_mana",
  add_mana: "add_mana",
  tutor: "search_library",
  bounce: "return_to_hand",
  reanimate: "return_to_battlefield",
  "create tokens": "create_token",
  create_token: "create_token",
  "board wipe": "destroy",
  board_wipe: "destroy",
  "deal damage": "deal_damage",
  deal_damage: "deal_damage",
  "cast/play from exile": "cast",
  cast_from_exile: "cast",
  "graveyard recursion": "play",
  protection: null,
  triggered: null,
  multiple: null,
  optional: null,
  spell_effect: null,
  variable: null,
  granted: null,
  target: null,
  create: "create_token",
  put: "put_counter",
  return: "return_to_hand",
};

/** Primitive actions that imply derived roles (Layer 3 only). */
export const PRIMITIVE_TO_DERIVED_ROLES: Partial<Record<PrimitiveActionType, DerivedDeckRole[]>> = {
  add_mana: ["ramp"],
  search_library: ["tutor"],
  draw: ["card_advantage"],
  destroy: ["removal"],
  exile: ["removal"],
  deal_damage: ["removal"],
  mill: ["removal"],
  counter: ["removal"],
  return_to_battlefield: ["recursion"],
  play: ["recursion"],
  cast: ["recursion"],
  create_token: ["enabler", "payoff"],
  copy: ["enabler"],
  sacrifice: ["enabler"],
};

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

export function isPrimitiveActionType(value: string): value is PrimitiveActionType {
  return (PRIMITIVE_ACTION_TYPES as readonly string[]).includes(value);
}

export function normalizeToPrimitive(raw: string, evidenceContains?: string): PrimitiveActionType | null {
  const lower = raw.toLowerCase();
  if (lower === "destroy" && evidenceContains?.toLowerCase().includes("damage")) {
    return "deal_damage";
  }
  if (LEGACY_TO_PRIMITIVE[raw] !== undefined) {
    return LEGACY_TO_PRIMITIVE[raw];
  }
  if (isPrimitiveActionType(raw)) {
    return raw;
  }
  return inferPrimitiveFromEvidence(evidenceContains ?? raw);
}

function inferPrimitiveFromEvidence(text: string): PrimitiveActionType | null {
  const t = text.toLowerCase();
  if (/\bdraw\b/.test(t)) return "draw";
  if (/\bsearch (?:your )?library\b/.test(t)) return "search_library";
  if (/\badd \{/.test(t) || /\badd (?:one mana|three mana)/.test(t)) return "add_mana";
  if (/\bdeals? \d+ damage\b/.test(t)) return "deal_damage";
  if (/\bdestroy\b/.test(t)) return "destroy";
  if (/\bexile\b/.test(t)) return "exile";
  if (/\bcounter target\b/.test(t)) return "counter";
  if (/\breturn target.*to.*hand\b/.test(t)) return "return_to_hand";
  if (/graveyard.*(?:onto the battlefield|to your hand)/.test(t)) return "return_to_battlefield";
  if (/\bcreate.*token\b/.test(t)) return "create_token";
  if (/\bcopy target\b/.test(t)) return "copy";
  if (/\bsacrifice\b/.test(t)) return "sacrifice";
  if (/\bmill\b/.test(t)) return "mill";
  if (/\bdiscard\b/.test(t)) return "discard";
  if (/\bcast\b/.test(t)) return "cast";
  if (/\bplay\b/.test(t)) return "play";
  if (/\bscry\b/.test(t)) return "scry";
  if (/\bsurveil\b/.test(t)) return "surveil";
  if (/\btap target\b/.test(t)) return "tap";
  if (/\bput.*counter\b/.test(t)) return "put_counter";
  if (/\bshuffles?.*into.*library\b/.test(t)) return "shuffle_into_library";
  return null;
}

export function inferDerivedRoles(primitives: PrimitiveActionType[]): DerivedDeckRole[] {
  const roles = new Set<DerivedDeckRole>();
  for (const p of primitives) {
    for (const r of PRIMITIVE_TO_DERIVED_ROLES[p] ?? []) {
      roles.add(r);
    }
  }
  return [...roles];
}

/** @deprecated Use PRIMITIVE_ACTION_TYPES — kept for migration only. */
export const CANONICAL_ACTION_TYPES = PRIMITIVE_ACTION_TYPES;

export function normalizeActionType(raw: string): string {
  return normalizeToPrimitive(raw) ?? raw;
}

export const EVAL_PSEUDO_ACTION_TYPES = ["triggered", "multiple", "optional"] as const;

export function normalizeEvalExpectedActionType(
  actionType: string,
  evidenceContains?: string,
): string {
  return normalizeToPrimitive(actionType, evidenceContains) ?? actionType;
}

export function normalizeAbilityType(raw: string): AbilityStructureType | string {
  if (raw === "preventing" || raw === "special_action") return "static";
  if (raw === "unknown") return "spell_effect";
  return raw;
}

/** Minimum gold-label support before a primitive may reach production_supported. */
export const PRODUCTION_SUPPORTED_MIN_SUPPORT = 5;

export type PrimitiveSupportTier =
  | "experimental"
  | "development_candidate"
  | "validation_candidate"
  | "production_supported";

export interface PrimitiveSupportRequirements {
  minSupport: number;
  minPrecision: number;
  minRecall: number;
  maxFalsePositiveRate: number;
}

export const PRODUCTION_SUPPORTED_REQUIREMENTS: PrimitiveSupportRequirements = {
  minSupport: PRODUCTION_SUPPORTED_MIN_SUPPORT,
  minPrecision: 0.98,
  minRecall: 0.95,
  maxFalsePositiveRate: 0.02,
};

export const VALIDATION_CANDIDATE_REQUIREMENTS: PrimitiveSupportRequirements = {
  minSupport: 5,
  minPrecision: 0.9,
  minRecall: 0.85,
  maxFalsePositiveRate: 0.05,
};

export const DEVELOPMENT_CANDIDATE_REQUIREMENTS: PrimitiveSupportRequirements = {
  minSupport: 3,
  minPrecision: 0.75,
  minRecall: 0.7,
  maxFalsePositiveRate: 0.15,
};

export function classifyPrimitiveSupportTier(metrics: {
  support: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
}): PrimitiveSupportTier {
  const prod = PRODUCTION_SUPPORTED_REQUIREMENTS;
  if (
    metrics.support >= prod.minSupport &&
    metrics.precision >= prod.minPrecision &&
    metrics.recall >= prod.minRecall &&
    metrics.falsePositiveRate <= prod.maxFalsePositiveRate
  ) {
    return "production_supported";
  }
  const val = VALIDATION_CANDIDATE_REQUIREMENTS;
  if (
    metrics.support >= val.minSupport &&
    metrics.precision >= val.minPrecision &&
    metrics.recall >= val.minRecall &&
    metrics.falsePositiveRate <= val.maxFalsePositiveRate
  ) {
    return "validation_candidate";
  }
  const dev = DEVELOPMENT_CANDIDATE_REQUIREMENTS;
  if (
    metrics.support >= dev.minSupport &&
    metrics.precision >= dev.minPrecision &&
    metrics.recall >= dev.minRecall &&
    metrics.falsePositiveRate <= dev.maxFalsePositiveRate
  ) {
    return "development_candidate";
  }
  return "experimental";
}
