/**
 * Composable mechanical motifs — derived from frozen RC8 causal tags.
 * General vocabulary; NOT commander-specific pattern exceptions.
 */
import type { CommanderMechanicalProfile } from "./archetype-discovery-types-v1";
import type { CommanderCausalRoleProfile } from "./commander-causal-roles-v1";

export type MotifCausalPosition = "DRIVER" | "CONDITION" | "ENGINE" | "OUTPUT" | "PAYOFF";

export type MechanicalMotifId =
  | "ATTACK_TRIGGER"
  | "COMBAT_DAMAGE_TRIGGER"
  | "CREATURE_CHEAT"
  | "LIFE_GAIN"
  | "LIFE_GAIN_PAYOFF"
  | "DAMAGE_TO_OPPONENTS"
  | "ETB_PAYOFF"
  | "DEATH_PAYOFF"
  | "COUNTER_PLACEMENT"
  | "COUNTER_PAYOFF"
  | "ACTIVATED_MANA_ENGINE"
  | "TRIGGERED_MANA_ENGINE"
  | "STATIC_MANA_MODIFIER"
  | "OPPONENT_LIFE_LOSS"
  | "POSTCOMBAT_TRIGGER"
  | "MANA_GENERATION"
  | "POSTCOMBAT_MANA_CONVERSION"
  | "UNTAP_ENGINE"
  | "CAST_FROM_EXILE"
  | "CAST_FROM_LIBRARY_TOP"
  | "GRAVEYARD_SETUP"
  | "GRAVEYARD_RECURSION"
  | "LEGENDARY_PRESENCE"
  | "TOP_LIBRARY_MANIPULATION"
  | "BLINK_ETB"
  | "SPELL_CAST_TRIGGER"
  | "TOKEN_GENERATION"
  | "TOKEN_CONVERSION"
  | "SACRIFICE_ENGINE"
  | "ARTIFACT_ENGINE"
  | "AURA_EQUIPMENT"
  | "LANDFALL_ENGINE"
  | "MILL_ENGINE"
  | "DRAW_ENGINE"
  | "TUTOR_ENGINE"
  | "PROLIFERATE_ENGINE"
  | "STATIC_TAX"
  | "SPELL_PUNISHMENT"
  | "COUNTER_SPELL"
  | "CREATURE_REMOVAL"
  | "PROTECTION_PROVIDER"
  | "STATIC_PROTECTION"
  | "STATE_SCALING"
  | "CONVOKE_COST"
  | "COMBAT_BUFF";

export type ExtractedMotif = {
  motifId: MechanicalMotifId;
  causalPosition: MotifCausalPosition;
  strength: number;
  evidence: string[];
};

type MotifRule = {
  motifId: MechanicalMotifId;
  causalPosition: MotifCausalPosition;
  minStrength: number;
  score: (input: { causal: CommanderCausalRoleProfile; profile: CommanderMechanicalProfile }) => { strength: number; evidence: string[] };
};

function hasAny(causal: CommanderCausalRoleProfile, ...tags: string[]): boolean {
  const all = [
    ...causal.engineInputs,
    ...causal.engineTriggers,
    ...causal.engineActions,
    ...causal.engineOutputs,
    ...causal.enginePayoffs,
    ...causal.resourcesProduced,
    ...causal.engineConditions,
    ...causal.permissions,
  ];
  return tags.some((t) => all.includes(t));
}

function roleStrength(profile: CommanderMechanicalProfile, role: string): number {
  return profile.derivedRoles[role] ?? 0;
}

const MOTIF_RULES: MotifRule[] = [
  {
    motifId: "ATTACK_TRIGGER",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: hasAny(causal, "attack_trigger", "combat_attacks") ? 0.85 : 0,
      evidence: ["attack_trigger"],
    }),
  },
  {
    motifId: "COMBAT_DAMAGE_TRIGGER",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        hasAny(causal, "combat_damage_trigger", "combat_damage", "combat_damage_conversion") ? 0.88 : 0,
        causal.engineActions.includes("combat_mana_engine") ? 0.9 : 0,
        hasAny(causal, "attack_trigger", "combat_attacks") &&
        hasAny(causal, "combat_damage_trigger", "combat_damage") &&
        roleStrength(profile, "combat_payoff") > 0
          ? 0.8
          : 0,
        profile.topActions.includes("deal_damage") && hasAny(causal, "combat_damage_trigger", "combat_damage") ? 0.75 : 0,
      ),
      evidence: ["combat_damage_trigger"],
    }),
  },
  {
    motifId: "CREATURE_CHEAT",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.engineActions.includes("put_onto_battlefield") ? 0.9 : 0,
        roleStrength(profile, "combat_manipulation") > 0 && hasAny(causal, "combat_attacks", "attack_trigger") ? 0.82 : 0,
      ),
      evidence: ["put_onto_battlefield"],
    }),
  },
  {
    motifId: "LIFE_GAIN",
    causalPosition: "DRIVER",
    minStrength: 0.3,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.enginePayoffs.includes("life_gain") ? 0.85 : 0,
        hasAny(causal, "life_gain_trigger", "life_gain_events") ? 0.88 : 0,
        roleStrength(profile, "life_gain"),
      ),
      evidence: ["life_gain"],
    }),
  },
  {
    motifId: "LIFE_GAIN_PAYOFF",
    causalPosition: "PAYOFF",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength:
        causal.enginePayoffs.includes("life_gain") && (roleStrength(profile, "counter_synergy") > 0 || causal.engineOutputs.includes("counters"))
          ? 0.88
          : causal.enginePayoffs.includes("life_gain") && causal.engineConditions.includes("static_modifier")
            ? 0.75
            : 0,
      evidence: ["life_gain_payoff"],
    }),
  },
  {
    motifId: "DAMAGE_TO_OPPONENTS",
    causalPosition: "PAYOFF",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength:
        causal.engineActions.includes("postcombat_mana_engine")
          ? 0
          : Math.max(
              causal.enginePayoffs.includes("damage") ? 0.9 : 0,
              roleStrength(profile, "combat_payoff") > 0 && hasAny(causal, "permanents_etb", "etb_trigger") ? 0.85 : 0,
            ),
      evidence: ["damage"],
    }),
  },
  {
    motifId: "ETB_PAYOFF",
    causalPosition: "PAYOFF",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        hasAny(causal, "etb_trigger", "permanents_etb", "trigger_amplify", "etb_amplify", "another_object_etb") ? 0.85 : 0,
        roleStrength(profile, "blink_flicker") > 0 ? 0.75 : 0,
      ),
      evidence: ["etb_trigger"],
    }),
  },
  {
    motifId: "DEATH_PAYOFF",
    causalPosition: "PAYOFF",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        hasAny(causal, "dies_trigger", "creature_deaths", "death_trigger_amplify") ? 0.85 : 0,
        roleStrength(profile, "sacrifice_payoff"),
      ),
      evidence: ["death_payoff"],
    }),
  },
  {
    motifId: "COUNTER_PLACEMENT",
    causalPosition: "OUTPUT",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(causal.engineOutputs.includes("counters") ? 0.85 : 0, roleStrength(profile, "counter_synergy") * 0.9),
      evidence: ["counters"],
    }),
  },
  {
    motifId: "COUNTER_PAYOFF",
    causalPosition: "PAYOFF",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength:
        (causal.engineOutputs.includes("counters") || roleStrength(profile, "counter_synergy") > 0) &&
        causal.engineActions.includes("proliferate")
          ? 0.9
          : roleStrength(profile, "counter_synergy") > 0.7
            ? 0.75
            : 0,
      evidence: ["counter_payoff"],
    }),
  },
  {
    motifId: "ACTIVATED_MANA_ENGINE",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength:
        causal.engineActions.includes("postcombat_mana_engine")
          ? 0
          : Math.max(
              causal.engineActions.includes("activated_ability") &&
                hasAny(causal, "mana", "mana_ability_engine") &&
                !causal.engineTriggers.includes("postcombat_trigger")
                ? 0.88
                : 0,
              causal.engineActions.includes("combat_mana_engine") &&
                hasAny(causal, "combat_damage_trigger", "combat_damage")
                ? 0.9
                : 0,
              causal.engineActions.includes("activated_ability") &&
                causal.engineConditions.includes("power_scaled") &&
                roleStrength(profile, "ramp") > 0.5
                ? 0.94
                : 0,
              causal.engineActions.includes("activated_ability") &&
                causal.engineInputs.includes("creature_count") &&
                roleStrength(profile, "ramp") > 0.7
                ? 0.9
                : 0,
              causal.engineActions.includes("activated_ability") &&
                roleStrength(profile, "ramp") > 0.7 &&
                !causal.engineTriggers.includes("postcombat_trigger")
                ? 0.82
                : 0,
            ),
      evidence: ["activated_mana"],
    }),
  },
  {
    motifId: "TRIGGERED_MANA_ENGINE",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: Math.max(
        causal.engineActions.includes("postcombat_mana_engine") && causal.engineTriggers.includes("postcombat_trigger")
          ? 0.94
          : 0,
        causal.engineActions.includes("combat_mana_engine") &&
          hasAny(causal, "combat_damage_trigger", "combat_damage") &&
          !causal.engineActions.includes("activated_ability")
          ? 0.88
          : 0,
      ),
      evidence: ["triggered_mana"],
    }),
  },
  {
    motifId: "STATIC_MANA_MODIFIER",
    causalPosition: "CONDITION",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength:
        causal.engineConditions.includes("static_modifier") &&
        causal.resourcesProduced.includes("mana") &&
        !causal.engineActions.includes("activated_ability") &&
        !causal.engineTriggers.includes("postcombat_trigger")
          ? 0.75
          : 0,
      evidence: ["static_mana"],
    }),
  },
  {
    motifId: "OPPONENT_LIFE_LOSS",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: Math.max(
        causal.engineInputs.includes("opponent_life_loss") ? 0.88 : 0,
        causal.engineInputs.includes("combat_life_loss") ? 0.72 : 0,
      ),
      evidence: ["opponent_life_loss"],
    }),
  },
  {
    motifId: "POSTCOMBAT_TRIGGER",
    causalPosition: "CONDITION",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: causal.engineTriggers.includes("postcombat_trigger") ? 0.9 : 0,
      evidence: ["postcombat_trigger"],
    }),
  },
  {
    motifId: "MANA_GENERATION",
    causalPosition: "OUTPUT",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength:
        causal.resourcesProduced.includes("mana") &&
        (causal.engineActions.includes("postcombat_mana_engine") || causal.engineActions.includes("combat_mana_engine"))
          ? 0.88
          : causal.resourcesProduced.includes("mana") && causal.engineActions.includes("activated_ability")
            ? 0.82
            : 0,
      evidence: ["mana_generation"],
    }),
  },
  {
    motifId: "POSTCOMBAT_MANA_CONVERSION",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength:
        causal.engineActions.includes("postcombat_mana_engine") &&
        causal.engineInputs.includes("opponent_life_loss")
          ? 0.92
          : 0,
      evidence: ["postcombat_mana_conversion"],
    }),
  },
  {
    motifId: "UNTAP_ENGINE",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: profileHasUntap(causal) ? 0.8 : 0,
      evidence: ["untap"],
    }),
  },
  {
    motifId: "CAST_FROM_EXILE",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.permissions.includes("cast_from_exile") ? 0.88 : 0,
        roleStrength(profile, "cast_from_exile"),
      ),
      evidence: ["cast_from_exile"],
    }),
  },
  {
    motifId: "CAST_FROM_LIBRARY_TOP",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength:
        profile.topActions.includes("scry") || roleStrength(profile, "cast_from_exile") > 0
          ? causal.permissions.includes("cast_from_exile")
            ? 0.85
            : 0.65
          : 0,
      evidence: ["top_library_cast"],
    }),
  },
  {
    motifId: "GRAVEYARD_SETUP",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        hasAny(causal, "graveyard_permanents", "library_to_graveyard", "mill") ? 0.85 : 0,
        roleStrength(profile, "graveyard_setup"),
        roleStrength(profile, "mill"),
      ),
      evidence: ["graveyard_setup"],
    }),
  },
  {
    motifId: "GRAVEYARD_RECURSION",
    causalPosition: "PAYOFF",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        hasAny(causal, "recursion", "reanimation") || causal.permissions.includes("cast_from_graveyard") ? 0.88 : 0,
        roleStrength(profile, "recursion"),
        roleStrength(profile, "reanimation"),
      ),
      evidence: ["recursion"],
    }),
  },
  {
    motifId: "LEGENDARY_PRESENCE",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.engineInputs.includes("legendary_permanents") ? 0.85 : 0,
        roleStrength(profile, "tutor") > 0.8 && causal.engineActions.includes("search_library") ? 0.7 : 0,
      ),
      evidence: ["legendary"],
    }),
  },
  {
    motifId: "TOP_LIBRARY_MANIPULATION",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        profile.topActions.includes("scry") || causal.permissions.includes("ninjutsu") ? 0.82 : 0,
        causal.engineActions.includes("top_library_cast") || causal.engineInputs.includes("library_top") ? 0.88 : 0,
      ),
      evidence: ["top_library"],
    }),
  },
  {
    motifId: "BLINK_ETB",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ profile }) => ({
      strength: roleStrength(profile, "blink_flicker"),
      evidence: ["blink_flicker"],
    }),
  },
  {
    motifId: "SPELL_CAST_TRIGGER",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        hasAny(causal, "cast_trigger", "spell_casts") ? 0.88 : 0,
        hasAny(causal, "artifacts_enchantments") && hasAny(causal, "cast_trigger", "spell_casts") ? 0.9 : 0,
        roleStrength(profile, "spell_copying"),
      ),
      evidence: ["spell_cast"],
    }),
  },
  {
    motifId: "TOKEN_GENERATION",
    causalPosition: "OUTPUT",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.engineActions.includes("token_production") || causal.resourcesProduced.includes("tokens") ? 0.88 : 0,
        roleStrength(profile, "token_generation"),
        causal.engineActions.includes("token_production") && causal.engineActions.includes("activated_ability") ? 0.92 : 0,
      ),
      evidence: ["token_generation"],
    }),
  },
  {
    motifId: "TOKEN_CONVERSION",
    causalPosition: "PAYOFF",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength:
        causal.resourcesProduced.includes("tokens") &&
        (roleStrength(profile, "sacrifice_payoff") > 0 || roleStrength(profile, "combat_payoff") > 0)
          ? 0.85
          : 0,
      evidence: ["token_conversion"],
    }),
  },
  {
    motifId: "SACRIFICE_ENGINE",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: causal.engineConditions.includes("upkeep_self_sacrifice_penalty")
        ? 0
        : Math.max(
            hasAny(causal, "sacrifice_trigger", "sacrifices") || causal.engineCosts.includes("sacrifice") ? 0.88 : 0,
            causal.activatedEngineCosts.some((c) => c.startsWith("sacrifice_")) ? 0.94 : 0,
            causal.costRequires.includes("artifacts") && causal.engineActions.includes("activated_ability") ? 0.92 : 0,
            roleStrength(profile, "sacrifice_outlet"),
            causal.engineInputs.includes("artifacts_enchantments") && hasAny(causal, "sacrifice_trigger", "sacrifices")
              ? 0.92
              : 0,
          ),
      evidence: ["sacrifice"],
    }),
  },
  {
    motifId: "ARTIFACT_ENGINE",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.resourcesProduced.includes("artifact_tokens") ? 0.8 : 0,
        causal.engineInputs.includes("artifacts_enchantments") &&
        (causal.engineActions.includes("sacrifice") || causal.resourcesProduced.includes("artifact_tokens") || causal.engineTriggers.includes("sacrifice_trigger"))
          ? 0.82
          : 0,
        (profile.commandZoneIpv2_1["ipv2_1_cmd_artifacts_reliance"] ?? 0) > 0.35 ? 0.75 : 0,
      ),
      evidence: ["artifacts"],
    }),
  },
  {
    motifId: "AURA_EQUIPMENT",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.engineInputs.includes("auras_equipment") ? 0.88 : 0,
        roleStrength(profile, "combat_payoff") > 0.85 &&
          roleStrength(profile, "combat_manipulation") > 0.85 &&
          causal.engineInputs.includes("auras_equipment")
          ? 0.7
          : 0,
      ),
      evidence: ["auras_equipment"],
    }),
  },
  {
    motifId: "LANDFALL_ENGINE",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        hasAny(causal, "landfall_trigger", "land_drops") ? 0.85 : 0,
        roleStrength(profile, "ramp") > 0.7 && causal.engineInputs.includes("land_drops") ? 0.8 : 0,
      ),
      evidence: ["landfall"],
    }),
  },
  {
    motifId: "MILL_ENGINE",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(causal.engineActions.includes("mill") ? 0.9 : 0, roleStrength(profile, "mill")),
      evidence: ["mill"],
    }),
  },
  {
    motifId: "DRAW_ENGINE",
    causalPosition: "OUTPUT",
    minStrength: 0.3,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.engineOutputs.includes("card_draw") ? 0.75 : 0,
        roleStrength(profile, "card_draw") * 0.85,
        causal.engineInputs.includes("creature_count") && roleStrength(profile, "card_draw") > 0 ? 0.82 : 0,
      ),
      evidence: ["card_draw"],
    }),
  },
  {
    motifId: "TUTOR_ENGINE",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(causal.engineActions.includes("tutor") ? 0.85 : 0, roleStrength(profile, "tutor")),
      evidence: ["tutor"],
    }),
  },
  {
    motifId: "PROLIFERATE_ENGINE",
    causalPosition: "ENGINE",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: causal.engineActions.includes("proliferate") ? 0.9 : 0,
      evidence: ["proliferate"],
    }),
  },
  {
    motifId: "STATIC_TAX",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal, profile }) => ({
      strength: Math.max(
        causal.engineConditions.includes("tax") ? 0.88 : 0,
        causal.engineInputs.includes("opponent_spell_casts") ? 0.85 : 0,
        causal.spellCastEvents?.some((e) => e.resultingActions.includes("counter")) ? 0.9 : 0,
        roleStrength(profile, "countermagic") > 0.7 ? 0.65 : 0,
      ),
      evidence: ["tax"],
    }),
  },
  {
    motifId: "SPELL_PUNISHMENT",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: causal.spellCastEvents?.some(
        (e) =>
          e.resultingActions.includes("damage") &&
          (e.actor === "any_player" || e.actor === "opponent" || (e.actor === "you" && e.frequency === "first_each_turn")),
      )
        ? 0.92
        : causal.engineInputs.includes("player_spell_casts") && causal.enginePayoffs.includes("damage")
          ? 0.88
          : 0,
      evidence: ["spell_punishment"],
    }),
  },
  {
    motifId: "COUNTER_SPELL",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: causal.spellCastEvents?.some((e) => e.resultingActions.includes("counter"))
        ? 0.92
        : causal.engineActions.includes("counter") && causal.engineInputs.includes("opponent_spell_casts")
          ? 0.88
          : 0,
      evidence: ["counter_spell"],
    }),
  },
  {
    motifId: "CREATURE_REMOVAL",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength:
        (causal.activatedInteractions?.length ?? 0) > 0
          ? 0.9
          : causal.enginePayoffs.includes("creature_damage") && causal.engineActions.includes("activated_ability")
            ? 0.85
            : 0,
      evidence: ["creature_removal"],
    }),
  },
  {
    motifId: "PROTECTION_PROVIDER",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: causal.protectionEffects?.some((p) => p.kind === "TARGETED_PROTECTION") ? 0.9 : 0,
      evidence: ["protection_provider"],
    }),
  },
  {
    motifId: "STATIC_PROTECTION",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: causal.protectionEffects?.some((p) => p.kind === "STATIC_PROTECTION" || p.kind === "CONDITIONAL_PROTECTION")
        ? 0.88
        : 0,
      evidence: ["static_protection"],
    }),
  },
  {
    motifId: "STATE_SCALING",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: (causal.stateScaling?.length ?? 0) > 0 ? 0.92 : 0,
      evidence: ["state_scaling"],
    }),
  },
  {
    motifId: "CONVOKE_COST",
    causalPosition: "DRIVER",
    minStrength: 0.35,
    score: ({ causal }) => ({
      strength: (causal.costDependencies?.length ?? 0) > 0 ? 0.88 : 0,
      evidence: ["convoke"],
    }),
  },
  {
    motifId: "COMBAT_BUFF",
    causalPosition: "PAYOFF",
    minStrength: 0.35,
    score: ({ causal, profile }) => {
      const hasCombatAnchor =
        hasAny(causal, "attack_trigger", "combat_attacks", "combat_damage_trigger", "combat_damage") ||
        causal.engineInputs.includes("auras_equipment") ||
        causal.engineTriggers.includes("tap_state_trigger") ||
        (causal.stateChangeTriggers?.some((t) => t.stateChange === "becomes_tapped") ?? false);
      if (!hasCombatAnchor) return { strength: 0, evidence: ["combat_buff_blocked_no_anchor"] };
      return {
        strength: Math.max(roleStrength(profile, "combat_manipulation"), roleStrength(profile, "combat_payoff") * 0.9),
        evidence: ["combat_buff"],
      };
    },
  },
];

function profileHasUntap(causal: CommanderCausalRoleProfile): boolean {
  return causal.engineActions.includes("activated_ability") && causal.engineCosts.includes("tap");
}

export function extractMechanicalMotifs(profile: CommanderMechanicalProfile): ExtractedMotif[] {
  const causal = profile.causalRoles;
  const out: ExtractedMotif[] = [];

  for (const rule of MOTIF_RULES) {
    const { strength, evidence } = rule.score({ causal, profile });
    if (strength >= rule.minStrength) {
      let causalPosition = rule.causalPosition;
      if (rule.motifId === "ETB_PAYOFF" && hasAny(causal, "etb_trigger", "permanents_etb", "trigger_amplify", "another_object_etb")) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "COMBAT_DAMAGE_TRIGGER" &&
        (causal.engineActions.includes("combat_mana_engine") ||
          hasAny(causal, "combat_damage_conversion", "combat_damage_trigger", "combat_damage"))
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "ACTIVATED_MANA_ENGINE" &&
        causal.engineActions.includes("activated_ability") &&
        !causal.engineActions.includes("postcombat_mana_engine") &&
        !causal.engineTriggers.includes("postcombat_trigger")
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "TRIGGERED_MANA_ENGINE" &&
        (causal.engineActions.includes("postcombat_mana_engine") || causal.engineActions.includes("combat_mana_engine"))
      ) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "OPPONENT_LIFE_LOSS" && causal.engineInputs.includes("opponent_life_loss")) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "POSTCOMBAT_MANA_CONVERSION" && causal.engineActions.includes("postcombat_mana_engine")) {
        causalPosition = "ENGINE";
      }
      if (rule.motifId === "MANA_GENERATION" && causal.engineActions.includes("postcombat_mana_engine")) {
        causalPosition = "OUTPUT";
      }
      if (rule.motifId === "SPELL_CAST_TRIGGER" && causal.engineInputs.includes("creature_spells")) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "TOKEN_GENERATION" &&
        (causal.engineActions.includes("token_production") || causal.resourcesProduced.includes("tokens")) &&
        ((causal.activatedActions?.length ?? 0) > 0 ||
          causal.engineActions.includes("activated_ability") ||
          causal.engineCosts.includes("tap"))
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "TOKEN_GENERATION" &&
        causal.engineTriggers.includes("attack_trigger") &&
        causal.engineActions.includes("token_production")
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "TOKEN_GENERATION" &&
        (causal.outputMultipliers?.length ?? 0) > 0 &&
        (causal.activatedActions?.length ?? 0) === 0 &&
        !causal.engineActions.includes("token_production")
      ) {
        causalPosition = "OUTPUT";
      }
      if (
        rule.motifId === "SACRIFICE_ENGINE" &&
        (hasAny(causal, "sacrifice_trigger", "sacrifices") ||
          causal.activatedEngineCosts.some((c) => c.startsWith("sacrifice_")))
      ) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "DRAW_ENGINE" && hasAny(causal, "cast_trigger", "creature_spells") && causal.engineOutputs.includes("card_draw")) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "DRAW_ENGINE" &&
        causal.engineOutputs.includes("card_draw") &&
        ((causal.activatedActions?.length ?? 0) > 0 || causal.engineActions.includes("activated_ability"))
      ) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "PROLIFERATE_ENGINE" && causal.engineActions.includes("proliferate")) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "ATTACK_TRIGGER" && hasAny(causal, "attack_trigger", "combat_attacks")) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "COUNTER_PLACEMENT" && causal.engineOutputs.includes("counters")) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "DRAW_ENGINE" &&
        (causal.engineTriggers.includes("draw_trigger") ||
          causal.engineTriggers.includes("leave_battlefield_trigger") ||
          causal.engineActions.includes("death_triggered_draw"))
      ) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "TOKEN_GENERATION" && causal.engineConditions.includes("threshold_state")) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "SPELL_PUNISHMENT" && (causal.spellCastEvents?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "COUNTER_SPELL" && causal.engineActions.includes("counter")) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "CREATURE_REMOVAL" && (causal.activatedInteractions?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "PROTECTION_PROVIDER" && (causal.protectionEffects?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "STATIC_PROTECTION" && causal.protectionEffects?.some((p) => p.kind !== "TARGETED_PROTECTION")) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "STATE_SCALING" && (causal.stateScaling?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "CONVOKE_COST" && (causal.costDependencies?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "TUTOR_ENGINE" &&
        ((causal.tutorCheats?.length ?? 0) > 0 ||
          (causal.engineActions.includes("tutor") && causal.engineActions.includes("put_onto_battlefield")))
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "CREATURE_CHEAT" &&
        ((causal.tutorCheats?.length ?? 0) > 0 || causal.engineActions.includes("put_onto_battlefield"))
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "TOKEN_GENERATION" &&
        (causal.typeQualifiedTriggers?.length ?? 0) > 0 &&
        causal.engineActions.includes("token_production")
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "DRAW_ENGINE" &&
        causal.engineOutputs.includes("card_draw") &&
        causal.activatedActions?.some((a) => a.costType === "sacrifice")
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "SACRIFICE_ENGINE" &&
        causal.activatedActions?.some((a) => a.costType === "sacrifice") &&
        (causal.attritionStages?.length ?? 0) > 0
      ) {
        causalPosition = "ENGINE";
      }
      if (
        rule.motifId === "TOP_LIBRARY_MANIPULATION" &&
        (causal.stateChangeTriggers?.some((t) => t.stateChange === "scry") ||
          causal.activatedActions?.some((a) => a.mechanism === "SCRY"))
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "COMBAT_BUFF" &&
        (causal.stateChangeTriggers?.some((t) => t.stateChange === "becomes_tapped") ?? false)
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "STATE_SCALING" &&
        ((causal.stateScaling?.length ?? 0) > 0 || causal.engineInputs.includes("commander_counters"))
      ) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "COUNTER_PLACEMENT" && (causal.activatedActions?.some((a) => a.mechanism === "COUNTER_PLACEMENT") ?? false)) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "COUNTER_PLACEMENT" &&
        causal.engineInputs.includes("opponent_creature_damaged")
      ) {
        causalPosition = "OUTPUT";
      }
      if (
        rule.motifId === "TOKEN_GENERATION" &&
        (causal.endStepConditionals?.length ?? 0) > 0 &&
        causal.engineActions.includes("token_production")
      ) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "COMBAT_BUFF" && (causal.staticTypalBuffs?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "SACRIFICE_ENGINE" &&
        causal.activatedActions?.some((a) => a.costType === "sacrifice")
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "SPELL_CAST_TRIGGER" &&
        causal.spellCastEvents?.some((e) => e.ordinal === 2)
      ) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "DRAW_ENGINE" &&
        causal.spellCastEvents?.some((e) => e.ordinal === 2 && e.resultingActions.includes("card_draw"))
      ) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "TUTOR_ENGINE" && (causal.typeQualifiedTutors?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "STATIC_TAX" && (causal.staticTimingRestrictions?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "DAMAGE_TO_OPPONENTS" && (causal.typeCountScaling?.length ?? 0) > 0) {
        causalPosition = "DRIVER";
      }
      if (
        rule.motifId === "COMBAT_BUFF" &&
        (causal.abilityInheritances?.length ?? 0) > 0 &&
        (causal.exileReplacements?.length ?? 0) > 0
      ) {
        causalPosition = "DRIVER";
      }
      if (rule.motifId === "DAMAGE_TO_OPPONENTS" && hasAny(causal, "etb_trigger", "permanents_etb") && !hasAny(causal, "attack_trigger")) {
        causalPosition = "PAYOFF";
      }
      out.push({
        motifId: rule.motifId,
        causalPosition,
        strength,
        evidence,
      });
    }
  }

  return out.sort((a, b) => b.strength - a.strength);
}

export const MECHANICAL_MOTIF_IDS = MOTIF_RULES.map((r) => r.motifId);
