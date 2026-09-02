/**
 * Pattern prerequisite gates — REQUIRED / SUPPORTING / DISQUALIFYING evidence.
 */
import type { CommanderMechanicalProfile } from "./archetype-discovery-types-v1";
import type { CommanderCausalRoleProfile } from "./commander-causal-roles-v1";

export type PatternPrerequisiteSpec = {
  requiredAny: string[];
  supporting: string[];
  disqualifyingIfOnly: string[];
  /** Minimum driverSupport to surface as primary (0–1). */
  minDriverSupport?: number;
  /** Payoff-only without driver is rejected when true. */
  rejectPayoffOnlyPrimary?: boolean;
};

export const PATTERN_PREREQUISITES_V1: Record<string, PatternPrerequisiteSpec> = {
  token_swarm_engine: {
    requiredAny: [
      "create_token",
      "tokens",
      "token_generation",
      "token_multiplier",
      "token_payoff",
    ],
    supporting: ["combat_attacks", "sacrifice_trigger"],
    disqualifyingIfOnly: ["card_draw", "mana", "generic_value"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  spellslinger_chain_engine: {
    requiredAny: ["cast_trigger", "spell_casts", "instant_sorcery", "copy", "cast_or_play"],
    supporting: ["create_token", "draw"],
    disqualifyingIfOnly: ["create_token", "tokens"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  sacrifice_death_trigger_engine: {
    requiredAny: ["sacrifice_trigger", "sacrifices", "sacrifice_outlet", "sacrifice_payoff", "death_trigger_amplify"],
    supporting: ["dies_trigger", "creature_deaths", "create_token"],
    disqualifyingIfOnly: ["creature_deaths", "dies_trigger", "card_draw", "tokens", "create_token"],
    minDriverSupport: 0.32,
    rejectPayoffOnlyPrimary: true,
  },
  artifact_value_engine: {
    requiredAny: [
      "artifact_tokens",
      "artifact_sacrifice",
      "artifact_cast",
      "artifact_count",
      "artifact_etb",
      "artifact_tap",
      "activated_ability",
    ],
    supporting: ["mana", "tutor"],
    disqualifyingIfOnly: ["mana", "create_token", "card_draw"],
    minDriverSupport: 0.38,
    rejectPayoffOnlyPrimary: true,
  },
  voltron_combat_engine: {
    requiredAny: ["auras_equipment", "commander_combat_scaling", "aura_cast", "equipment_attach"],
    supporting: ["combat_attacks", "combat_manipulation"],
    disqualifyingIfOnly: ["card_draw", "combat_attacks"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  aura_voltron_engine: {
    requiredAny: ["auras_equipment", "aura_cast", "equipment_attach"],
    supporting: ["combat_attacks", "combat_manipulation"],
    disqualifyingIfOnly: ["artifacts", "combat_attacks"],
    minDriverSupport: 0.38,
    rejectPayoffOnlyPrimary: true,
  },
  group_slug_punisher_engine: {
    requiredAny: ["opponent_action_punish", "tax", "forced_choice", "opponent_damage", "life_loss_pressure"],
    supporting: ["static_modifier", "damage"],
    disqualifyingIfOnly: ["card_draw", "combat_attacks"],
    minDriverSupport: 0.38,
    rejectPayoffOnlyPrimary: true,
  },
  exile_cast_engine: {
    requiredAny: ["cast_from_exile", "exiled_cards", "cast_from_exile_top"],
    supporting: ["spell_casts", "cast_trigger"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  exile_impulse_engine: {
    requiredAny: ["cast_from_exile", "exiled_cards", "impulse_exile"],
    supporting: ["artifact_tokens", "treasure"],
    disqualifyingIfOnly: ["create_token", "tokens"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  graveyard_recursion_engine: {
    requiredAny: ["cast_from_graveyard", "graveyard_permanents", "recursion", "reanimation"],
    supporting: ["creature_deaths", "mill"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.32,
    rejectPayoffOnlyPrimary: false,
  },
  self_mill_graveyard_engine: {
    requiredAny: ["mill", "library_to_graveyard", "cast_from_graveyard", "self_mill"],
    supporting: ["recursion"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: false,
  },
  treasure_sacrifice_engine: {
    requiredAny: ["artifact_tokens", "sacrifice", "sacrifices", "treasure"],
    supporting: ["mana", "damage"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: false,
  },
  superfriends_engine: {
    requiredAny: ["planeswalkers", "proliferate", "loyalty_payoff"],
    supporting: ["counters"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: false,
  },
  legendary_tribal_engine: {
    requiredAny: ["legendary_permanents", "legendary_cast", "legendary_tutor", "historic"],
    supporting: ["combat_attacks"],
    disqualifyingIfOnly: ["exiled_cards"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  mana_ability_combo_engine: {
    requiredAny: ["activated_ability", "mana", "untap", "nonland_tap"],
    supporting: ["artifact_tokens"],
    disqualifyingIfOnly: ["land_drops"],
    minDriverSupport: 0.38,
    rejectPayoffOnlyPrimary: true,
  },
  ninja_tempo_engine: {
    requiredAny: ["ninjutsu"],
    supporting: ["combat_attacks", "top_library", "combat_damage_trigger"],
    disqualifyingIfOnly: ["etb_trigger", "combat_attacks"],
    minDriverSupport: 0.38,
    rejectPayoffOnlyPrimary: true,
  },
  enchantress_value_engine: {
    requiredAny: ["enchantment_cast", "enchantment_etb", "enchantment_payoff"],
    supporting: ["cast_trigger", "card_draw"],
    disqualifyingIfOnly: ["card_draw", "creatures"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  landfall_ramp_engine: {
    requiredAny: ["landfall_trigger", "land_drops", "creature_spells"],
    supporting: ["ramp", "create_token", "card_draw"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.3,
    rejectPayoffOnlyPrimary: false,
  },
  etb_blink_value_engine: {
    requiredAny: ["etb_trigger", "permanents_etb", "blink_flicker"],
    supporting: ["recursion"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  control_interaction_engine: {
    requiredAny: ["countermagic", "removal", "static_modifier"],
    supporting: ["card_draw"],
    disqualifyingIfOnly: ["combat_attacks"],
    minDriverSupport: 0.38,
    rejectPayoffOnlyPrimary: true,
  },
  combo_tutor_engine: {
    requiredAny: ["tutor", "combo_piece"],
    supporting: ["cast_trigger"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.4,
    rejectPayoffOnlyPrimary: true,
  },
  mill_library_engine: {
    requiredAny: ["mill", "library_to_graveyard"],
    supporting: ["recursion"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  counters_proliferate_engine: {
    requiredAny: ["counters", "proliferate"],
    supporting: ["combat_attacks"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.35,
    rejectPayoffOnlyPrimary: true,
  },
  stax_resource_denial_engine: {
    requiredAny: ["tax", "static_modifier", "opponent_action_punish"],
    supporting: ["countermagic"],
    disqualifyingIfOnly: ["card_draw"],
    minDriverSupport: 0.25,
    rejectPayoffOnlyPrimary: false,
  },
  goodstuff_value_engine: {
    requiredAny: ["broad_flexibility"],
    supporting: ["multiple_axes"],
    disqualifyingIfOnly: ["single_axis"],
    minDriverSupport: 0.55,
    rejectPayoffOnlyPrimary: false,
  },
};

export type PrerequisiteEvaluation = {
  passes: boolean;
  requiredMet: boolean;
  disqualified: boolean;
  detail: string;
};

function tagPresent(tag: string, causal: CommanderCausalRoleProfile, profile: CommanderMechanicalProfile): boolean {
  if (tag === "broad_flexibility") return causal.broadFlexibilityScore >= 0.55;
  if (tag === "multiple_axes") return causal.engineInputs.length >= 3 && causal.engineTriggers.length >= 2;
  if (tag === "single_axis") return causal.engineInputs.length <= 1 && causal.engineTriggers.length <= 1;
  if (tag === "token_generation") return (profile.derivedRoles.token_generation ?? 0) > 0;
  if (tag === "sacrifice_payoff") return (profile.derivedRoles.sacrifice_payoff ?? 0) > 0;
  if (tag === "sacrifice_outlet") return (profile.derivedRoles.sacrifice_outlet ?? 0) > 0;
  if (tag === "instant_sorcery") return (profile.derivedRoles.spellslinger ?? 0) > 0 || causal.engineInputs.includes("spell_casts");
  if (tag === "recursion") return (profile.derivedRoles.recursion ?? 0) > 0 || (profile.derivedRoles.reanimation ?? 0) > 0;
  if (tag === "ninjutsu") return causal.permissions.includes("ninjutsu") || causal.engineActions.includes("ninjutsu");
  if (tag === "enchantment_cast") return profile.enchantmentSignals.castEnchantmentTrigger > 0;
  if (tag === "enchantment_etb") return profile.enchantmentSignals.enchantmentEtBTrigger > 0;
  if (tag === "enchantment_payoff") return profile.enchantmentSignals.enchantmentPayoff > 0;
  if (tag === "blink_flicker") return (profile.derivedRoles.blink_flicker ?? 0) > 0;
  if (tag === "combo_piece") return (profile.derivedRoles.tutor ?? 0) > 0 && profile.causalRoles.repeatability > 0.5;
  if (tag === "sacrifice_outlet") return (profile.derivedRoles.sacrifice_outlet ?? 0) > 0;
  if (tag === "countermagic") return (profile.derivedRoles.countermagic ?? 0) > 0;
  if (tag === "removal") return (profile.derivedRoles.removal ?? 0) > 0;
  if (tag === "permanents_etb") return causal.engineInputs.includes("permanents_etb");
  if (tag === "landfall_trigger") return causal.engineTriggers.includes("landfall_trigger");
  if (tag === "land_drops") return causal.engineInputs.includes("land_drops");
  if (tag === "etb_trigger") return causal.engineTriggers.includes("etb_trigger");
  if (tag === "proliferate") return causal.engineActions.includes("proliferate");
  if (tag === "counters") return causal.engineOutputs.includes("counters");
  if (tag === "mill") {
    return (
      causal.engineActions.includes("mill") ||
      causal.engineInputs.includes("library_to_graveyard") ||
      (profile.derivedRoles.mill ?? 0) > 0
    );
  }
  if (tag === "library_to_graveyard") {
    return causal.engineInputs.includes("library_to_graveyard") || (profile.derivedRoles.mill ?? 0) > 0;
  }
  if (tag === "cast_from_exile") {
    return causal.permissions.includes("cast_from_exile") || (profile.derivedRoles.cast_from_exile ?? 0) > 0;
  }
  if (tag === "impulse_exile") {
    return causal.permissions.includes("cast_from_exile") || (profile.derivedRoles.cast_from_exile ?? 0) > 0;
  }
  if (tag === "cast_from_exile_top") {
    return causal.permissions.includes("cast_from_exile") || (profile.derivedRoles.cast_from_exile ?? 0) > 0;
  }
  if (tag === "reanimation") return causal.enginePayoffs.includes("reanimation") || (profile.derivedRoles.reanimation ?? 0) > 0;
  if (tag === "creature_spells") return causal.engineInputs.includes("creature_spells");
  if (tag === "combat_manipulation") return (profile.derivedRoles.combat_manipulation ?? 0) > 0;
  if (tag === "treasure") return causal.resourcesProduced.includes("artifact_tokens");
  if (tag === "top_library") return profile.topActions.includes("scry") || profile.derivedRoles.card_draw > 0;
  if (tag === "opponent_action_punish") {
    const textRoles = profile.evidenceRefs.some((e) => e.rule.includes("punish") || e.rule.includes("tax"));
    return textRoles || causal.enginePayoffs.includes("damage");
  }
  if (tag === "tax") return causal.engineConditions.includes("tax");
  if (tag === "death_trigger_amplify") return causal.engineConditions.includes("death_trigger_amplify");
  if (tag === "commander_combat_scaling") {
    return (profile.derivedRoles.combat_payoff ?? 0) > 0 && profile.causalRoles.engineInputs.includes("auras_equipment");
  }
  if (tag === "aura_cast") return profile.evidenceRefs.some((e) => e.rule.includes("aura"));
  if (tag === "equipment_attach") return profile.evidenceRefs.some((e) => e.rule.includes("equipment"));
  if (tag === "loyalty_payoff") return causal.engineInputs.includes("planeswalkers");
  if (tag === "legendary_cast") return causal.engineInputs.includes("legendary_permanents");
  if (tag === "legendary_tutor") return (profile.derivedRoles.tutor ?? 0) > 0 && causal.engineInputs.includes("legendary_permanents");
  if (tag === "historic") return causal.engineInputs.includes("legendary_permanents");
  if (tag === "impulse_exile") return causal.permissions.includes("cast_from_exile") || (profile.derivedRoles.cast_from_exile ?? 0) > 0;
  if (tag === "cast_from_exile_top") return causal.permissions.includes("cast_from_exile") || (profile.derivedRoles.cast_from_exile ?? 0) > 0;
  if (tag === "self_mill") return causal.engineActions.includes("mill");
  if (tag === "untap") return profile.topActions.includes("untap");
  if (tag === "nonland_tap") return causal.engineActions.includes("activated_ability");
  if (tag === "combat_damage_trigger") return causal.engineTriggers.includes("attack_trigger");
  if (tag === "artifact_sacrifice") return causal.engineCosts.includes("sacrifice") && causal.resourcesProduced.includes("artifact_tokens");
  if (tag === "artifact_cast") return causal.engineTriggers.includes("cast_trigger");
  if (tag === "artifact_etb") return causal.engineTriggers.includes("etb_trigger");
  if (tag === "artifact_count") return (profile.commandZoneIpv2_1["ipv2_1_cmd_artifacts_reliance"] ?? 0) > 0.3;
  if (tag === "artifact_tap") return causal.engineActions.includes("activated_ability");
  if (tag === "token_multiplier") return (profile.derivedRoles.token_generation ?? 0) > 0 && causal.repeatability > 0.4;
  if (tag === "token_payoff") return (profile.derivedRoles.combat_payoff ?? 0) > 0;
  if (tag === "life_loss_pressure") return causal.enginePayoffs.includes("damage");
  if (tag === "forced_choice") return false;
  if (tag === "opponent_damage") return causal.enginePayoffs.includes("damage");
  if (tag === "generic_value") return (profile.derivedRoles.card_draw ?? 0) > 0;
  if (tag === "card_draw") return causal.engineOutputs.includes("card_draw") || (profile.derivedRoles.card_draw ?? 0) > 0;
  if (tag === "mana") return causal.resourcesProduced.includes("mana") || (profile.derivedRoles.ramp ?? 0) > 0;
  if (tag === "create_token") return causal.engineOutputs.includes("create_token") || causal.resourcesProduced.includes("tokens");
  if (tag === "tokens") return causal.resourcesProduced.includes("tokens");
  if (tag === "draw") return causal.engineOutputs.includes("card_draw");
  if (tag === "artifacts") return (profile.commandZoneIpv2_1["ipv2_1_cmd_artifacts_reliance"] ?? 0) > 0.2;

  const allCausal = [
    ...causal.engineInputs,
    ...causal.engineTriggers,
    ...causal.engineActions,
    ...causal.engineOutputs,
    ...causal.enginePayoffs,
    ...causal.resourcesProduced,
    ...causal.permissions,
    ...causal.engineCosts,
  ];
  return allCausal.includes(tag);
}

export function evaluatePatternPrerequisites(input: {
  patternId: string;
  causal: CommanderCausalRoleProfile;
  profile: CommanderMechanicalProfile;
  driverSupport: number;
  payoffSupport: number;
}): PrerequisiteEvaluation {
  const spec = PATTERN_PREREQUISITES_V1[input.patternId];
  if (!spec) {
    const driverOk = input.driverSupport >= 0.28;
    return {
      passes: driverOk,
      requiredMet: driverOk,
      disqualified: !driverOk,
      detail: driverOk ? "default_driver_threshold" : "default_insufficient_driver",
    };
  }

  const requiredMet =
    spec.requiredAny.length === 0 ||
    spec.requiredAny.some((tag) => tagPresent(tag, input.causal, input.profile));

  const onlyDisqualifying =
    spec.disqualifyingIfOnly.length > 0 &&
    !requiredMet &&
    spec.disqualifyingIfOnly.some((tag) => tagPresent(tag, input.causal, input.profile));

  const driverOk = input.driverSupport >= (spec.minDriverSupport ?? 0.25);
  const payoffOnly =
    spec.rejectPayoffOnlyPrimary &&
    input.payoffSupport >= 0.35 &&
    input.driverSupport < 0.25;

  const passes = requiredMet && !onlyDisqualifying && driverOk && !payoffOnly;

  return {
    passes,
    requiredMet,
    disqualified: onlyDisqualifying || payoffOnly,
    detail: !requiredMet
      ? "required_evidence_missing"
      : onlyDisqualifying
        ? "disqualifying_incidental_only"
        : payoffOnly
          ? "payoff_only_primary_rejected"
          : !driverOk
            ? "insufficient_driver_support"
            : "ok",
  };
}
