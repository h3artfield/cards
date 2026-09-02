import { MODEL_D_FEATURE_SPEC } from "./model-d-feature-spec-v1";

/** Fixed mechanical channels — selected from card-interaction-profile-v1 pressure pairs, not from Model C TEST coefficients. */
export const SEMANTIC_MATCHUP_CHANNELS = [
  {
    name: "graveyard_dep_vs_graveyard_disruption",
    myKey: "rc8_dep_graveyard_dependent",
    oppKey: "rc8_attack_graveyard_disruption",
  },
  {
    name: "spell_chain_dep_vs_counterspell",
    myKey: "rc8_dep_spell_chain_dependent",
    oppKey: "rc8_attack_counterspell",
  },
  {
    name: "battlefield_dep_vs_board_reset",
    myKey: "rc8_dep_battlefield_dependent",
    oppKey: "rc8_attack_board_reset",
  },
  {
    name: "artifact_dep_vs_artifact_interaction",
    myKey: "rc8_dep_artifact_dependent",
    oppKey: "rc8_attack_artifact_interaction",
  },
  {
    name: "creature_dep_vs_creature_removal",
    myKey: "rc8_dep_creature_dependent",
    oppKey: "rc8_attack_creature_removal",
  },
  {
    name: "library_search_dep_vs_resource_denial",
    myKey: "rc8_dep_library_search_dependent",
    oppKey: "rc8_attack_resource_denial",
  },
  {
    name: "activated_dep_vs_ability_denial",
    myKey: "rc8_dep_activated_ability_dependent",
    oppKey: "rc8_attack_ability_denial",
  },
  {
    name: "graveyard_dep_vs_exile_removal",
    myKey: "rc8_dep_graveyard_dependent",
    oppKey: "rc8_attack_exile_removal",
  },
  {
    name: "token_profile_vs_board_reset",
    myKey: "rc8_role_token",
    oppKey: "rc8_attack_board_reset",
  },
  {
    name: "card_engine_vs_resource_denial",
    myKey: "rc8_attack_card_engine",
    oppKey: "rc8_attack_resource_denial",
  },
  {
    name: "recursion_vs_graveyard_disruption",
    myKey: "rc8_attack_recursion",
    oppKey: "rc8_attack_graveyard_disruption",
  },
  {
    name: "attack_vuln_dot",
    myKeysPrefix: "rc8_attack_",
    oppKeysPrefix: "rc8_vuln_",
    dotProduct: true,
  },
] as const;

export const SEMANTIC_MATCHUP_REDUCERS = MODEL_D_FEATURE_SPEC.d1SemanticMatchup
  .reducers as readonly string[];

export function semanticMatchupFeatureNames(): string[] {
  const names: string[] = [];
  for (const channel of SEMANTIC_MATCHUP_CHANNELS) {
    for (const reducer of SEMANTIC_MATCHUP_REDUCERS) {
      if ("dotProduct" in channel && channel.dotProduct) {
        names.push(`match_attack_vuln_dot_${reducer}`);
      } else {
        names.push(`match_${channel.name}_${reducer}`);
      }
    }
  }
  return names;
}

function channelScalar(
  channel: (typeof SEMANTIC_MATCHUP_CHANNELS)[number],
  myDeck: Record<string, number>,
  oppDeck: Record<string, number>,
): number {
  if ("dotProduct" in channel && channel.dotProduct) {
    let sum = 0;
    for (const [key, myVal] of Object.entries(myDeck)) {
      if (!key.startsWith(channel.myKeysPrefix)) continue;
      const suffix = key.slice(channel.myKeysPrefix.length);
      const oppVal = oppDeck[`${channel.oppKeysPrefix}${suffix}`] ?? 0;
      sum += myVal * oppVal;
    }
    return sum;
  }
  const myVal = myDeck[channel.myKey] ?? 0;
  const oppVal = oppDeck[channel.oppKey] ?? 0;
  return myVal * oppVal;
}

export function buildSemanticMatchupFeatures(input: {
  myDeckFeatures: Record<string, number>;
  opponentDeckFeatures: Array<Record<string, number>>;
}): Record<string, number> {
  const oppCount = input.opponentDeckFeatures.length;
  const out = Object.fromEntries(semanticMatchupFeatureNames().map((name) => [name, 0]));
  if (oppCount === 0) return out;

  for (const channel of SEMANTIC_MATCHUP_CHANNELS) {
    const perOpp = input.opponentDeckFeatures.map((opp) =>
      channelScalar(channel, input.myDeckFeatures, opp),
    );
    const mean = perOpp.reduce((a, b) => a + b, 0) / oppCount;
    const max = Math.max(...perOpp);
    const min = Math.min(...perOpp);
    const baseName =
      "dotProduct" in channel && channel.dotProduct
        ? "match_attack_vuln_dot"
        : `match_${channel.name}`;
    out[`${baseName}_meanAcrossOpponents`] = mean;
    out[`${baseName}_maxAcrossOpponents`] = max;
    out[`${baseName}_minAcrossOpponents`] = min;
  }
  return out;
}
