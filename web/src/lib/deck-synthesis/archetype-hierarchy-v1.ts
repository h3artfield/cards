/**
 * Archetype hierarchy — sub-archetype relationships (Phase 5.2).
 */
export const ARCHETYPE_SUB_ARCHETYPE_MAP_V1: Record<string, string[]> = {
  sacrifice_death_trigger_engine: ["treasure_sacrifice_engine"],
  graveyard_recursion_engine: ["self_mill_graveyard_engine"],
  exile_cast_engine: ["exile_impulse_engine"],
  voltron_combat_engine: ["aura_voltron_engine"],
  counters_proliferate_engine: ["superfriends_engine"],
  artifact_value_engine: ["treasure_sacrifice_engine", "mana_ability_combo_engine"],
  token_swarm_engine: ["sacrifice_death_trigger_engine"],
  spellslinger_chain_engine: ["exile_impulse_engine"],
};

export function subArchetypesForPrimary(primaryPatternId: string, candidatePatternIds: string[]): string[] {
  const allowed = new Set(ARCHETYPE_SUB_ARCHETYPE_MAP_V1[primaryPatternId] ?? []);
  return candidatePatternIds.filter((id) => allowed.has(id));
}
