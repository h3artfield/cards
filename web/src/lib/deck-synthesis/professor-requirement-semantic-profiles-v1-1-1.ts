/**
 * Maps Architect requirement IDs to Semantic Oracle function signatures.
 * Used to retrieve cards that actually perform the asked function,
 * not merely mention a keyword in Oracle text.
 */
import type { SemanticOracleFactsV111 } from "./professor-semantic-oracle-facts-v1-1-1";

export const PROFESSOR_REQUIREMENT_SEMANTIC_PROFILES_V1_1_1_VERSION =
  "professor-requirement-semantic-profiles-v1-1-1";

export type RequirementSemanticProfileV111 = {
  requiredActionsAny: string[];
  preferredActions: string[];
  requiredRolesAny: string[];
  preferredRoles: string[];
  requiredStructuresAny: string[];
  preferredRepeatability: "repeatable" | "one_shot" | null;
  requiredZonesAny: string[];
};

const EMPTY_PROFILE: RequirementSemanticProfileV111 = {
  requiredActionsAny: [],
  preferredActions: [],
  requiredRolesAny: [],
  preferredRoles: [],
  requiredStructuresAny: [],
  preferredRepeatability: null,
  requiredZonesAny: [],
};

const PROFILES: Record<string, RequirementSemanticProfileV111> = {
  ramp_and_fixing: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["add_mana", "search_library", "put_onto_battlefield"],
    preferredActions: ["untap"],
    requiredRolesAny: ["ramp", "mana_generation"],
    preferredRepeatability: "repeatable",
  },
  mana_engine: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["add_mana"],
    requiredRolesAny: ["ramp", "mana_generation"],
    requiredStructuresAny: ["activated", "triggered", "static", "replacement"],
    preferredRepeatability: "repeatable",
  },
  repeatable_token_engines: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["create_token"],
    requiredRolesAny: ["token_generation"],
    requiredStructuresAny: ["triggered", "activated", "replacement", "static"],
    preferredRepeatability: "repeatable",
    requiredZonesAny: ["battlefield"],
  },
  burst_token_production: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["create_token"],
    requiredRolesAny: ["token_generation"],
    preferredRepeatability: "one_shot",
  },
  sacrifice_outlets: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["sacrifice"],
    requiredRolesAny: ["sacrifice_outlet"],
    requiredStructuresAny: ["activated", "triggered"],
    preferredRepeatability: "repeatable",
  },
  token_and_death_payoffs: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["lose_life", "draw", "add_mana", "create_token", "put_counter"],
    requiredRolesAny: ["sacrifice_payoff", "token_generation"],
    requiredStructuresAny: ["triggered", "static"],
  },
  card_advantage_and_selection: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["draw", "put_into_hand", "scry", "surveil"],
    requiredRolesAny: ["card_advantage", "card_draw"],
    preferredRepeatability: "repeatable",
  },
  interaction: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["destroy", "exile", "counter", "deal_damage"],
    requiredRolesAny: ["removal", "board_wipe", "countermagic", "board_interaction"],
  },
  protection: {
    ...EMPTY_PROFILE,
    requiredRolesAny: ["protection"],
    preferredRoles: ["enabler"],
  },
  recursion: {
    ...EMPTY_PROFILE,
    requiredActionsAny: ["return_to_hand", "return_to_battlefield", "cast", "play"],
    requiredRolesAny: ["recursion", "reanimation"],
    requiredZonesAny: ["graveyard"],
  },
  combat_finishers: {
    ...EMPTY_PROFILE,
    requiredRolesAny: ["combat_payoff", "combat_manipulation", "payoff"],
    preferredActions: ["put_counter", "create_token"],
  },
};

const ALIASES: Record<string, string> = {
  repeatable_token_engine: "repeatable_token_engines",
  token_engine: "repeatable_token_engines",
  token_engines: "repeatable_token_engines",
  free_sacrifice_outlet: "sacrifice_outlets",
  sacrifice_outlet: "sacrifice_outlets",
  graveyard_recovery: "recursion",
  graveyard_recursion: "recursion",
  commander_protection: "protection",
  repeatable_card_advantage: "card_advantage_and_selection",
  card_advantage: "card_advantage_and_selection",
  creature_interaction: "interaction",
  mana_ramp: "ramp_and_fixing",
  ramp: "ramp_and_fixing",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function inferProfileFromText(text: string): RequirementSemanticProfileV111 | null {
  const hay = normalizeKey(text);
  if (hay.includes("token") && (hay.includes("repeat") || hay.includes("engine"))) {
    return PROFILES.repeatable_token_engines ?? null;
  }
  if (hay.includes("token")) return PROFILES.burst_token_production ?? null;
  if (hay.includes("sacrifice") && hay.includes("outlet")) return PROFILES.sacrifice_outlets ?? null;
  if (hay.includes("graveyard") || hay.includes("recur") || hay.includes("reanimat")) {
    return PROFILES.recursion ?? null;
  }
  if (hay.includes("protect")) return PROFILES.protection ?? null;
  if (hay.includes("draw") || hay.includes("card_advantage") || hay.includes("advantage")) {
    return PROFILES.card_advantage_and_selection ?? null;
  }
  if (hay.includes("interact") || hay.includes("removal") || hay.includes("counterspell")) {
    return PROFILES.interaction ?? null;
  }
  if (hay.includes("mana") || hay.includes("ramp")) return PROFILES.ramp_and_fixing ?? null;
  if (hay.includes("combat") || hay.includes("finisher") || hay.includes("overrun")) {
    return PROFILES.combat_finishers ?? null;
  }
  return null;
}

export function resolveRequirementSemanticProfileV111(args: {
  requirementId: string;
  primaryRole?: string;
}): RequirementSemanticProfileV111 | null {
  const id = normalizeKey(args.requirementId);
  const aliased = ALIASES[id] ?? id;
  if (PROFILES[aliased]) return PROFILES[aliased]!;
  return inferProfileFromText(`${id} ${args.primaryRole ?? ""}`);
}

function hasAny(haystack: readonly string[], needles: readonly string[]): boolean {
  if (needles.length === 0) return false;
  const set = new Set(haystack.map(normalizeKey));
  return needles.some((needle) => set.has(normalizeKey(needle)));
}

/**
 * Positive score when Semantic Oracle supports the required function.
 * Negative when the card has a Semantic Oracle record but lacks the function.
 * Zero when there is no profile or no Semantic Oracle facts.
 */
export function scoreRequirementSemanticFitV111(args: {
  facts: SemanticOracleFactsV111 | null;
  requirementId: string;
  primaryRole: string;
}): { score: number; functionalMatch: boolean } {
  const profile = resolveRequirementSemanticProfileV111({
    requirementId: args.requirementId,
    primaryRole: args.primaryRole,
  });
  if (!profile || !args.facts) return { score: 0, functionalMatch: false };

  const actions = args.facts.semanticActions.length > 0 ? args.facts.semanticActions : args.facts.topActions;
  const roles = args.facts.semanticFunctions.length > 0 ? args.facts.semanticFunctions : args.facts.derivedRoles;
  const structures =
    args.facts.abilityStructures.length > 0 ? args.facts.abilityStructures : args.facts.abilityTypes;
  const zones = args.facts.zoneInteractions.length > 0 ? args.facts.zoneInteractions : args.facts.zones;

  const actionHit = hasAny(actions, profile.requiredActionsAny);
  const roleHit = hasAny(roles, profile.requiredRolesAny);
  const structureHit =
    profile.requiredStructuresAny.length === 0 || hasAny(structures, profile.requiredStructuresAny);
  const zoneHit = profile.requiredZonesAny.length === 0 || hasAny(zones, profile.requiredZonesAny);
  const hasRequiredSignal =
    (profile.requiredActionsAny.length === 0 && profile.requiredRolesAny.length === 0) ||
    actionHit ||
    roleHit;

  let score = 0;
  if (actionHit) score += 18;
  if (roleHit) score += 10;
  if (structureHit && (actionHit || roleHit)) score += 12;
  if (zoneHit && (actionHit || roleHit)) score += 4;
  if (hasAny(actions, profile.preferredActions)) score += 4;
  if (hasAny(roles, profile.preferredRoles)) score += 3;
  if (
    profile.preferredRepeatability &&
    (args.facts.repeatability === profile.preferredRepeatability ||
      args.facts.repeatability === "mixed")
  ) {
    score += 10;
  }

  const functionalMatch = hasRequiredSignal && structureHit && zoneHit;
  if (!functionalMatch) score -= 16;
  return { score, functionalMatch };
}
