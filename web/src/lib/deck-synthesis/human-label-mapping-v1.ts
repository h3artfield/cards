/**
 * Post-hoc human label mapping — mechanical signature first, taxonomy second.
 */
import { strategyTaxonomyById, themeEntries } from "../commander-strategy/taxonomy/index";
import type { EnginePatternDef } from "./archetype-discovery-types-v1";

const PATTERN_TO_TAXONOMY: Record<string, string[]> = {
  graveyard_recursion_engine: ["theme-reanimator", "theme-self-mill"],
  sacrifice_death_trigger_engine: ["theme-aristocrats", "theme-life-drain"],
  token_swarm_engine: ["theme-tokens", "theme-overrun"],
  spellslinger_chain_engine: ["theme-spellslinger", "theme-storm"],
  artifact_value_engine: ["theme-artifacts"],
  voltron_combat_engine: ["theme-voltron"],
  control_interaction_engine: ["archetype-control", "theme-draw-go"],
  combo_tutor_engine: ["archetype-combo", "theme-toolbox"],
  enchantress_value_engine: ["theme-enchantress"],
  landfall_ramp_engine: ["theme-lands-matter", "theme-ramp"],
  etb_blink_value_engine: ["theme-blink"],
  exile_cast_engine: ["theme-cheat-cast"],
  mill_library_engine: ["theme-mill"],
  counters_proliferate_engine: ["theme-counters"],
  stax_resource_denial_engine: ["archetype-stax", "theme-taxes"],
  aura_voltron_engine: ["theme-voltron"],
  treasure_sacrifice_engine: ["theme-artifacts", "theme-aristocrats"],
  superfriends_engine: ["theme-superfriends"],
  self_mill_graveyard_engine: ["theme-self-mill", "theme-reanimator"],
  legendary_tribal_engine: ["theme-legendary"],
  mana_ability_combo_engine: ["archetype-combo"],
  exile_impulse_engine: ["theme-cheat-cast"],
  ninja_tempo_engine: ["theme-ninjutsu"],
  group_slug_punisher_engine: ["archetype-group-slug"],
  goodstuff_value_engine: ["archetype-good-stuff", "theme-card-draw"],
};

const PATTERN_ROLE_HINTS: Record<string, string[]> = {
  graveyard_recursion_engine: ["reanimation", "recursion", "graveyard_setup"],
  sacrifice_death_trigger_engine: ["sacrifice_outlet", "sacrifice_payoff"],
  token_swarm_engine: ["token_generation"],
  spellslinger_chain_engine: ["spell_copying"],
  artifact_value_engine: ["ramp", "tutor"],
  voltron_combat_engine: ["combat_payoff", "protection"],
  control_interaction_engine: ["countermagic", "removal"],
  combo_tutor_engine: ["tutor"],
  enchantress_value_engine: ["card_draw"],
  landfall_ramp_engine: ["ramp"],
  etb_blink_value_engine: ["blink_flicker"],
  exile_cast_engine: ["cast_from_exile"],
  mill_library_engine: ["mill"],
  group_slug_punisher_engine: ["life_loss"],
  aura_voltron_engine: ["combat_payoff"],
  treasure_sacrifice_engine: ["sacrifice_payoff"],
  superfriends_engine: ["card_draw"],
  self_mill_graveyard_engine: ["graveyard_setup"],
  legendary_tribal_engine: ["tutor"],
  mana_ability_combo_engine: ["ramp"],
  exile_impulse_engine: ["cast_from_exile"],
  ninja_tempo_engine: ["combat_manipulation"],
  goodstuff_value_engine: ["card_draw", "removal"],
};

export function mapMechanicalPatternToHumanLabel(input: {
  pattern: EnginePatternDef;
  commanderRoles: Record<string, number>;
}): { humanLabel: string; humanLabelConfidence: number; humanLabelSource: "taxonomy" | "generated" } {
  const taxonomy = strategyTaxonomyById();
  const candidates = PATTERN_TO_TAXONOMY[input.pattern.patternId] ?? [];
  let bestId: string | null = null;
  let bestScore = 0;

  for (const strategyId of candidates) {
    const entry = taxonomy.get(strategyId);
    if (!entry) continue;
    const hints = PATTERN_ROLE_HINTS[input.pattern.patternId] ?? [];
    let score = 0.5;
    for (const hint of hints) {
      if ((input.commanderRoles[hint] ?? 0) > 0) score += 0.15;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = strategyId;
    }
  }

  if (bestId && bestScore >= 0.55) {
    const entry = taxonomy.get(bestId)!;
    return {
      humanLabel: entry.canonicalName,
      humanLabelConfidence: Math.min(0.95, bestScore),
      humanLabelSource: "taxonomy",
    };
  }

  const themeFallback = themeEntries().find((t) =>
    input.pattern.mechanicalName.toLowerCase().includes(t.canonicalName.toLowerCase().split(" ")[0] ?? ""),
  );
  if (themeFallback) {
    return {
      humanLabel: themeFallback.canonicalName,
      humanLabelConfidence: 0.45,
      humanLabelSource: "taxonomy",
    };
  }

  return {
    humanLabel: input.pattern.mechanicalName,
    humanLabelConfidence: 0.35,
    humanLabelSource: "generated",
  };
}
