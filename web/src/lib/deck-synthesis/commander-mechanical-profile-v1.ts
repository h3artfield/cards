/**
 * Commander-only mechanical profile — Stage A input.
 */
import { buildCardFeatureBundle } from "@/lib/semantic-visualization/feature-vector-v1";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import { buildCardInteractionProfileV2_1 } from "../commander-strategy/interaction-profile-v2.1/card-interaction-profile-v2.1";
import { deckFeatureKey } from "../commander-strategy/interaction-profile-v2.1/rps-ontology-v2.1";
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";
import type { CommanderEnchantmentSignals, CommanderMechanicalProfile } from "./archetype-discovery-types-v1";
import {
  buildCommanderCausalRoleProfile,
  mergeCausalProfiles,
  type CommanderCausalRoleProfile,
  type CausalInferenceEvidence,
} from "./commander-causal-roles-v1";
import { COMMANDER_CAUSAL_INFERENCE_VERSION } from "./commander-causal-inference-v1.1";

function inferEnchantmentSignals(input: {
  oracleText: string;
  typeLine: string;
}): CommanderEnchantmentSignals {
  const text = input.oracleText.toLowerCase();
  const types = input.typeLine.toLowerCase();
  let castEnchantmentTrigger = 0;
  let enchantmentEtBTrigger = 0;
  let enchantmentPayoff = 0;
  let enchantmentRecursion = 0;
  let enchantmentPresenceEngine = 0;

  if (/whenever you cast an enchantment/.test(text)) castEnchantmentTrigger = 1;
  if (/whenever .*enchantment.* enters the battlefield/.test(text)) enchantmentEtBTrigger = 1;
  if (/enchantment.*(draw|create|token|damage|life|counter)/.test(text)) enchantmentPayoff = Math.max(enchantmentPayoff, 0.85);
  if (/return .*enchantment.*(from|to).*graveyard/.test(text)) enchantmentRecursion = 1;
  if (types.includes("enchantment") && /(enchantment|constellation|cast an enchantment)/.test(text)) {
    enchantmentPresenceEngine = 0.8;
  }
  if (/constellation/.test(text)) {
    enchantmentEtBTrigger = Math.max(enchantmentEtBTrigger, 0.9);
    enchantmentPayoff = Math.max(enchantmentPayoff, 0.7);
  }
  if (/enchantment spells you cast cost/.test(text) || /enchantments you control/.test(text)) {
    enchantmentPresenceEngine = Math.max(enchantmentPresenceEngine, 0.75);
  }

  const enchantmentSpecificSupport = Math.min(
    1,
    castEnchantmentTrigger * 0.45 +
      enchantmentEtBTrigger * 0.35 +
      enchantmentPayoff * 0.35 +
      enchantmentRecursion * 0.3 +
      enchantmentPresenceEngine * 0.25,
  );

  return {
    castEnchantmentTrigger,
    enchantmentEtBTrigger,
    enchantmentPayoff,
    enchantmentRecursion,
    enchantmentPresenceEngine,
    enchantmentSpecificSupport,
  };
}

function mergeEnchantmentSignals(base: CommanderEnchantmentSignals, next: CommanderEnchantmentSignals): CommanderEnchantmentSignals {
  return {
    castEnchantmentTrigger: Math.max(base.castEnchantmentTrigger, next.castEnchantmentTrigger),
    enchantmentEtBTrigger: Math.max(base.enchantmentEtBTrigger, next.enchantmentEtBTrigger),
    enchantmentPayoff: Math.max(base.enchantmentPayoff, next.enchantmentPayoff),
    enchantmentRecursion: Math.max(base.enchantmentRecursion, next.enchantmentRecursion),
    enchantmentPresenceEngine: Math.max(base.enchantmentPresenceEngine, next.enchantmentPresenceEngine),
    enchantmentSpecificSupport: Math.max(base.enchantmentSpecificSupport, next.enchantmentSpecificSupport),
  };
}

function inferSupplementalCommanderRoles(input: {
  actions: SemanticAction[];
  abilities: SemanticAbility[];
  oracleText: string;
}): Partial<Record<DerivedRoleName, number>> {
  const roles: Partial<Record<DerivedRoleName, number>> = {};
  const set = (role: DerivedRoleName, strength = 1) => {
    roles[role] = Math.max(roles[role] ?? 0, strength);
  };

  for (const action of input.actions) {
    const fromGy = (action.arguments.sourceZone ?? []).includes("graveyard");
    const toHand =
      (action.arguments.destinationZone ?? []).includes("hand") || action.actionType === "return_to_hand";
    const toBf =
      (action.arguments.destinationZone ?? []).includes("battlefield") ||
      action.actionType === "return_to_battlefield";
    if (fromGy && toHand) set("recursion", 1);
    if (fromGy && toBf) set("reanimation", 1);
    if (action.actionType === "sacrifice") set("sacrifice_outlet", 0.85);
    if (action.actionType === "create_token") set("token_generation", 1);
    if (action.actionType === "draw" || action.actionType === "put_into_hand") set("card_draw", 0.85);
    if (action.actionType === "mill") set("mill", 1);
    if (action.actionType === "search_library") set("tutor", 0.9);
    if (action.actionType === "add_mana") set("ramp", 0.8);
    if (action.actionType === "destroy" || action.actionType === "exile") set("removal", 0.7);
    if (action.actionType === "counter") set("countermagic", 0.9);
  }

  const text = input.oracleText.toLowerCase();
  if (text.includes("graveyard")) {
    set("graveyard_setup", 0.7);
    if (text.includes("return") || text.includes("from your graveyard")) {
      set("recursion", 1);
      set("reanimation", Math.max(roles.reanimation ?? 0, text.includes("battlefield") ? 1 : 0.75));
    }
  }
  if (text.includes("sacrifice")) {
    set("sacrifice_outlet", 0.85);
    if (text.includes("whenever") && text.includes("sacrifice")) set("sacrifice_payoff", 0.85);
  }
  if (text.includes("token")) set("token_generation", Math.max(roles.token_generation ?? 0, 0.75));
  if (text.includes("proliferate")) set("counter_synergy", 1);
  if (text.includes("+1/+1 counter") || text.includes("counter on")) set("counter_synergy", Math.max(roles.counter_synergy ?? 0, 0.85));
  if (text.includes("spells cost") || text.includes("cost {1} more") || text.includes("cost an additional")) {
    set("countermagic", 0.5);
  }
  if (text.includes("aura")) {
    set("combat_manipulation", 0.85);
    set("combat_payoff", Math.max(roles.combat_payoff ?? 0, 0.85));
  }
  if (text.includes("equipment")) set("combat_payoff", Math.max(roles.combat_payoff ?? 0, 0.8));
  if (/whenever you cast an instant or sorcery|whenever you cast a spell/.test(text)) {
    set("spell_copying", 1);
    set("copy_effects", 0.85);
  }
  if (/legendary creature/.test(text) && /search your library for a legendary/.test(text)) {
    set("tutor", 1);
  }
  if (/ninjutsu/.test(text)) set("combat_manipulation", 1);
  if (text.includes("mill") || text.includes("milling")) set("mill", 1);
  if (text.includes("flashback") || text.includes("cast from your graveyard")) set("recursion", 1);
  if (text.includes("landfall") || text.includes("whenever a land")) set("ramp", 0.75);
  if (text.includes("play a") && text.includes("graveyard")) {
    set("recursion", 1);
    set("graveyard_setup", 0.85);
    set("ramp", Math.max(roles.ramp ?? 0, 0.8));
  }
  if (text.includes("enters the battlefield") && text.includes("blink")) set("blink_flicker", 0.8);
  if (text.includes("exile") && text.includes("cast")) set("cast_from_exile", 0.85);
  if (text.includes("vampire") && text.includes("token")) set("token_generation", 1);
  if (
    (/\bdying\b/.test(text) || /\bdeath trigger/.test(text)) &&
    /additional time|twice|double/.test(text)
  ) {
    set("sacrifice_payoff", Math.max(roles.sacrifice_payoff ?? 0, 0.85));
  }
  if (/cost \{?\d+\}? more to cast|spells your opponents cast cost/.test(text)) {
    set("countermagic", Math.max(roles.countermagic ?? 0, 0.85));
  }
  if (/enters the battlefield under your control/.test(text)) {
    set("blink_flicker", Math.max(roles.blink_flicker ?? 0, 0.75));
  }
  if (/tap a nonland permanent for mana|whenever you tap a nonland/.test(text)) {
    set("ramp", Math.max(roles.ramp ?? 0, 0.9));
  }
  if (/whenever .* attacks|whenever a .* attacks/.test(text)) {
    set("combat_manipulation", Math.max(roles.combat_manipulation ?? 0, 0.85));
    set("combat_payoff", Math.max(roles.combat_payoff ?? 0, 0.75));
  }
  if (/deals .* damage to (any target|each|opponent|player)/.test(text)) {
    set("combat_payoff", Math.max(roles.combat_payoff ?? 0, 0.85));
  }
  if (/double strike|first strike|deals combat damage/.test(text)) {
    set("combat_manipulation", Math.max(roles.combat_manipulation ?? 0, 0.9));
  }
  if (/cast .* from the top of (your|its owner's) library|look at the top .* cast/.test(text)) {
    set("cast_from_exile", Math.max(roles.cast_from_exile ?? 0, 0.85));
  }
  if (/twice|two times|trigger(s)? an additional time|copy .* triggered ability/.test(text)) {
    set("blink_flicker", Math.max(roles.blink_flicker ?? 0, 0.8));
  }
  if (/\+1\/\+1 counter|put .* counter/.test(text)) {
    set("counter_synergy", Math.max(roles.counter_synergy ?? 0, 0.85));
  }
  if (/create .* token|create a .* token/.test(text)) {
    set("token_generation", Math.max(roles.token_generation ?? 0, 0.85));
  }
  if (/power.*creatures you control|power of each creature/.test(text)) {
    set("combat_payoff", Math.max(roles.combat_payoff ?? 0, 0.8));
    set("ramp", Math.max(roles.ramp ?? 0, 0.75));
  }
  if (/\{T\}: Add .* mana/.test(text)) {
    set("ramp", Math.max(roles.ramp ?? 0, 0.9));
    set("mana_generation", Math.max(roles.mana_generation ?? 0, 0.9));
  }
  if (/whenever another creature( you control)? enters the battlefield/.test(text)) {
    set("combat_payoff", Math.max(roles.combat_payoff ?? 0, 0.85));
  }
  if (/whenever you cast an (artifact|enchantment|historic) spell/.test(text)) {
    set("token_generation", Math.max(roles.token_generation ?? 0, 0.8));
  }

  return roles;
}

export function buildCommanderMechanicalProfile(input: {
  commanderOracleIds: string[];
  catalogByOracleId: Map<string, GoldenCatalogOracleCard>;
  shadowIndex: ShadowSemanticIndex;
}): CommanderMechanicalProfile | null {
  const derivedRoles: Record<string, number> = {};
  const actionDensity: Record<string, number> = {};
  const commandZoneIpv2_1: Record<string, number> = {};
  const evidenceRefs: CommanderMechanicalProfile["evidenceRefs"] = [];
  const commanderNames: string[] = [];
  const colorIdentity = new Set<string>();
  const topActionCounts = new Map<string, number>();
  let enchantmentSignals: CommanderEnchantmentSignals = {
    castEnchantmentTrigger: 0,
    enchantmentEtBTrigger: 0,
    enchantmentPayoff: 0,
    enchantmentRecursion: 0,
    enchantmentPresenceEngine: 0,
    enchantmentSpecificSupport: 0,
  };
  const causalProfiles: CommanderCausalRoleProfile[] = [];
  const causalInferenceEvidenceAll: CausalInferenceEvidence[] = [];

  let commanderCount = 0;

  for (const oracleId of input.commanderOracleIds) {
    const shadow = input.shadowIndex.byOracleId.get(oracleId);
    const card = input.catalogByOracleId.get(oracleId);
    if (!shadow?.semantic || !card) continue;

    commanderCount += 1;
    commanderNames.push(card.canonicalName ?? oracleId);
    for (const c of card.colorIdentity ?? []) colorIdentity.add(c);

    const bundle = buildCardFeatureBundle({ shadow, card });
    const supplemental = inferSupplementalCommanderRoles({
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
      oracleText: card.oracleText ?? "",
    });
    for (const role of bundle.derivedRoles) {
      derivedRoles[role] = Math.max(derivedRoles[role] ?? 0, 1);
      evidenceRefs.push({ oracleId, rule: `commander_derived_role:${role}` });
    }
    for (const [role, strength] of Object.entries(supplemental)) {
      derivedRoles[role] = Math.max(derivedRoles[role] ?? 0, strength);
      evidenceRefs.push({ oracleId, rule: `commander_semantic_role:${role}`, note: `strength=${strength}` });
    }

    enchantmentSignals = mergeEnchantmentSignals(
      enchantmentSignals,
      inferEnchantmentSignals({ oracleText: card.oracleText ?? "", typeLine: card.typeLine ?? "" }),
    );
    const causalBuilt = buildCommanderCausalRoleProfile({
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
      oracleText: card.oracleText ?? "",
      typeLine: card.typeLine ?? "",
    });
    const { causalInferenceEvidence, ...causalCore } = causalBuilt;
    causalProfiles.push(causalCore);
    for (const inf of causalInferenceEvidence) {
      causalInferenceEvidenceAll.push(inf);
      evidenceRefs.push({
        oracleId,
        rule: `causal_inference:${inf.ruleId}`,
        note: inf.detail,
      });
    }
    if (enchantmentSignals.enchantmentSpecificSupport >= 0.3) {
      evidenceRefs.push({
        oracleId,
        rule: "enchantment_specific_support",
        note: `score=${enchantmentSignals.enchantmentSpecificSupport.toFixed(2)}`,
      });
    }

    for (const action of bundle.topActions) {
      actionDensity[action] = (actionDensity[action] ?? 0) + 1;
      topActionCounts.set(action, (topActionCounts.get(action) ?? 0) + 1);
    }
    for (const action of shadow.semantic.actions) {
      actionDensity[action.actionType] = (actionDensity[action.actionType] ?? 0) + 0.5;
    }

    const profile = buildCardInteractionProfileV2_1({
      oracleId,
      card,
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
    });
    for (const [family, vectors] of Object.entries(profile.axes)) {
      for (const [vector, scored] of Object.entries(vectors)) {
        const key = deckFeatureKey("cmd", family as never, vector as never);
        commandZoneIpv2_1[key] = Math.max(commandZoneIpv2_1[key] ?? 0, scored.score);
        if (scored.score >= 0.2) {
          evidenceRefs.push({
            oracleId,
            rule: `ipv2_1_cmd_${family}_${vector}`,
            note: `score=${scored.score.toFixed(2)}`,
          });
        }
      }
    }
  }

  if (commanderCount === 0) return null;

  const topActions = [...topActionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([action]) => action);

  const enchantAxis = commandZoneIpv2_1["ipv2_1_cmd_enchantments_reliance"] ?? 0;
  enchantmentSignals = {
    ...enchantmentSignals,
    enchantmentSpecificSupport: Math.min(
      1,
      Math.max(enchantmentSignals.enchantmentSpecificSupport, enchantAxis * 0.35),
    ),
  };

  const causalRoles =
    causalProfiles.length > 0
      ? mergeCausalProfiles(causalProfiles)
      : buildCommanderCausalRoleProfile({
          actions: [],
          abilities: [],
          oracleText: "",
          typeLine: "",
        });

  const strongRoleCount = Object.values(derivedRoles).filter((v) => (v ?? 0) >= 0.75).length;
  if (strongRoleCount >= 5) {
    causalRoles.broadFlexibilityScore = Math.max(causalRoles.broadFlexibilityScore, 0.58);
  }

  return {
    commanderOracleIds: input.commanderOracleIds,
    commanderNames,
    colorIdentity: [...colorIdentity].sort(),
    derivedRoles,
    actionDensity,
    topActions,
    commandZoneIpv2_1,
    enchantmentSignals,
    causalRoles,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    evidenceRefs,
  };
}
