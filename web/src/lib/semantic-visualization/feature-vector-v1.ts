import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { ShadowSemanticInput } from "./shadow-input";
import {
  ABILITY_STRUCTURE_FEATURES,
  createEmptyFeatureVector,
  FEATURE_NAMES,
  METADATA_FEATURES,
  OBJECT_TYPE_FEATURES,
  PRIMITIVE_ACTION_FEATURES,
  SEMANTIC_STRUCTURE_FEATURES,
  ZONE_FEATURES,
  ZONE_FLOW_FEATURES,
  featureIndex,
} from "./feature-spec-v1";
import { computeDerivedFeatureVector, DERIVED_ROLE_NAMES } from "./derived-features-v1";

export type CardFeatureBundle = {
  oracleId: string;
  literalVector: number[];
  derivedVector: number[];
  combinedVector: number[];
  topActions: string[];
  abilityTypes: string[];
  zones: string[];
  zoneFlows: string[];
  semanticOwners: string[];
  derivedRoles: string[];
};

function inc(vec: number[], key: string, amount = 1): void {
  const idx = FEATURE_NAMES.indexOf(key as (typeof FEATURE_NAMES)[number]);
  if (idx >= 0) vec[idx] += amount;
}

function normalizeCount(value: number, cap = 6): number {
  return Math.min(value, cap) / cap;
}

function parseNumericStat(value: string | undefined): number {
  if (!value) return 0;
  const n = parseInt(value.replace(/[^0-9-]/g, ""), 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(n, 0), 20) / 20;
}

function abilityStructureKey(abilityType: string): string | null {
  switch (abilityType) {
    case "static":
      return "ability_static";
    case "activated":
      return "ability_activated";
    case "triggered":
      return "ability_triggered";
    case "spell_effect":
      return "ability_spell_effect";
    case "replacement":
      return "ability_replacement";
    case "loyalty":
      return "ability_loyalty";
    case "modal":
      return "ability_modal";
    default:
      return null;
  }
}

function zoneFlowKey(from: string, to: string): string | null {
  const key = `flow_${from}_to_${to}`;
  return (ZONE_FLOW_FEATURES as readonly string[]).includes(key) ? key : null;
}

function collectActionSignals(actions: SemanticAction[], abilities: SemanticAbility[]) {
  const abilityById = new Map(abilities.map((a) => [a.abilityId, a]));
  const actionCounts = new Map<string, number>();
  const abilityTypes = new Set<string>();
  const zones = new Set<string>();
  const zoneFlows = new Set<string>();
  const semanticOwners = new Set<string>();

  for (const action of actions) {
    actionCounts.set(action.actionType, (actionCounts.get(action.actionType) ?? 0) + 1);
    const parent = abilityById.get(action.parentAbilityId);
    if (parent) abilityTypes.add(parent.abilityType);

    for (const z of action.arguments.sourceZone ?? []) {
      zones.add(z);
    }
    for (const z of action.arguments.destinationZone ?? []) {
      zones.add(z);
    }
    const src = action.arguments.sourceZone?.[0];
    const dst = action.arguments.destinationZone?.[0];
    if (src && dst) {
      const flow = zoneFlowKey(src, dst);
      if (flow) zoneFlows.add(flow);
    }
    if (action.semanticOwner) semanticOwners.add(action.semanticOwner);
    if (action.executionContext === "immediate") {
      /* counted in semantic structure */
    }
  }

  return { actionCounts, abilityTypes, zones, zoneFlows, semanticOwners, abilityById };
}

function applySemanticStructureFeatures(
  vec: number[],
  actions: SemanticAction[],
  abilities: SemanticAbility[],
): void {
  const abilityById = new Map(abilities.map((a) => [a.abilityId, a]));

  for (const ability of abilities) {
    if (ability.abilityType === "modal") inc(vec, "ability_modal");
    if (ability.mechanic === "none" && ability.abilityType === "static") {
      const text = ability.abilitySpan.text.toLowerCase();
      if (text.includes("saga")) inc(vec, "ability_saga");
    }
  }

  for (const action of actions) {
    const owner = action.semanticOwner ?? "source_card";
    inc(vec, `semantic_${owner}`);

    if (action.optionalEffect || action.optionalCost) inc(vec, "semantic_optional");
    if (action.arguments.condition) inc(vec, "semantic_conditional");
    if (action.executionContext === "immediate") inc(vec, "semantic_immediate_execution");
    if (action.executionContext === "persistent_permission") inc(vec, "semantic_persistent_permission");

    const parent = abilityById.get(action.parentAbilityId);
    if (parent?.abilityType === "replacement") inc(vec, "semantic_replacement_consequence");
    if (action.actionType === "create_token") inc(vec, "semantic_token_definition");
    if (owner === "granted_object" || owner === "created_object") inc(vec, "semantic_granted_ability");
  }
}

function applyMetadataFeatures(vec: number[], card: GoldenCatalogOracleCard): void {
  for (const c of card.colorIdentity ?? []) {
    if (c === "W" || c === "U" || c === "B" || c === "R" || c === "G") {
      inc(vec, `meta_color_${c}`);
    }
  }
  if ((card.colorIdentity ?? []).length === 0) inc(vec, "meta_colorless");
  if ((card.colorIdentity ?? []).length > 1) inc(vec, "meta_multicolor");

  inc(vec, "meta_mana_value_norm", Math.min(card.manaValue ?? card.cmc ?? 0, 16) / 16);
  if (card.commanderEligibility?.canBeSoleCommander) inc(vec, "meta_commander_eligible");

  const power = card.cardFaces?.[0]?.power ?? undefined;
  const toughness = card.cardFaces?.[0]?.toughness ?? undefined;
  inc(vec, "meta_power_norm", parseNumericStat(power));
  inc(vec, "meta_toughness_norm", parseNumericStat(toughness));

  const layout = card.layout ?? "normal";
  if (layout === "normal") inc(vec, "meta_layout_normal");
  else if (layout === "transform" || layout === "double_faced_token") inc(vec, "meta_layout_transform");
  else if (layout === "modal_dfc") inc(vec, "meta_layout_modal_dfc");
  else if (layout === "split") inc(vec, "meta_layout_split");
  else if (layout === "adventure") inc(vec, "meta_layout_adventure");
  else inc(vec, "meta_layout_other");

  for (const t of card.types ?? []) {
    const key = `obj_${t.toLowerCase()}`;
    if ((OBJECT_TYPE_FEATURES as readonly string[]).includes(key)) inc(vec, key);
  }
  if ((card.types ?? []).includes("Instant") || (card.types ?? []).includes("Sorcery")) {
    inc(vec, "obj_spell");
  }
  if ((card.types ?? []).some((t) => ["Creature", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle"].includes(t))) {
    inc(vec, "obj_permanent");
  }
}

export function buildCardFeatureBundle(input: {
  shadow: ShadowSemanticInput;
  card: GoldenCatalogOracleCard;
}): CardFeatureBundle {
  const { shadow, card } = input;
  const actions = shadow.semantic.actions;
  const abilities = shadow.semantic.abilities;
  const vec = createEmptyFeatureVector();

  const signals = collectActionSignals(actions, abilities);

  for (const [actionType, count] of signals.actionCounts) {
    if ((PRIMITIVE_ACTION_FEATURES as readonly string[]).includes(actionType)) {
      inc(vec, actionType, normalizeCount(count));
    }
  }

  for (const abilityType of signals.abilityTypes) {
    const key = abilityStructureKey(abilityType);
    if (key) inc(vec, key);
  }

  applySemanticStructureFeatures(vec, actions, abilities);

  for (const z of signals.zones) {
    const key = `zone_${z}`;
    if ((ZONE_FEATURES as readonly string[]).includes(key)) inc(vec, key);
  }
  for (const flow of signals.zoneFlows) inc(vec, flow);

  applyMetadataFeatures(vec, card);

  const derived = computeDerivedFeatureVector({
    actions,
    abilities: shadow.semantic.abilities,
    card,
    literalVector: vec,
  });

  const combined = [...vec, ...derived.vector];

  const topActions = [...signals.actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([action]) => action);

  return {
    oracleId: shadow.oracleId,
    literalVector: vec,
    derivedVector: derived.vector,
    combinedVector: combined,
    topActions,
    abilityTypes: [...signals.abilityTypes],
    zones: [...signals.zones],
    zoneFlows: [...signals.zoneFlows],
    semanticOwners: [...signals.semanticOwners],
    derivedRoles: derived.activeRoles,
  };
}

export function normalizeFeatureMatrix(rows: number[][]): number[][] {
  const dim = rows[0]?.length ?? 0;
  const means = new Array(dim).fill(0);
  const stds = new Array(dim).fill(0);

  for (const row of rows) {
    for (let i = 0; i < dim; i++) means[i] += row[i] ?? 0;
  }
  for (let i = 0; i < dim; i++) means[i] /= rows.length || 1;

  for (const row of rows) {
    for (let i = 0; i < dim; i++) {
      const d = (row[i] ?? 0) - means[i];
      stds[i] += d * d;
    }
  }
  for (let i = 0; i < dim; i++) {
    stds[i] = Math.sqrt(stds[i] / (rows.length || 1));
    if (stds[i] < 1e-8) stds[i] = 1;
  }

  return rows.map((row) => row.map((v, i) => (v - means[i]) / stds[i]));
}

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

export function explainNeighborSimilarity(
  a: CardFeatureBundle,
  b: CardFeatureBundle,
): {
  sharedActions: string[];
  sharedZones: string[];
  sharedZoneFlows: string[];
  sharedAbilityTypes: string[];
  sharedSemanticOwners: string[];
  sharedDerivedRoles: string[];
} {
  const sharedActions = a.topActions.filter((x) => b.topActions.includes(x));
  return {
    sharedActions,
    sharedZones: a.zones.filter((z) => b.zones.includes(z)),
    sharedZoneFlows: a.zoneFlows.filter((z) => b.zoneFlows.includes(z)),
    sharedAbilityTypes: a.abilityTypes.filter((t) => b.abilityTypes.includes(t)),
    sharedSemanticOwners: a.semanticOwners.filter((o) => b.semanticOwners.includes(o)),
    sharedDerivedRoles: a.derivedRoles.filter((r) => b.derivedRoles.includes(r)),
  };
}

export { DERIVED_ROLE_NAMES, featureIndex, METADATA_FEATURES };
