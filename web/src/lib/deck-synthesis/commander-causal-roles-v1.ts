/**
 * Commander causal-role profile — derived from frozen RC8 actions/abilities.
 * Oracle-text interpretation lives in commander-causal-inference-v1.1 (not RC8).
 */
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { CommanderMechanicalProfile } from "./archetype-discovery-types-v1";
import {
  applyCommanderCausalInferenceV1_1,
  type CausalInferenceEvidence,
} from "./commander-causal-inference-v1.1";

export type { CausalInferenceEvidence };
export { COMMANDER_CAUSAL_INFERENCE_VERSION } from "./commander-causal-inference-v1.1";

export type SpellCastEventInference = {
  eventId: string;
  actor: "you" | "opponent" | "any_player";
  objectRestriction?: string;
  ordinal?: number;
  ordinalScope?: "turn";
  frequency?: "first_each_turn" | "each";
  resultingActions: string[];
  spanText?: string;
};

export type StateScalingInference = {
  scalingBasis: string;
  countedObjects: string[];
  stateFilter?: string;
  scaledQuantity: "power" | "toughness" | "both" | "cost_reduction" | "ability_magnitude";
  controller: "you";
};

export type ProtectionInference = {
  kind: "TARGETED_PROTECTION" | "STATIC_PROTECTION" | "CONDITIONAL_PROTECTION";
  protectionType: "indestructible" | "hexproof" | "shroud" | "protection";
  subject: string;
  condition?: string;
};

export type ActivatedInteractionInference = {
  costType: "tap" | "mana";
  targetClasses: string[];
  effect: "creature_damage" | "creature_removal";
  magnitude?: number;
};

export type CostDependencyInference = {
  dependency: "convoke" | "delve" | "improvise";
  requiredResource: string;
  effect: string;
};

export type SelfPenaltyConditionInference = {
  trigger: string;
  actor: string;
  penalty: string;
  constructionImplication: string[];
};

export type ActivatedActionMechanism =
  | "TOKEN_GENERATION"
  | "COUNTER_PLACEMENT"
  | "COPY"
  | "DRAW"
  | "RECURSION"
  | "CREATURE_REMOVAL"
  | "MANA_GENERATION"
  | "UNTAP"
  | "CAST_FROM_EXILE"
  | "SCRY"
  | "GLOBAL_CHARACTERISTIC_TRANSFORMATION";

export type ActivatedActionInference = {
  actionId: string;
  costType: "tap" | "mana" | "life" | "hybrid" | "counter_removal" | "sacrifice";
  costDetail?: string;
  mechanism: ActivatedActionMechanism;
  /** Resources consumed as cost — distinct from resulting effect. */
  resourcesConsumed?: string[];
  spanText?: string;
};

export type StateChangeTriggerInference = {
  triggerId: string;
  stateChange: "becomes_tapped" | "scry" | "becomes_untapped";
  payoffMechanisms: string[];
  spanText?: string;
};

export type AttritionStageInference = {
  stageId: string;
  stageKind: "STATE_MARKER" | "STATIC_DEBUFF" | "MARKED_DEATH_PAYOFF" | "RESOURCE_CONVERSION";
  subject: string;
  markerType?: string;
  spanText?: string;
};

export type TutorCheatInference = {
  cheatId: string;
  trigger: "etb" | "cast";
  searchTarget: string;
  qualification?: string;
  destination: "battlefield" | "hand";
  variableCost: boolean;
  spanText?: string;
};

export type TypeQualifiedTriggerInference = {
  triggerId: string;
  event: "play" | "cast" | "etb";
  typeQualification: string;
  minCardTypes?: number;
  outputMechanism: string;
  spanText?: string;
};

export type StaticTypalBuffInference = {
  buffId: string;
  creatureType: string;
  grantedKeywords: string[];
  spanText?: string;
};

export type PlaneswalkerLoyaltyInference = {
  abilityId: string;
  loyaltyCost: number;
  effects: string[];
  typeQualification?: string;
  spanText?: string;
};

export type ExileReplacementInference = {
  replacementId: string;
  replacedEvent: string;
  exileMarker?: string;
  spanText?: string;
};

export type AbilityInheritanceInference = {
  inheritanceId: string;
  sourceZone: string;
  sourceMarker?: string;
  inheritedProperties: string[];
  spanText?: string;
};

export type TypeCountScalingInference = {
  scalingId: string;
  countedType: string;
  scaledEffect: string;
  triggerTiming?: string;
  spanText?: string;
};

export type StaticTimingRestrictionInference = {
  restrictionId: string;
  affectedActors: string[];
  restriction: string;
  spanText?: string;
};

export type EndStepConditionalInference = {
  triggerId: string;
  condition: string;
  outcomeMechanisms: string[];
  spanText?: string;
};

export type TypeQualifiedTutorInference = {
  tutorId: string;
  destination: "hand" | "battlefield" | "library_top";
  typeQualification: string;
  costType?: "loyalty" | "mana" | "generic";
  spanText?: string;
};

export type OutputMultiplierType =
  | "token_doubling"
  | "counter_doubling"
  | "trigger_doubling"
  | "damage_doubling"
  | "mana_doubling";

export type OutputMultiplierInference = {
  multiplierId: string;
  anchorKind: "STATIC_INCENTIVE" | "STATE_DEPENDENCY";
  targetMechanic: ActivatedActionMechanism | "TOKEN_GENERATION" | "TRIGGERED_ABILITY" | "SPELL_DAMAGE";
  multiplierType: OutputMultiplierType;
  spanText?: string;
};

export type CommanderCausalRoleProfile = {
  engineInputs: string[];
  engineConditions: string[];
  engineCosts: string[];
  engineTriggers: string[];
  engineActions: string[];
  engineOutputs: string[];
  enginePayoffs: string[];
  resourcesProduced: string[];
  resourcesConsumed: string[];
  permissions: string[];
  /** Objects/resources the commander ability requires to pay costs (Phase 5.3.2). */
  costRequires: string[];
  /** Objects/resources consumed as part of activation costs — COST != EFFECT. */
  costConsumes: string[];
  /** Structured activated-cost patterns for deckbuilding dependency retrieval. */
  activatedEngineCosts: string[];
  /** Phase 5.4 — structured spell-cast event inferences. */
  spellCastEvents: SpellCastEventInference[];
  stateScaling: StateScalingInference[];
  protectionEffects: ProtectionInference[];
  activatedInteractions: ActivatedInteractionInference[];
  costDependencies: CostDependencyInference[];
  selfPenaltyConditions: SelfPenaltyConditionInference[];
  /** Phase 5.4.1 — structured activated-action inferences. */
  activatedActions: ActivatedActionInference[];
  outputMultipliers: OutputMultiplierInference[];
  /** Phase 5.4.2 — state-change triggered engines. */
  stateChangeTriggers: StateChangeTriggerInference[];
  attritionStages: AttritionStageInference[];
  tutorCheats: TutorCheatInference[];
  typeQualifiedTriggers: TypeQualifiedTriggerInference[];
  staticTypalBuffs: StaticTypalBuffInference[];
  planeswalkerLoyaltyAbilities: PlaneswalkerLoyaltyInference[];
  exileReplacements: ExileReplacementInference[];
  abilityInheritances: AbilityInheritanceInference[];
  typeCountScaling: TypeCountScalingInference[];
  staticTimingRestrictions: StaticTimingRestrictionInference[];
  endStepConditionals: EndStepConditionalInference[];
  typeQualifiedTutors: TypeQualifiedTutorInference[];
  repeatability: number;
  /** Broad flexible commander — required for GENERIC_VALUE_FALLBACK surfacing. */
  broadFlexibilityScore: number;
};

export type CausalSupportSignals = {
  driverSupport: number;
  payoffSupport: number;
  feedbackSupport: number;
  incidentalSupport: number;
};

const TRIGGER_PREFIXES = ["whenever", "when ", "at the beginning", "at end of", "if a ", "if you "];

function classifyActionCausal(action: SemanticAction): {
  role: keyof Pick<
    CommanderCausalRoleProfile,
    | "engineInputs"
    | "engineConditions"
    | "engineCosts"
    | "engineTriggers"
    | "engineActions"
    | "engineOutputs"
    | "enginePayoffs"
    | "resourcesProduced"
    | "resourcesConsumed"
  >;
  tag: string;
} | null {
  const t = action.actionType;
  switch (t) {
    case "draw":
    case "put_into_hand":
      return { role: "engineOutputs", tag: "card_draw" };
    case "create_token":
      return { role: "engineOutputs", tag: "create_token" };
    case "add_mana":
      return { role: "resourcesProduced", tag: "mana" };
    case "sacrifice":
      return { role: "engineCosts", tag: "sacrifice" };
    case "mill":
      return { role: "engineActions", tag: "mill" };
    case "search_library":
      return { role: "engineActions", tag: "tutor" };
    case "return_to_battlefield":
    case "return_to_hand":
      return { role: "enginePayoffs", tag: "recursion" };
    case "destroy":
    case "exile":
      return { role: "engineActions", tag: "removal" };
    case "counter":
      return { role: "engineActions", tag: "counter" };
    case "deal_damage":
    case "lose_life":
      return { role: "enginePayoffs", tag: "damage" };
    case "gain_life":
      return { role: "enginePayoffs", tag: "life_gain" };
    case "put_counter":
      return { role: "engineOutputs", tag: "counters" };
    case "copy":
      return { role: "engineActions", tag: "copy" };
    case "cast":
    case "play":
      return { role: "engineActions", tag: "cast_or_play" };
    default:
      return { role: "engineActions", tag: t };
  }
}

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

export function buildCommanderCausalRoleProfile(input: {
  actions: SemanticAction[];
  abilities: SemanticAbility[];
  oracleText: string;
  typeLine: string;
}): CommanderCausalRoleProfile & { causalInferenceEvidence: CausalInferenceEvidence[] } {
  const profile: CommanderCausalRoleProfile = {
    engineInputs: [],
    engineConditions: [],
    engineCosts: [],
    engineTriggers: [],
    engineActions: [],
    engineOutputs: [],
    enginePayoffs: [],
    resourcesProduced: [],
    resourcesConsumed: [],
    permissions: [],
    costRequires: [],
    costConsumes: [],
    activatedEngineCosts: [],
    spellCastEvents: [],
    stateScaling: [],
    protectionEffects: [],
    activatedInteractions: [],
    costDependencies: [],
    selfPenaltyConditions: [],
    activatedActions: [],
    outputMultipliers: [],
    stateChangeTriggers: [],
    attritionStages: [],
    tutorCheats: [],
    typeQualifiedTriggers: [],
    staticTypalBuffs: [],
    planeswalkerLoyaltyAbilities: [],
    exileReplacements: [],
    abilityInheritances: [],
    typeCountScaling: [],
    staticTimingRestrictions: [],
    endStepConditionals: [],
    typeQualifiedTutors: [],
    repeatability: 0,
    broadFlexibilityScore: 0,
  };

  const text = input.oracleText.toLowerCase();
  const types = input.typeLine.toLowerCase();

  for (const ability of input.abilities) {
    if (ability.abilityType === "triggered") {
      pushUnique(profile.engineTriggers, ability.triggerType ?? "triggered");
    }
    if (ability.abilityType === "activated") {
      pushUnique(profile.engineActions, "activated_ability");
      if (ability.cost?.includes("tap")) pushUnique(profile.engineCosts, "tap");
      if (ability.cost?.includes("sacrifice")) pushUnique(profile.engineCosts, "sacrifice");
    }
    if (ability.abilityType === "static") {
      pushUnique(profile.engineConditions, "static_modifier");
    }
  }

  for (const action of input.actions) {
    const classified = classifyActionCausal(action);
    if (!classified) continue;
    pushUnique(profile[classified.role], classified.tag);
    if (action.actionType === "create_token") {
      pushUnique(profile.resourcesProduced, "tokens");
      pushUnique(profile.engineActions, "token_production");
      if (profile.engineActions.includes("activated_ability") || profile.engineCosts.includes("tap")) {
        pushUnique(profile.engineInputs, "tokens");
      }
    }
    if (action.actionType === "add_mana") {
      pushUnique(profile.resourcesProduced, "mana");
    }
  }

  if (/whenever you cast an (instant|sorcery|enchantment|artifact|creature|spell)/.test(text)) {
    pushUnique(profile.engineTriggers, "cast_trigger");
    pushUnique(profile.engineInputs, "spell_casts");
  }
  if (/whenever .* dies/.test(text)) {
    pushUnique(profile.engineTriggers, "dies_trigger");
    pushUnique(profile.engineInputs, "creature_deaths");
  }
  if (/whenever .* (sacrifice|sacrificed)/.test(text)) {
    pushUnique(profile.engineTriggers, "sacrifice_trigger");
    pushUnique(profile.engineInputs, "sacrifices");
  }
  if (/whenever .* enters the battlefield/.test(text)) {
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "permanents_etb");
  }
  if (/whenever .* attacks/.test(text)) {
    pushUnique(profile.engineTriggers, "attack_trigger");
    pushUnique(profile.engineInputs, "combat_attacks");
  }
  if (/whenever .* deals combat damage|deals combat damage to a player/.test(text)) {
    pushUnique(profile.engineTriggers, "combat_damage_trigger");
    pushUnique(profile.engineInputs, "combat_damage");
    if (/add .* mana|create .* Treasure/.test(text)) {
      pushUnique(profile.resourcesProduced, "mana");
      pushUnique(profile.engineActions, "combat_mana_engine");
    }
  }
  if (/whenever a land enters/.test(text) || /landfall/.test(text)) {
    pushUnique(profile.engineTriggers, "landfall_trigger");
    pushUnique(profile.engineInputs, "land_drops");
  }
  if (/ninjutsu/.test(text)) {
    pushUnique(profile.permissions, "ninjutsu");
    pushUnique(profile.engineActions, "ninjutsu");
  }
  if (/proliferate/.test(text)) {
    pushUnique(profile.engineActions, "proliferate");
  }
  if (/play .* from .* graveyard|cast .* from .* graveyard|play lands? from .* graveyard/.test(text)) {
    pushUnique(profile.permissions, "cast_from_graveyard");
    pushUnique(profile.engineInputs, "graveyard_permanents");
  }
  if (/return .* (creature|permanent|target) .* from .* graveyard to the battlefield/.test(text)) {
    pushUnique(profile.enginePayoffs, "recursion");
    pushUnique(profile.enginePayoffs, "reanimation");
    pushUnique(profile.engineInputs, "graveyard_permanents");
  }
  if (/exile .* cast|cast .* from exile|play .* from exile/.test(text)) {
    pushUnique(profile.permissions, "cast_from_exile");
    pushUnique(profile.engineInputs, "exiled_cards");
  }
  if (/legendary|historic/.test(text)) {
    pushUnique(profile.engineInputs, "legendary_permanents");
  }
  if (/aura|equipment/.test(text)) {
    pushUnique(profile.engineInputs, "auras_equipment");
  }
  if (/treasure|food|clue/.test(text)) {
    pushUnique(profile.resourcesProduced, "artifact_tokens");
  }
  if (/planeswalker/.test(text)) {
    pushUnique(profile.engineInputs, "planeswalkers");
  }
  if (text.includes("aura")) {
    pushUnique(profile.engineInputs, "auras_equipment");
    pushUnique(profile.engineActions, "aura_cast");
  }
  if (text.includes("equipment")) {
    pushUnique(profile.engineInputs, "auras_equipment");
    pushUnique(profile.engineActions, "equipment_attach");
  }
  if (/creature dying|whenever .* dies|when .* dies/.test(text)) {
    pushUnique(profile.engineInputs, "creature_deaths");
    pushUnique(profile.engineConditions, "death_trigger_amplify");
  }
  if (/cost \{?\d+\}? more to cast|spells your opponents cast cost/.test(text)) {
    pushUnique(profile.engineConditions, "tax");
    pushUnique(profile.engineInputs, "opponent_actions");
  }
  if (/tap a nonland permanent for mana|whenever you tap/.test(text)) {
    pushUnique(profile.engineActions, "mana_ability_engine");
    pushUnique(profile.engineInputs, "activated_ability");
  }
  if (/enters the battlefield under your control|whenever a creature enters the battlefield|whenever .* enters the battlefield/.test(text)) {
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "permanents_etb");
  }
  if (/whenever you cast a creature/.test(text)) {
    pushUnique(profile.engineTriggers, "cast_trigger");
    pushUnique(profile.engineInputs, "creature_spells");
  }
  if (/additional land|play an additional land|put a land .* onto the battlefield/.test(text)) {
    pushUnique(profile.engineInputs, "land_drops");
    pushUnique(profile.engineTriggers, "landfall_trigger");
  }
  if (/put .* onto the battlefield under your control|may put .* onto the battlefield/.test(text)) {
    pushUnique(profile.engineActions, "put_onto_battlefield");
    pushUnique(profile.engineOutputs, "cheat_into_play");
  }
  if (/look at the top .* of your library|reveal .* from the top of your library/.test(text)) {
    pushUnique(profile.engineActions, "top_library_manipulation");
    pushUnique(profile.engineInputs, "library_top");
  }
  if (/deals .* damage to each opponent|deals .* damage to any target/.test(text)) {
    pushUnique(profile.enginePayoffs, "damage");
    if (/whenever .* enters the battlefield/.test(text)) {
      pushUnique(profile.engineTriggers, "etb_trigger");
      pushUnique(profile.engineInputs, "permanents_etb");
    }
  }
  if (/\+1\/\+1 counter|put .* \+1\/\+1 counter/.test(text) && !/\(when a creature with undying/.test(text)) {
    pushUnique(profile.engineOutputs, "counters");
    pushUnique(profile.engineActions, "counter_placement");
  }
  if (/twice|two times|an additional time|copy .* triggered ability/.test(text)) {
    pushUnique(profile.engineConditions, "trigger_amplify");
    pushUnique(profile.engineActions, "etb_amplify");
  }
  if (/power of each creature you control|creatures you control get \+/.test(text)) {
    pushUnique(profile.enginePayoffs, "combat_buff");
    pushUnique(profile.engineInputs, "creature_count");
  }
  if (/flash.*cast.*top|cast .* from the top of (your|its owner's) library/.test(text)) {
    pushUnique(profile.permissions, "cast_from_exile");
    pushUnique(profile.engineInputs, "library_top");
    pushUnique(profile.engineActions, "top_library_cast");
  }
  if (/from your graveyard|from .* graveyard/.test(text) && /return|cast|play/.test(text)) {
    pushUnique(profile.engineInputs, "graveyard_permanents");
  }
  if (/sacrifice .* creature|whenever .* sacrifice/.test(text)) {
    pushUnique(profile.engineInputs, "sacrifices");
    pushUnique(profile.engineTriggers, "sacrifice_trigger");
  }
  if (/create .* Squirrel|create .* Food|create .* Treasure/.test(text)) {
    pushUnique(profile.resourcesProduced, "tokens");
    pushUnique(profile.engineActions, "token_production");
  }

  if (/whenever you gain life/.test(text)) {
    pushUnique(profile.engineTriggers, "life_gain_trigger");
    pushUnique(profile.engineInputs, "life_gain_events");
  }
  if (/whenever another creature( you control)? enters the battlefield/.test(text)) {
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "permanents_etb");
  }
  if (/whenever a creature you control deals combat damage|deals combat damage to (a player|an opponent|each opponent)/.test(text)) {
    pushUnique(profile.engineTriggers, "combat_damage_trigger");
    pushUnique(profile.engineInputs, "combat_damage");
    if (/add .* mana|create .* Treasure/.test(text)) {
      pushUnique(profile.resourcesProduced, "mana");
      pushUnique(profile.engineActions, "combat_mana_engine");
    }
  }
  if (/\{T\}: Add .* mana/.test(text) || /tap a nonland permanent for mana|whenever you tap a nonland/.test(text)) {
    pushUnique(profile.engineActions, "activated_ability");
    pushUnique(profile.engineCosts, "tap");
    pushUnique(profile.resourcesProduced, "mana");
    if (/power among creatures|greatest power/.test(text)) {
      pushUnique(profile.engineInputs, "creature_count");
    }
  }
  if (/whenever an opponent casts a spell/.test(text)) {
    pushUnique(profile.engineTriggers, "cast_trigger");
    pushUnique(profile.engineInputs, "opponent_spell_casts");
    pushUnique(profile.engineConditions, "tax");
  }
  if (/whenever you cast a (noncreature|artifact|enchantment|instant|sorcery|historic) spell/.test(text)) {
    pushUnique(profile.engineTriggers, "cast_trigger");
    pushUnique(profile.engineInputs, "spell_casts");
  }
  if (/whenever .* (you control )?enters the battlefield.*gain .* life|you gain .* life.*enters the battlefield/.test(text)) {
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "permanents_etb");
    pushUnique(profile.enginePayoffs, "life_gain");
  }
  if (/whenever a (creature|permanent) an opponent controls dies|whenever an opponent's creature dies/.test(text)) {
    pushUnique(profile.engineTriggers, "dies_trigger");
    pushUnique(profile.engineInputs, "opponent_creature_deaths");
  }
  if (/artifact|enchantment/.test(types) && /whenever you cast an artifact|whenever you cast an enchantment|sacrifice an artifact/.test(text)) {
    pushUnique(profile.engineInputs, "artifacts_enchantments");
  }

  const causalInferenceEvidence = applyCommanderCausalInferenceV1_1({
    profile,
    actions: input.actions,
    abilities: input.abilities,
    oracleText: input.oracleText,
  });

  const triggerCount = profile.engineTriggers.length;
  const inputCount = profile.engineInputs.length;
  const permissionCount = profile.permissions.length;
  profile.repeatability = Math.min(1, triggerCount * 0.2 + (text.includes("each") ? 0.25 : 0) + (text.includes("whenever") ? 0.2 : 0));

  const independentAxes = new Set([
    ...profile.engineInputs,
    ...profile.permissions.filter((p) => !p.includes("cast_from")),
  ]);
  const activatedModes = (text.match(/\{[wubrg]\}:/gi) ?? []).length;
  profile.broadFlexibilityScore = Math.min(
    1,
    (independentAxes.size >= 3 ? 0.35 : 0) +
      (permissionCount >= 2 ? 0.25 : 0) +
      (triggerCount >= 3 ? 0.2 : 0) +
      (types.includes("legendary") && inputCount >= 2 ? 0.1 : 0) +
      (activatedModes >= 4 ? 0.35 : activatedModes >= 2 ? 0.2 : 0),
  );

  return { ...profile, causalInferenceEvidence };
}

export function mergeCausalProfiles(profiles: CommanderCausalRoleProfile[]): CommanderCausalRoleProfile {
  const merged: CommanderCausalRoleProfile = {
    engineInputs: [],
    engineConditions: [],
    engineCosts: [],
    engineTriggers: [],
    engineActions: [],
    engineOutputs: [],
    enginePayoffs: [],
    resourcesProduced: [],
    resourcesConsumed: [],
    permissions: [],
    costRequires: [],
    costConsumes: [],
    activatedEngineCosts: [],
    spellCastEvents: [],
    stateScaling: [],
    protectionEffects: [],
    activatedInteractions: [],
    costDependencies: [],
    selfPenaltyConditions: [],
    activatedActions: [],
    outputMultipliers: [],
    stateChangeTriggers: [],
    attritionStages: [],
    tutorCheats: [],
    typeQualifiedTriggers: [],
    staticTypalBuffs: [],
    planeswalkerLoyaltyAbilities: [],
    exileReplacements: [],
    abilityInheritances: [],
    typeCountScaling: [],
    staticTimingRestrictions: [],
    endStepConditionals: [],
    typeQualifiedTutors: [],
    repeatability: 0,
    broadFlexibilityScore: 0,
  };
  for (const p of profiles) {
    for (const key of Object.keys(merged) as (keyof CommanderCausalRoleProfile)[]) {
      if (key === "repeatability" || key === "broadFlexibilityScore") {
        merged[key] = Math.max(merged[key], p[key]);
      } else if (
        key === "spellCastEvents" ||
        key === "stateScaling" ||
        key === "protectionEffects" ||
        key === "activatedInteractions" ||
        key === "costDependencies" ||
        key === "selfPenaltyConditions" ||
        key === "activatedActions" ||
        key === "outputMultipliers" ||
        key === "stateChangeTriggers" ||
        key === "attritionStages" ||
        key === "tutorCheats" ||
        key === "typeQualifiedTriggers" ||
        key === "staticTypalBuffs" ||
        key === "planeswalkerLoyaltyAbilities" ||
        key === "exileReplacements" ||
        key === "abilityInheritances" ||
        key === "typeCountScaling" ||
        key === "staticTimingRestrictions" ||
        key === "endStepConditionals" ||
        key === "typeQualifiedTutors"
      ) {
        merged[key] = [...merged[key], ...p[key]];
      } else {
        for (const v of p[key]) pushUnique(merged[key], v);
      }
    }
  }
  return merged;
}

/** Score how well a pattern is supported by causal DRIVER vs incidental OUTPUT. */
export function computeCausalSupportForPattern(input: {
  patternId: string;
  causal: CommanderCausalRoleProfile;
  profile: CommanderMechanicalProfile;
}): CausalSupportSignals {
  const { causal, patternId } = input;
  const driverTags = new Set([
    ...causal.engineInputs,
    ...causal.engineTriggers,
    ...causal.engineActions,
    ...causal.engineConditions,
    ...causal.engineCosts,
    ...causal.permissions,
  ]);
  const outputTags = new Set([...causal.engineOutputs, ...causal.enginePayoffs, ...causal.resourcesProduced]);
  const feedback =
    (causal.engineInputs.includes("creature_deaths") && outputTags.has("recursion")) ||
    (causal.engineTriggers.includes("dies_trigger") &&
      (outputTags.has("recursion") || outputTags.has("reanimation"))) ||
    (causal.engineInputs.includes("spell_casts") && outputTags.has("create_token")) ||
    (causal.engineInputs.includes("sacrifices") && outputTags.has("counters")) ||
    (causal.engineInputs.includes("land_drops") && outputTags.has("create_token")) ||
    (causal.engineActions.includes("token_production") && causal.resourcesProduced.includes("tokens"))
      ? 0.85
      : 0;

  const patternDriverMap: Record<string, string[]> = {
    token_swarm_engine: ["token_production", "tokens", "create_token"],
    spellslinger_chain_engine: ["cast_trigger", "spell_casts"],
    sacrifice_death_trigger_engine: ["sacrifice_trigger", "sacrifices", "sacrifice_outlet", "death_trigger_amplify"],
    artifact_value_engine: ["artifact_tokens", "activated_ability"],
    voltron_combat_engine: ["auras_equipment", "commander_combat_scaling"],
    aura_voltron_engine: ["auras_equipment", "aura_cast", "equipment_attach"],
    exile_cast_engine: ["cast_from_exile", "exiled_cards"],
    exile_impulse_engine: ["cast_from_exile", "exiled_cards"],
    graveyard_recursion_engine: [
      "cast_from_graveyard",
      "graveyard_permanents",
      "recursion",
      "reanimation",
      "creature_deaths",
      "dies_trigger",
    ],
    self_mill_graveyard_engine: ["mill", "library_to_graveyard", "cast_from_graveyard"],
    mill_library_engine: ["mill", "library_to_graveyard"],
    group_slug_punisher_engine: ["damage"],
    stax_resource_denial_engine: ["tax", "static_modifier", "opponent_actions"],
    enchantress_value_engine: ["cast_trigger"],
    landfall_ramp_engine: ["landfall_trigger", "land_drops"],
    etb_blink_value_engine: ["etb_trigger", "permanents_etb"],
    counters_proliferate_engine: ["counters", "proliferate"],
    combo_tutor_engine: ["tutor"],
    treasure_sacrifice_engine: ["artifact_tokens", "sacrifice", "sacrifices"],
    superfriends_engine: ["planeswalkers", "proliferate"],
    legendary_tribal_engine: ["legendary_permanents"],
    mana_ability_combo_engine: ["activated_ability", "mana"],
    ninja_tempo_engine: ["ninjutsu", "combat_attacks"],
    goodstuff_value_engine: [],
  };

  const drivers = patternDriverMap[patternId] ?? [];
  let driverHits = 0;
  for (const d of drivers) {
    if (driverTags.has(d) || causal.engineInputs.includes(d) || causal.engineTriggers.includes(d)) driverHits += 1;
  }
  let driverSupport = drivers.length > 0 ? Math.min(1, driverHits / Math.max(1, drivers.length * 0.6)) : 0.3;

  if (patternId === "mill_library_engine" && (input.profile.derivedRoles.mill ?? 0) >= 0.9) {
    driverSupport = Math.max(driverSupport, 0.85);
  }
  if (
    patternId === "sacrifice_death_trigger_engine" &&
    (causal.engineConditions.includes("death_trigger_amplify") || (input.profile.derivedRoles.sacrifice_payoff ?? 0) >= 0.8)
  ) {
    driverSupport = Math.max(driverSupport, 0.72);
  }
  if (patternId === "exile_cast_engine" && (input.profile.derivedRoles.cast_from_exile ?? 0) >= 0.8) {
    driverSupport = Math.max(driverSupport, 0.75);
  }
  if (patternId === "exile_impulse_engine" && (input.profile.derivedRoles.cast_from_exile ?? 0) >= 0.8) {
    driverSupport = Math.max(driverSupport, 0.75);
  }
  if (patternId === "etb_blink_value_engine" && causal.engineTriggers.includes("etb_trigger")) {
    driverSupport = Math.max(driverSupport, 0.7);
  }
  if (patternId === "goodstuff_value_engine") {
    driverSupport = Math.max(driverSupport, causal.broadFlexibilityScore);
  }
  if (patternId === "landfall_ramp_engine" && causal.engineInputs.includes("land_drops")) {
    driverSupport = Math.max(driverSupport, 0.72);
  }

  let payoffHits = 0;
  for (const d of drivers) {
    if (outputTags.has(d)) payoffHits += 1;
  }
  const payoffSupport = Math.min(1, payoffHits / Math.max(1, drivers.length || 1));

  const incidentalSupport = payoffSupport > 0.3 && driverSupport < 0.25 ? payoffSupport * 0.6 : 0;

  return {
    driverSupport,
    payoffSupport,
    feedbackSupport: feedback,
    incidentalSupport,
  };
}
