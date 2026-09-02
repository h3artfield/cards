/**
 * RC8 Semantic Oracle facts for Professor sol-directed construction.
 * Sourced from semantic map artifacts — authoritative functional evidence for Call 2.
 * Not a matchup/winner predictor. Pressure / K / Profiles scores are out of scope here.
 */
import { getSemanticMapPoint } from "@/lib/semantic-visualization/artifact-loader";
import type { SemanticMapPoint } from "@/lib/semantic-visualization/types";

export const PROFESSOR_SEMANTIC_ORACLE_FACTS_V1_1_1_VERSION =
  "professor-semantic-oracle-facts-v1-1-1";

const REPEATABLE_STRUCTURES = new Set([
  "activated",
  "triggered",
  "replacement",
  "static",
  "loyalty",
]);

const ONE_SHOT_STRUCTURES = new Set(["spell_effect"]);

const RESOURCE_ACTIONS = new Set([
  "add_mana",
  "draw",
  "put_into_hand",
  "create_token",
  "search_library",
  "put_onto_battlefield",
  "put_counter",
  "gain_life",
  "copy",
]);

export type SemanticRepeatabilityV111 = "repeatable" | "one_shot" | "mixed" | "unknown";

/** Structured Semantic Oracle representation attached to candidateDictionary entries. */
export type SemanticOracleFactsV111 = {
  topActions: string[];
  abilityTypes: string[];
  zones: string[];
  semanticOwners: string[];
  derivedRoles: string[];
  semanticActions: string[];
  semanticFunctions: string[];
  abilityStructures: string[];
  zoneInteractions: string[];
  repeatability: SemanticRepeatabilityV111;
  conditions: string[];
  resourceEffects: string[];
  targetScope: string[];
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function inferRepeatabilityFromAbilityTypes(
  abilityTypes: readonly string[],
): SemanticRepeatabilityV111 {
  const normalized = abilityTypes.map(normalizeToken);
  const hasRepeatable = normalized.some((t) => REPEATABLE_STRUCTURES.has(t));
  const hasOneShot = normalized.some((t) => ONE_SHOT_STRUCTURES.has(t));
  if (hasRepeatable && hasOneShot) return "mixed";
  if (hasRepeatable) return "repeatable";
  if (hasOneShot) return "one_shot";
  return "unknown";
}

export function inferConditionsFromAbilityTypes(abilityTypes: readonly string[]): string[] {
  const conditions: string[] = [];
  for (const raw of abilityTypes) {
    const type = normalizeToken(raw);
    if (type === "triggered") conditions.push("trigger");
    else if (type === "activated") conditions.push("activation");
    else if (type === "replacement") conditions.push("replacement");
    else if (type === "static") conditions.push("continuous");
    else if (type === "spell_effect") conditions.push("on_resolution");
    else if (type === "loyalty") conditions.push("loyalty");
  }
  return [...new Set(conditions)];
}

export function inferTargetScopeFromRoles(derivedRoles: readonly string[]): string[] {
  const roles = new Set(derivedRoles.map(normalizeToken));
  const scope: string[] = [];
  if (roles.has("board_wipe")) scope.push("mass");
  if (roles.has("removal") || roles.has("countermagic")) scope.push("targeted");
  if (roles.has("card_draw") || roles.has("card_advantage") || roles.has("ramp") || roles.has("protection")) {
    scope.push("self");
  }
  return scope;
}

export function inferResourceEffectsFromActions(actions: readonly string[]): string[] {
  return [...new Set(actions.map(normalizeToken).filter((action) => RESOURCE_ACTIONS.has(action)))];
}

export function semanticOracleFactsFromMapPoint(
  point: SemanticMapPoint,
): SemanticOracleFactsV111 {
  const topActions = [...point.topActions];
  const abilityTypes = [...point.abilityTypes];
  const zones = [...point.zones];
  const semanticOwners = [...point.semanticOwners];
  const derivedRoles = [...point.derivedRoles];
  return {
    topActions,
    abilityTypes,
    zones,
    semanticOwners,
    derivedRoles,
    semanticActions: topActions,
    semanticFunctions: derivedRoles,
    abilityStructures: abilityTypes,
    zoneInteractions: zones,
    repeatability: inferRepeatabilityFromAbilityTypes(abilityTypes),
    conditions: inferConditionsFromAbilityTypes(abilityTypes),
    resourceEffects: inferResourceEffectsFromActions(topActions),
    targetScope: inferTargetScopeFromRoles(derivedRoles),
  };
}

export function getSemanticOracleFactsForOracleId(
  oracleId: string,
): SemanticOracleFactsV111 | null {
  const point = getSemanticMapPoint(oracleId);
  if (!point) return null;
  return semanticOracleFactsFromMapPoint(point);
}
