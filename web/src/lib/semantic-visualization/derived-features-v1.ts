import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";

/** Layer 3 derived deckbuilding roles — visualization only, versioned separately. */
export const DERIVED_ROLE_NAMES = [
  "removal",
  "board_interaction",
  "card_draw",
  "card_advantage",
  "ramp",
  "mana_generation",
  "recursion",
  "reanimation",
  "token_generation",
  "sacrifice_outlet",
  "sacrifice_payoff",
  "blink_flicker",
  "graveyard_setup",
  "cast_from_exile",
  "spell_copying",
  "countermagic",
  "counter_synergy",
  "combat_manipulation",
  "life_gain",
  "life_loss",
  "mill",
  "tutor",
  "protection",
  "board_wipe",
  "cost_reduction",
  "copy_effects",
  "combat_payoff",
] as const;

export type DerivedRoleName = (typeof DERIVED_ROLE_NAMES)[number];

export type DerivedFeatureResult = {
  vector: number[];
  activeRoles: DerivedRoleName[];
};

function hasAction(actions: SemanticAction[], ...types: string[]): boolean {
  return actions.some((a) => types.includes(a.actionType));
}

function hasActionFromZone(actions: SemanticAction[], zone: string): boolean {
  return actions.some((a) => (a.arguments.sourceZone ?? []).includes(zone));
}

function hasActionToZone(actions: SemanticAction[], zone: string): boolean {
  return actions.some((a) => (a.arguments.destinationZone ?? []).includes(zone));
}

function hasFlow(actions: SemanticAction[], from: string, to: string): boolean {
  return actions.some(
    (a) =>
      (a.arguments.sourceZone ?? []).includes(from) &&
      (a.arguments.destinationZone ?? []).includes(to),
  );
}

function hasAbilityType(abilities: SemanticAbility[], type: string): boolean {
  return abilities.some((a) => a.abilityType === type);
}

export function computeDerivedFeatureVector(input: {
  actions: SemanticAction[];
  abilities: SemanticAbility[];
  card: GoldenCatalogOracleCard;
  literalVector: number[];
}): DerivedFeatureResult {
  const { actions, abilities, card } = input;
  const vec = new Array(DERIVED_ROLE_NAMES.length).fill(0);
  const active: DerivedRoleName[] = [];

  const setRole = (role: DerivedRoleName, strength = 1) => {
    const idx = DERIVED_ROLE_NAMES.indexOf(role);
    if (idx < 0) return;
    vec[idx] = Math.max(vec[idx], strength);
    if (strength > 0 && !active.includes(role)) active.push(role);
  };

  const removalActions = hasAction(actions, "destroy", "exile", "deal_damage", "sacrifice");
  const targetsBattlefield =
    hasActionToZone(actions, "graveyard") ||
    hasActionToZone(actions, "exile") ||
    actions.some((a) => a.arguments.object?.zone === "battlefield");

  if (removalActions && targetsBattlefield) setRole("removal");
  if (removalActions || hasAction(actions, "tap", "put_counter")) setRole("board_interaction", 0.8);

  if (hasAction(actions, "draw")) setRole("card_draw");
  if (hasAction(actions, "draw", "put_into_hand", "search_library")) setRole("card_advantage");

  if (hasAction(actions, "add_mana") || (card.producedMana?.length ?? 0) > 0) {
    setRole("ramp");
    setRole("mana_generation");
  }

  if (
    hasAction(actions, "return_to_hand", "return_to_battlefield", "play", "cast") &&
    (hasActionFromZone(actions, "graveyard") || hasActionFromZone(actions, "exile"))
  ) {
    setRole("recursion");
  }

  if (hasFlow(actions, "graveyard", "battlefield") || hasAction(actions, "return_to_battlefield")) {
    setRole("reanimation");
  }

  if (hasAction(actions, "create_token")) setRole("token_generation");

  if (hasAction(actions, "sacrifice") && hasAbilityType(abilities, "activated")) {
    setRole("sacrifice_outlet");
  }
  if (
    hasAction(actions, "sacrifice") &&
    (hasAbilityType(abilities, "triggered") || card.oracleText?.toLowerCase().includes("whenever"))
  ) {
    setRole("sacrifice_payoff");
  }

  if (hasFlow(actions, "battlefield", "exile") && hasAction(actions, "return_to_battlefield")) {
    setRole("blink_flicker");
  }
  if (hasAction(actions, "mill") || hasActionToZone(actions, "graveyard")) {
    setRole("graveyard_setup", 0.7);
  }

  if (hasActionFromZone(actions, "exile") && hasAction(actions, "cast", "play")) {
    setRole("cast_from_exile");
  }

  if (hasAction(actions, "copy")) {
    setRole("spell_copying");
    setRole("copy_effects");
  }

  if (hasAction(actions, "counter")) setRole("countermagic");
  if (hasAction(actions, "counter") && hasAbilityType(abilities, "triggered")) {
    setRole("counter_synergy");
  }

  if (hasAction(actions, "tap", "untap", "put_counter", "deal_damage")) {
    setRole("combat_manipulation", 0.6);
  }
  if (hasAction(actions, "deal_damage") && card.types.includes("Creature")) {
    setRole("combat_payoff");
  }

  if (hasAction(actions, "gain_life")) setRole("life_gain");
  if (hasAction(actions, "lose_life")) setRole("life_loss");
  if (hasAction(actions, "mill")) setRole("mill");
  if (hasAction(actions, "search_library")) setRole("tutor");

  const oracle = (card.oracleText ?? "").toLowerCase();
  if (/hexproof|indestructible|protection from|can't be (?:countered|destroyed)/.test(oracle)) {
    setRole("protection");
  }
  if (/costs?\s+\{?\d*\}? less|reduce.*cost/.test(oracle)) {
    setRole("cost_reduction");
  }

  if (
    hasAction(actions, "destroy") &&
    actions.some((a) => a.arguments.affectedPlayer === "each_player" || a.arguments.affectedPlayer === "each_opponent")
  ) {
    setRole("board_wipe");
  }

  return { vector: vec, activeRoles: active };
}
