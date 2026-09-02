/**
 * Commander causal inference v1.1 — derived rules on frozen RC8 + oracle text.
 * NOT an RC8 revision. Separately versioned interpretation layer.
 */
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { CommanderCausalRoleProfile } from "./commander-causal-roles-v1";
import type {
  ActivatedActionInference,
  ActivatedActionMechanism,
  AttritionStageInference,
  OutputMultiplierInference,
  OutputMultiplierType,
  StateChangeTriggerInference,
  TutorCheatInference,
  TypeQualifiedTriggerInference,
} from "./commander-causal-roles-v1";
import { applyPhase56CausalInference } from "./phase56-causal-inference";

export const COMMANDER_CAUSAL_INFERENCE_VERSION = "commander-causal-inference-v1.6";

export type CausalInferenceEvidence = {
  ruleId: string;
  source: "oracle_text" | "ability_span" | "rc8_action";
  detail: string;
  spanText?: string;
};

export type InferredEtbTrigger = {
  event: "etb";
  objectClass: "creature" | "permanent" | "another_creature" | "controlled_creature" | "any_creature";
  controller: "you" | "any";
  payoffTags: string[];
};

export type InferredCombatConversion = {
  trigger: "combat_damage";
  resourceOutput: "mana" | "treasure" | "draw";
  driverTags: string[];
};

export type InferredCastProduction = {
  castObjectClass: "artifact" | "enchantment" | "instant" | "sorcery" | "creature" | "spell" | "historic";
  outputTags: string[];
};

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

function collectTexts(input: {
  oracleText: string;
  abilities: SemanticAbility[];
}): Array<{ text: string; source: "oracle_text" | "ability_span" }> {
  const out: Array<{ text: string; source: "oracle_text" | "ability_span" }> = [];
  if (input.oracleText.trim()) out.push({ text: input.oracleText.toLowerCase(), source: "oracle_text" });
  for (const ability of input.abilities) {
    const span = ability.abilitySpan?.text?.trim();
    if (span) out.push({ text: span.toLowerCase(), source: "ability_span" });
  }
  return out;
}

function inferEtbTriggers(text: string): InferredEtbTrigger | null {
  if (/whenever another creature you control enters( the battlefield)?[, ]/.test(text)) {
    return {
      event: "etb",
      objectClass: "another_creature",
      controller: "you",
      payoffTags: inferPayoffTags(text),
    };
  }
  if (/whenever another creature( you control)? enters the battlefield/.test(text)) {
    return {
      event: "etb",
      objectClass: "another_creature",
      controller: "you",
      payoffTags: inferPayoffTags(text),
    };
  }
  if (/whenever another (artifact|enchantment|permanent)( you control)? enters the battlefield/.test(text)) {
    return {
      event: "etb",
      objectClass: "permanent",
      controller: "you",
      payoffTags: inferPayoffTags(text),
    };
  }
  if (/whenever a (creature|permanent) (you control )?enters the battlefield/.test(text)) {
    return {
      event: "etb",
      objectClass: text.includes("creature") ? "controlled_creature" : "permanent",
      controller: "you",
      payoffTags: inferPayoffTags(text),
    };
  }
  if (/whenever .* enters the battlefield under your control/.test(text)) {
    return {
      event: "etb",
      objectClass: "permanent",
      controller: "you",
      payoffTags: inferPayoffTags(text),
    };
  }
  return null;
}

function inferPayoffTags(text: string): string[] {
  const tags: string[] = [];
  if (/deals .* damage|deal .* damage/.test(text)) tags.push("damage");
  if (/gain .* life|you gain .* life/.test(text)) tags.push("life_gain");
  if (/create .* token|create a .* token/.test(text)) tags.push("create_token");
  if (/draw a card|draw .* card/.test(text)) tags.push("card_draw");
  if (/\+1\/\+1 counter|put .* counter/.test(text)) tags.push("counters");
  if (/add .* mana|create .* Treasure/.test(text)) tags.push("mana");
  return tags;
}

function inferCombatConversion(text: string): InferredCombatConversion | null {
  const hasCombatTrigger =
    /whenever .* deals combat damage/.test(text) ||
    /whenever a creature you control deals combat damage/.test(text) ||
    (/deals combat damage to (a player|an opponent|each opponent)/.test(text) && /whenever/.test(text));

  if (!hasCombatTrigger) return null;

  const resourceOutput: InferredCombatConversion["resourceOutput"] = /add .* mana|add \{/.test(text)
    ? "mana"
    : /create .* Treasure/.test(text)
      ? "treasure"
      : /draw a card/.test(text)
        ? "draw"
        : "mana";

  return {
    trigger: "combat_damage",
    resourceOutput,
    driverTags: ["combat_damage_trigger", "combat_damage"],
  };
}

function inferCastProduction(text: string): InferredCastProduction | null {
  const castMatch = text.match(
    /whenever you cast an? (artifact|enchantment|instant|sorcery|creature|historic) spell|whenever you cast a (artifact|enchantment|instant|sorcery|creature|historic)|creature spells you cast gain offspring|as you cast (a|them)/,
  );
  const castClass = (castMatch?.[1] ?? castMatch?.[2]) as InferredCastProduction["castObjectClass"] | undefined;
  const hasCreatureCast = /creature spells you cast|when you cast a creature spell|whenever you cast a creature/.test(text);
  if (!castClass && !/whenever you cast a spell/.test(text) && !hasCreatureCast) return null;

  const outputTags: string[] = [];
  if (/create .* token|create a .* token|create a 1\/1 token/.test(text)) outputTags.push("create_token");
  if (/when that creature enters|when .* enters, create/.test(text)) outputTags.push("etb_token_payoff");
  if (/create .* copy|copy of/.test(text)) outputTags.push("copy");
  if (/draw a card/.test(text)) outputTags.push("card_draw");
  if (/deals .* damage|deal .* damage/.test(text)) outputTags.push("damage");
  if (/\+1\/\+1 counter|put .* counter/.test(text)) outputTags.push("counters");
  if (/return .* from .* graveyard|put .* onto the battlefield/.test(text)) outputTags.push("cheat_into_play");

  if (outputTags.length === 0 && !castClass && !hasCreatureCast) return null;

  return {
    castObjectClass: castClass ?? (hasCreatureCast ? "creature" : "spell"),
    outputTags,
  };
}

function inferActivatedSacrificeCost(text: string): {
  requires: string[];
  consumes: string[];
  costKey: string;
} | null {
  if (/\{[^}]+\},?\s*sacrifice two artifacts/.test(text)) {
    return { requires: ["artifacts"], consumes: ["artifacts"], costKey: "sacrifice_two_artifacts" };
  }
  if (/\{[^}]+\},?\s*sacrifice an artifact/.test(text) || /\{[^}]+\},?\s*sacrifice a artifact/.test(text)) {
    return { requires: ["artifacts"], consumes: ["artifacts"], costKey: "sacrifice_one_artifact" };
  }
  if (/\{[^}]+\},?\s*sacrifice a creature/.test(text)) {
    return { requires: ["creatures"], consumes: ["creatures"], costKey: "sacrifice_one_creature" };
  }
  if (/\{[^}]+\},?\s*sacrifice another creature/.test(text)) {
    return { requires: ["creatures"], consumes: ["creatures"], costKey: "sacrifice_another_creature" };
  }
  if (/\{[^}]+\},?\s*sacrifice .* permanent/.test(text)) {
    return { requires: ["permanents"], consumes: ["permanents"], costKey: "sacrifice_permanent" };
  }
  return null;
}

function applyActivatedSacrificeCostInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const inferred = inferActivatedSacrificeCost(text);
  if (!inferred) return;

  pushUnique(profile.engineActions, "activated_ability");
  pushUnique(profile.engineCosts, "sacrifice");
  for (const req of inferred.requires) pushUnique(profile.costRequires, req);
  for (const cons of inferred.consumes) pushUnique(profile.costConsumes, cons);
  pushUnique(profile.activatedEngineCosts, inferred.costKey);
  if (inferred.requires.includes("artifacts")) pushUnique(profile.engineInputs, "artifacts_enchantments");

  evidence.push({
    ruleId: "activated_sacrifice_cost_dependency",
    source,
    detail: `activated cost consumes ${inferred.consumes.join(", ")} → deckbuilding dependency (COST != EFFECT)`,
    spanText,
  });
}

function inferPowerScaledMana(text: string): boolean {
  return (
    /\{t\}: add .*mana.*power (among|of) creatures you control/.test(text) ||
    /\{t\}: add .* for each .*power/.test(text) ||
    /add .* mana of any (type|color).*greatest power/.test(text) ||
    /add .* \{[wubrg]\}.*where .*power/.test(text)
  );
}

function applyPowerScaledManaInference(
  profile: CommanderCausalRoleProfile,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  pushUnique(profile.engineActions, "activated_ability");
  pushUnique(profile.engineCosts, "tap");
  pushUnique(profile.resourcesProduced, "mana");
  pushUnique(profile.engineInputs, "creature_count");
  pushUnique(profile.engineConditions, "power_scaled");
  evidence.push({
    ruleId: "power_scaled_activated_mana",
    source,
    detail: "repeatable commander-accessible mana scales with creature power",
    spanText,
  });
}

function inferPostcombatManaFromLifeLoss(text: string): boolean {
  return (
    /add \{[wubrg]\} for each .* life your opponents have lost/.test(text) ||
    /postcombat main phases.*add .*mana/.test(text) ||
    /for each 1 life your opponents have lost this turn/.test(text)
  );
}

function applyEtbInference(
  profile: CommanderCausalRoleProfile,
  inferred: InferredEtbTrigger,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  pushUnique(profile.engineTriggers, "etb_trigger");
  pushUnique(profile.engineInputs, "permanents_etb");
  pushUnique(profile.engineInputs, "another_object_etb");
  if (inferred.objectClass.includes("creature")) pushUnique(profile.engineInputs, "creature_supply");
  if (inferred.controller === "you") pushUnique(profile.engineConditions, "controlled_permanents");

  for (const tag of inferred.payoffTags) {
    if (tag === "damage") pushUnique(profile.enginePayoffs, "damage");
    if (tag === "life_gain") pushUnique(profile.enginePayoffs, "life_gain");
    if (tag === "create_token") {
      pushUnique(profile.engineOutputs, "create_token");
      pushUnique(profile.resourcesProduced, "tokens");
    }
    if (tag === "card_draw") pushUnique(profile.engineOutputs, "card_draw");
    if (tag === "counters") pushUnique(profile.engineOutputs, "counters");
    if (tag === "mana") pushUnique(profile.resourcesProduced, "mana");
  }

  evidence.push({
    ruleId: "etb_another_object_trigger",
    source,
    detail: `ETB ${inferred.objectClass} (${inferred.controller}) → ${inferred.payoffTags.join(", ") || "payoff"}`,
    spanText,
  });
}

function applyCombatConversionInference(
  profile: CommanderCausalRoleProfile,
  inferred: InferredCombatConversion,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  for (const tag of inferred.driverTags) {
    if (tag.includes("trigger")) pushUnique(profile.engineTriggers, tag);
    else pushUnique(profile.engineInputs, tag);
  }
  pushUnique(profile.engineActions, "combat_mana_engine");
  pushUnique(profile.engineConditions, "combat_damage_conversion");
  if (inferred.resourceOutput === "mana") pushUnique(profile.resourcesProduced, "mana");
  if (inferred.resourceOutput === "treasure") pushUnique(profile.resourcesProduced, "artifact_tokens");
  if (inferred.resourceOutput === "draw") pushUnique(profile.engineOutputs, "card_draw");

  evidence.push({
    ruleId: "combat_damage_resource_conversion",
    source,
    detail: `combat damage → ${inferred.resourceOutput}`,
    spanText,
  });
}

function applyCastProductionInference(
  profile: CommanderCausalRoleProfile,
  inferred: InferredCastProduction,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  pushUnique(profile.engineTriggers, "cast_trigger");
  pushUnique(profile.engineInputs, "spell_casts");
  pushUnique(profile.engineInputs, `${inferred.castObjectClass}_spells`);
  if (inferred.castObjectClass === "artifact" || inferred.castObjectClass === "enchantment") {
    pushUnique(profile.engineInputs, "artifacts_enchantments");
  }

  for (const tag of inferred.outputTags) {
    if (tag === "etb_token_payoff") {
      pushUnique(profile.engineTriggers, "etb_trigger");
      pushUnique(profile.engineInputs, "permanents_etb");
    }
    if (tag === "create_token") {
      pushUnique(profile.engineOutputs, "create_token");
      pushUnique(profile.resourcesProduced, "tokens");
      pushUnique(profile.engineActions, "token_production");
    }
    if (tag === "copy") pushUnique(profile.engineActions, "copy");
    if (tag === "card_draw") pushUnique(profile.engineOutputs, "card_draw");
    if (tag === "damage") pushUnique(profile.enginePayoffs, "damage");
    if (tag === "counters") pushUnique(profile.engineOutputs, "counters");
    if (tag === "cheat_into_play") pushUnique(profile.engineActions, "put_onto_battlefield");
  }

  evidence.push({
    ruleId: "cast_trigger_object_production",
    source,
    detail: `cast ${inferred.castObjectClass} → ${inferred.outputTags.join(", ") || "object_output"}`,
    spanText,
  });
}

function inferSpellCastEvents(text: string): Array<{
  actor: "you" | "opponent" | "any_player";
  objectRestriction?: string;
  ordinal?: number;
  ordinalScope?: "turn";
  frequency?: "first_each_turn" | "each";
  resultingActions: string[];
}> {
  const events: Array<{
    actor: "you" | "opponent" | "any_player";
    objectRestriction?: string;
    ordinal?: number;
    frequency?: "first_each_turn" | "each";
    resultingActions: string[];
    ordinalScope?: "turn";
  }> = [];

  const playerCastMatch = text.match(
    /whenever a player casts an? ([\w ]+?) spell[, ]/,
  );
  if (playerCastMatch) {
    const restriction = playerCastMatch[1]?.trim();
    const actions: string[] = [];
    if (/deals .* damage|deal .* damage/.test(text)) actions.push("damage");
    events.push({
      actor: "any_player",
      objectRestriction: restriction,
      frequency: "each",
      resultingActions: actions,
    });
  }

  const youFirstSpellMatch = text.match(/whenever you cast your first spell each turn/);
  if (youFirstSpellMatch) {
    const actions: string[] = [];
    if (/deals .* damage|deal .* damage/.test(text)) actions.push("damage");
    if (/draw a card/.test(text)) actions.push("card_draw");
    events.push({
      actor: "you",
      ordinal: 1,
      ordinalScope: "turn",
      frequency: "first_each_turn",
      resultingActions: actions,
    });
  }

  const opponentFirstMatch = text.match(
    /whenever an opponent casts their first spell each turn[, ]/,
  );
  if (opponentFirstMatch) {
    const actions: string[] = [];
    if (/counter that spell/.test(text)) actions.push("counter");
    events.push({
      actor: "opponent",
      frequency: "first_each_turn",
      resultingActions: actions,
    });
  }

  const opponentCastMatch = text.match(/whenever an opponent casts an? ([\w ]+?) spell/);
  if (opponentCastMatch && !opponentFirstMatch) {
    events.push({
      actor: "opponent",
      objectRestriction: opponentCastMatch[1]?.trim(),
      frequency: "each",
      resultingActions: /counter/.test(text) ? ["counter"] : [],
    });
  }

  const youCastMatch = text.match(/whenever you cast an? ([\w ]+?) spell/);
  if (youCastMatch) {
    const actions: string[] = [];
    if (/create .* token/.test(text)) actions.push("create_token");
    if (/draw a card/.test(text)) actions.push("card_draw");
    if (/deals .* damage/.test(text)) actions.push("damage");
    events.push({
      actor: "you",
      objectRestriction: youCastMatch[1]?.trim(),
      frequency: "each",
      resultingActions: actions,
    });
  }

  const youSecondSpellMatch = text.match(/whenever you cast your second spell each turn/);
  if (youSecondSpellMatch) {
    const actions: string[] = [];
    if (/draw a card/.test(text)) actions.push("card_draw");
    events.push({
      actor: "you",
      ordinal: 2,
      ordinalScope: "turn",
      frequency: "each",
      resultingActions: actions,
    });
  }

  if (/the second spell you cast each turn costs/.test(text)) {
    events.push({
      actor: "you",
      ordinal: 2,
      ordinalScope: "turn",
      frequency: "each",
      resultingActions: ["cost_reduction"],
    });
  }

  const nthSpellMatch = text.match(/whenever the (\w+) spell of a turn is cast/);
  if (nthSpellMatch) {
    const word = nthSpellMatch[1];
    const ordinals: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
    };
    const n = ordinals[word] ?? parseInt(word, 10);
    if (Number.isFinite(n)) {
      events.push({
        actor: "any_player",
        ordinal: n,
        ordinalScope: "turn",
        frequency: "each",
        resultingActions: /flip|transform/.test(text) ? ["transform"] : [],
      });
    }
  }

  return events;
}

function applySpellCastEventInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const events = inferSpellCastEvents(text);
  for (const event of events) {
    pushUnique(profile.engineTriggers, "cast_trigger");
    if (event.actor === "you") pushUnique(profile.engineInputs, "controller_spell_casts");
    if (event.actor === "opponent") pushUnique(profile.engineInputs, "opponent_spell_casts");
    if (event.actor === "any_player") pushUnique(profile.engineInputs, "player_spell_casts");
    if (event.objectRestriction?.includes("noncreature")) pushUnique(profile.engineInputs, "noncreature_spell_casts");
    if (event.frequency === "first_each_turn") pushUnique(profile.engineInputs, "first_spell_each_turn");
    if (event.ordinal) pushUnique(profile.engineInputs, `nth_spell_of_turn_${event.ordinal}`);

    for (const action of event.resultingActions) {
      if (action === "damage") pushUnique(profile.enginePayoffs, "damage");
      if (action === "counter") pushUnique(profile.engineActions, "counter");
      if (action === "create_token") {
        pushUnique(profile.engineActions, "token_production");
        pushUnique(profile.resourcesProduced, "tokens");
        pushUnique(profile.engineOutputs, "create_token");
      }
      if (action === "card_draw") pushUnique(profile.engineOutputs, "card_draw");
      if (action === "cost_reduction") {
        pushUnique(profile.engineActions, "cost_reduction");
        profile.stateScaling.push({
          scalingBasis: `nth_spell_${event.ordinal ?? 2}_cost_reduction`,
          countedObjects: ["spells_cast"],
          scaledQuantity: "cost_reduction",
          controller: "you",
        });
      }
    }

    if (event.actor === "any_player" && event.resultingActions.includes("damage")) {
      profile.selfPenaltyConditions.push({
        trigger: "controller_casts_noncreature_spell",
        actor: "controller",
        penalty: "damage_to_self",
        constructionImplication: [
          "prefer_creature_based_ramp",
          "prefer_creature_based_interaction",
          "reduce_unnecessary_noncreature_spell_density",
        ],
      });
    }

    profile.spellCastEvents.push({
      eventId: `spell_${profile.spellCastEvents.length + 1}`,
      ...event,
      spanText: spanText?.slice(0, 120),
    });

    evidence.push({
      ruleId: "spell_cast_event_parser",
      source,
      detail: `${event.actor} casts ${event.objectRestriction ?? "spell"} → ${event.resultingActions.join(", ") || "effect"}`,
      spanText,
    });
  }
}

function applyStateScalingInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const ptEqualsMatch = text.match(
    /power and toughness are each equal to the number of (untapped )?([\w, ]+?) you control/,
  );
  if (ptEqualsMatch) {
    const untapped = !!ptEqualsMatch[1];
    const objects = ptEqualsMatch[2]?.split(/,|\sand\s/).map((s) => s.trim()).filter(Boolean) ?? [];
    pushUnique(profile.engineConditions, "static_modifier");
    pushUnique(profile.engineInputs, "creature_count");
    if (untapped) pushUnique(profile.engineInputs, "untapped_permanents");
    profile.stateScaling.push({
      scalingBasis: untapped ? "untapped_permanents_count" : "permanents_count",
      countedObjects: objects.length > 0 ? objects : ["permanents"],
      stateFilter: untapped ? "untapped" : undefined,
      scaledQuantity: "both",
      controller: "you",
    });
    evidence.push({
      ruleId: "state_scaling_pt_equals",
      source,
      detail: `P/T scales with ${untapped ? "untapped " : ""}${objects.join(", ")}`,
      spanText,
    });
  }

  const getsPlusMatch = text.match(/gets \+(\d+)\/\+(\d+) for each ([\w ]+)/);
  if (getsPlusMatch) {
    profile.stateScaling.push({
      scalingBasis: `plus_for_each_${getsPlusMatch[3]?.trim()}`,
      countedObjects: [getsPlusMatch[3]?.trim() ?? "object"],
      scaledQuantity: "both",
      controller: "you",
    });
    pushUnique(profile.engineConditions, "static_modifier");
    evidence.push({
      ruleId: "state_scaling_gets_plus",
      source,
      detail: `+${getsPlusMatch[1]}/+${getsPlusMatch[2]} for each ${getsPlusMatch[3]}`,
      spanText,
    });
  }
}

function applyProtectionInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (
    /when .* enters, you may tap.*when you do, .* gains indestructible/.test(text) ||
    (/when .* enters.*may tap/.test(text) && /gains indestructible until end of turn/.test(text))
  ) {
    profile.protectionEffects.push({
      kind: "TARGETED_PROTECTION",
      protectionType: "indestructible",
      subject: "another_nonattacking_creature",
      condition: "etb_tap",
    });
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "permanents_etb");
    pushUnique(profile.engineOutputs, "protection_grant");
    evidence.push({
      ruleId: "targeted_indestructible_protection",
      source,
      detail: "ETB tap → grant indestructible to another creature",
      spanText,
    });
  }

  if (/other tapped creatures you control have hexproof/.test(text)) {
    profile.protectionEffects.push({
      kind: "STATIC_PROTECTION",
      protectionType: "hexproof",
      subject: "tapped_creatures_you_control",
      condition: "tapped",
    });
    pushUnique(profile.engineConditions, "static_modifier");
    pushUnique(profile.engineInputs, "tapped_creatures");
    evidence.push({
      ruleId: "static_hexproof_tapped",
      source,
      detail: "tapped creatures gain hexproof",
      spanText,
    });
  }
}

function applyActivatedInteractionInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const tapDamageCreature = text.match(
    /\{t\}: .* deals (\d+) damage to target (attacking or blocking )?creature/,
  );
  if (tapDamageCreature) {
    profile.activatedInteractions.push({
      costType: "tap",
      targetClasses: ["creature", tapDamageCreature[2] ? "attacking_or_blocking_creature" : "creature"],
      effect: "creature_removal",
      magnitude: parseInt(tapDamageCreature[1] ?? "0", 10) || undefined,
    });
    pushUnique(profile.engineActions, "activated_ability");
    pushUnique(profile.engineCosts, "tap");
    pushUnique(profile.enginePayoffs, "creature_damage");
    evidence.push({
      ruleId: "activated_creature_removal",
      source,
      detail: "tap → damage to target creature",
      spanText,
    });
  }

  const manaDamageCreature = text.match(
    /\{[^}]+\}: .* deals (\d+) damage to target creature/,
  );
  if (manaDamageCreature && !tapDamageCreature) {
    profile.activatedInteractions.push({
      costType: "mana",
      targetClasses: ["creature"],
      effect: "creature_removal",
      magnitude: parseInt(manaDamageCreature[1] ?? "0", 10) || undefined,
    });
    pushUnique(profile.engineActions, "activated_ability");
    pushUnique(profile.enginePayoffs, "creature_damage");
    evidence.push({
      ruleId: "activated_mana_creature_removal",
      source,
      detail: "mana → damage to target creature",
      spanText,
    });
  }

  if (/whenever a creature an opponent controls is dealt damage.*put .* \+1\/\+1 counter/.test(text)) {
    pushUnique(profile.engineTriggers, "triggered");
    pushUnique(profile.engineInputs, "opponent_creature_damaged");
    pushUnique(profile.engineOutputs, "counters");
    pushUnique(profile.engineActions, "counter_placement");
    evidence.push({
      ruleId: "opponent_creature_damaged_counter",
      source,
      detail: "opponent creature damaged → counter on commander",
      spanText,
    });
  }
}

function applyCostDependencyInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (/convoke/.test(text)) {
    profile.costDependencies.push({
      dependency: "convoke",
      requiredResource: "untapped_creatures",
      effect: "reduce_casting_cost",
    });
    pushUnique(profile.engineCosts, "convoke");
    pushUnique(profile.costRequires, "untapped_creatures");
    pushUnique(profile.engineActions, "cast_or_play");
    evidence.push({
      ruleId: "convoke_cost_dependency",
      source,
      detail: "convoke — untapped creatures pay casting cost",
      spanText,
    });
  }
}

function hasActivatedAbilityStructure(text: string): boolean {
  return (
    /\{t\}:/.test(text) ||
    /[\u2014\-]\s*\{t\}:/.test(text) ||
    /(?:\{[^}]+\}(?:,\s*)?)+\{t\}:/.test(text) ||
    /pay \d+ life:/.test(text) ||
    /remove (?:one or more )?\+1\/\+1 counters? from/.test(text) ||
    /\{[^}]+\},?\s*remove .* \+1\/\+1 counters? from/.test(text) ||
    /,\s*sacrifice .+:/.test(text) ||
    /^sacrifice [^:]+:/im.test(text) ||
    /(?:^|[.\n]\s*)sacrifice a [^:]+:/i.test(text) ||
    (/\{[^}]+\}:/.test(text) && !/^whenever |^when |^at the beginning|^at end of|^if /.test(text.trim()))
  );
}

function inferActivatedActionMechanism(text: string): ActivatedActionMechanism | null {
  if (/switch .* power and toughness|switch each creature's power and toughness/.test(text)) {
    return "GLOBAL_CHARACTERISTIC_TRANSFORMATION";
  }
  if (/for each .* token.*create a token that's a copy|create a token that's a copy of (?:that|each)/.test(text)) {
    return "COPY";
  }
  if (/create .* token|create a \d+\/\d+ .* token|create that many .* token/.test(text)) {
    return "TOKEN_GENERATION";
  }
  if (/adapt \d+|put .* \+1\/\+1 counter|proliferate/.test(text)) {
    return "COUNTER_PLACEMENT";
  }
  if (/draw .* card|draw a card/.test(text)) {
    return "DRAW";
  }
  if (/return .* from .* graveyard|return target .* from .* graveyard to the battlefield/.test(text)) {
    return "RECURSION";
  }
  if (/deals .* damage to target|destroy target|exile target creature/.test(text)) {
    return "CREATURE_REMOVAL";
  }
  if (/deals .* damage to any target|deal .* damage to any target/.test(text)) {
    return "CREATURE_REMOVAL";
  }
  if (/add .* mana|add \{/.test(text) || /add that much \{c\}/.test(text)) {
    return "MANA_GENERATION";
  }
  if (/untap target/.test(text)) {
    return "UNTAP";
  }
  if (/exile the top .* cards? of your library.*(?:play|cast) them|you may play them this turn without paying/.test(text)) {
    return "CAST_FROM_EXILE";
  }
  if (/exile the top .* create .* token/.test(text)) {
    return "TOKEN_GENERATION";
  }
  if (/look at the top .* you may exile|exile it face down/.test(text)) {
    return "CAST_FROM_EXILE";
  }
  if (/you may play .* exiled|play cards exiled with|play cards exiled/.test(text)) {
    return "CAST_FROM_EXILE";
  }
  if (/put .* \+1\/\+1 counter|gains indestructible until end of turn/.test(text)) {
    return "COUNTER_PLACEMENT";
  }
  if (/scry \d+/.test(text) && (/\{t\}:/.test(text) || /[\u2014\-]\s*\{t\}:/.test(text) || /\{[^}]+\}: scry/.test(text))) {
    return "SCRY";
  }
  return null;
}

function inferActivatedCostType(text: string): ActivatedActionInference["costType"] {
  if (/remove (?:one or more )?\+1\/\+1 counters? from/.test(text)) return "counter_removal";
  if (/\{[^}]+\},?\s*remove .* \+1\/\+1 counters? from/.test(text)) return "counter_removal";
  if (/,\s*sacrifice .+:/.test(text) || /sacrifice a [^:]+:/.test(text)) return "sacrifice";
  if (/pay \d+ life:/.test(text)) return "life";
  if (/\{t\}:/.test(text) || /,\s*\{t\}:/.test(text) || /[\u2014\-]\s*\{t\}:/.test(text)) return "tap";
  return "mana";
}

function extractManaCostActivatedSegments(text: string): string[] {
  const segments: string[] = [];
  const re = /(?:\{[^}]+\}){1,8}:/g;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 24), match.index);
    if (/whenever |when |at the beginning|at end of|if a |if you /.test(before)) continue;
    starts.push(match.index);
  }

  const namedTapRe = /[^.]+[\u2014\-]\s*\{t\}:/gi;
  let namedMatch: RegExpExecArray | null;
  while ((namedMatch = namedTapRe.exec(text)) !== null) {
    const before = text.slice(Math.max(0, namedMatch.index - 24), namedMatch.index);
    if (/whenever |when |at the beginning|at end of/.test(before)) continue;
    starts.push(namedMatch.index + namedMatch[0].indexOf("{t}"));
  }

  const counterRemovalRe =
    /\{[^}]+\},?\s*remove (?:\w+ )?\+1\/\+1 counters? from [^:]+:/gi;
  let crMatch: RegExpExecArray | null;
  while ((crMatch = counterRemovalRe.exec(text)) !== null) {
    starts.push(crMatch.index);
  }

  const sacrificeDrawRe = /(?:\{[^}]+\},?\s*)?sacrifice [^:]+:/gi;
  let sdMatch: RegExpExecArray | null;
  while ((sdMatch = sacrificeDrawRe.exec(text)) !== null) {
    const before = text.slice(Math.max(0, sdMatch.index - 24), sdMatch.index);
    if (/whenever |when /.test(before)) continue;
    starts.push(sdMatch.index);
  }

  const uniqueStarts = [...new Set(starts)].sort((a, b) => a - b);
  for (let i = 0; i < uniqueStarts.length; i++) {
    const end = i + 1 < uniqueStarts.length ? uniqueStarts[i + 1]! : text.length;
    const faceBreak = text.indexOf(" // ", uniqueStarts[i]!);
    const segmentEnd = faceBreak >= 0 && faceBreak < end ? faceBreak : end;
    segments.push(text.slice(uniqueStarts[i], segmentEnd).trim());
  }
  return segments;
}

function splitActivatedAbilitySpans(text: string): string[] {
  const segments = extractManaCostActivatedSegments(text);
  if (segments.length > 0) return segments;

  const spans: string[] = [];
  const abilityPattern =
    /(?:(?:\{[^}]+\}(?:,\s*)?)+\{t\}:|(?:\{[^}]+\}(?:,\s*)?)+\{t\},|\{t\}:|pay \d+ life:|remove (?:one or more )?\+1\/\+1 counters? from[^.:]+:)[^.]+(?:\.|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = abilityPattern.exec(text)) !== null) {
    spans.push(match[0].trim());
  }
  if (spans.length === 0 && hasActivatedAbilityStructure(text)) {
    spans.push(text);
  }
  return spans;
}

function applyActivatedActionInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const spans = splitActivatedAbilitySpans(text);
  for (const span of spans.length > 0 ? spans : [text]) {
    if (!hasActivatedAbilityStructure(span)) continue;
    const mechanism = inferActivatedActionMechanism(span);
    const modalOutcomes = inferModalActivatedOutcomes(span);
    const mechanismsToRecord =
      modalOutcomes.length > 0 ? modalOutcomes : mechanism ? [mechanism] : [];
    if (mechanismsToRecord.length === 0) continue;

    const costType = inferActivatedCostType(span);

    for (const mech of mechanismsToRecord) {
      const action: ActivatedActionInference = {
        actionId: `activated_${profile.activatedActions.length + 1}`,
        costType,
        costDetail: span.slice(0, 80),
        mechanism: mech,
        resourcesConsumed:
          costType === "counter_removal"
            ? ["commander_counters"]
            : costType === "sacrifice"
              ? ["sacrifice_fodder"]
              : undefined,
        spanText: (spanText ?? span).slice(0, 120),
      };

      const duplicate = profile.activatedActions.some(
        (a) => a.mechanism === action.mechanism && a.costType === action.costType,
      );
      if (duplicate) continue;

    profile.activatedActions.push(action);
    pushUnique(profile.engineActions, "activated_ability");
    if (costType === "tap") pushUnique(profile.engineCosts, "tap");
    if (costType === "life") pushUnique(profile.costConsumes, "life");
    if (costType === "counter_removal") {
      pushUnique(profile.costConsumes, "commander_counters");
      pushUnique(profile.engineInputs, "commander_counters");
      pushUnique(profile.engineActions, "counter_conversion");
    }
    if (costType === "sacrifice") {
      pushUnique(profile.engineCosts, "sacrifice");
      pushUnique(profile.costConsumes, "sacrifice_fodder");
    }
    if (action.resourcesConsumed) {
      for (const r of action.resourcesConsumed) pushUnique(profile.costConsumes, r);
    }

    switch (mech) {
      case "TOKEN_GENERATION":
        pushUnique(profile.engineActions, "token_production");
        pushUnique(profile.resourcesProduced, "tokens");
        pushUnique(profile.engineOutputs, "create_token");
        if (/exile the top|mill/.test(span)) pushUnique(profile.engineInputs, "library_top");
        break;
      case "COUNTER_PLACEMENT":
        pushUnique(profile.engineActions, "counter_placement");
        pushUnique(profile.engineOutputs, "counters");
        if (/artifact/.test(span)) pushUnique(profile.engineInputs, "artifacts_enchantments");
        break;
      case "COPY":
        pushUnique(profile.engineActions, "copy");
        pushUnique(profile.engineActions, "token_production");
        pushUnique(profile.resourcesProduced, "tokens");
        pushUnique(profile.engineInputs, "tokens");
        break;
      case "DRAW":
        pushUnique(profile.engineOutputs, "card_draw");
        break;
      case "SCRY":
        pushUnique(profile.engineActions, "scry");
        pushUnique(profile.engineInputs, "scry_events");
        break;
      case "RECURSION":
        pushUnique(profile.enginePayoffs, "recursion");
        pushUnique(profile.engineInputs, "graveyard_permanents");
        break;
      case "CREATURE_REMOVAL":
        pushUnique(profile.engineActions, "removal");
        break;
      case "MANA_GENERATION":
        pushUnique(profile.resourcesProduced, "mana");
        if (/counter/.test(span)) {
          pushUnique(profile.engineInputs, "artifacts_enchantments");
          pushUnique(profile.engineInputs, "counters_on_permanents");
        }
        break;
      case "UNTAP":
        pushUnique(profile.engineActions, "untap_engine");
        break;
      case "CAST_FROM_EXILE":
        pushUnique(profile.permissions, "cast_from_exile");
        pushUnique(profile.engineInputs, "exiled_cards");
        pushUnique(profile.engineInputs, "library_top");
        pushUnique(profile.engineActions, "top_library_cast");
        if (/cost .* less to cast|costs? .* less to cast/.test(span)) {
          pushUnique(profile.engineConditions, "cost_reduction");
        }
        break;
    }

    evidence.push({
      ruleId: "activated_action_structure",
      source,
      detail: `activated ${costType} → ${mech}`,
      spanText: action.spanText,
    });
    }
  }
}

function inferModalActivatedOutcomes(text: string): ActivatedActionMechanism[] {
  if (!/choose one/.test(text)) return [];
  const outcomes: ActivatedActionMechanism[] = [];
  if (/put .* \+1\/\+1 counter/.test(text)) outcomes.push("COUNTER_PLACEMENT");
  if (/deals .* damage|deal .* damage/.test(text)) outcomes.push("CREATURE_REMOVAL");
  if (/create .* token|create an .* creature token/.test(text)) outcomes.push("TOKEN_GENERATION");
  return outcomes;
}

function inferOutputMultiplier(text: string): OutputMultiplierInference | null {
  const tokenDouble =
    /double the number of .* tokens? you create|twice as many tokens|create twice that many tokens|that many tokens plus one/.test(
      text,
    );
  const counterDouble = /double the number of .* counters? you put|twice as many \+1\/\+1 counters/.test(text);
  const triggerDouble =
    /triggered abilities? (?:you control )?trigger an additional time|abilities trigger twice|triggered abilities trigger/.test(
      text,
    );
  const damageDouble = /damage is doubled|deals double|twice as much damage/.test(text);
  const manaDouble = /add twice as much mana|mana of any type equal to .* doubled/.test(text);

  if (!tokenDouble && !counterDouble && !triggerDouble && !damageDouble && !manaDouble) return null;

  let multiplierType: OutputMultiplierType = "token_doubling";
  let targetMechanic: OutputMultiplierInference["targetMechanic"] = "TOKEN_GENERATION";
  let anchorKind: OutputMultiplierInference["anchorKind"] = "STATIC_INCENTIVE";

  if (counterDouble) {
    multiplierType = "counter_doubling";
    targetMechanic = "COUNTER_PLACEMENT";
  } else if (triggerDouble) {
    multiplierType = "trigger_doubling";
    targetMechanic = "TRIGGERED_ABILITY";
  } else if (damageDouble) {
    multiplierType = "damage_doubling";
    targetMechanic = "SPELL_DAMAGE";
  } else if (manaDouble) {
    multiplierType = "mana_doubling";
    targetMechanic = "MANA_GENERATION";
  }

  if (/if .* you control|as long as/.test(text)) anchorKind = "STATE_DEPENDENCY";

  return {
    multiplierId: `multiplier_${multiplierType}`,
    anchorKind,
    targetMechanic,
    multiplierType,
    spanText: text.slice(0, 120),
  };
}

function applyOutputMultiplierInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const inferred = inferOutputMultiplier(text);
  if (!inferred) return;
  if (profile.outputMultipliers.some((m) => m.multiplierType === inferred.multiplierType)) return;

  profile.outputMultipliers.push(inferred);
  pushUnique(profile.engineConditions, "output_multiplier");
  if (inferred.targetMechanic === "TOKEN_GENERATION") {
    pushUnique(profile.engineInputs, "token_production");
    pushUnique(profile.engineActions, "token_production");
  }
  if (inferred.targetMechanic === "COUNTER_PLACEMENT") {
    pushUnique(profile.engineInputs, "counters");
  }

  evidence.push({
    ruleId: "output_multiplier_inference",
    source,
    detail: `${inferred.multiplierType} on ${inferred.targetMechanic}`,
    spanText,
  });
}

function applyEtbLandDevelopmentInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (
    /when .* enters.*search .* library for a land.*put .* onto the battlefield/.test(text) ||
    /when .* enters.*you may search .* library for a land/.test(text)
  ) {
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "land_drops");
    pushUnique(profile.engineActions, "tutor");
    pushUnique(profile.engineActions, "put_onto_battlefield");
    pushUnique(profile.resourcesProduced, "mana");
    evidence.push({
      ruleId: "etb_land_development",
      source,
      detail: "ETB → search land onto battlefield (mana development)",
      spanText,
    });
  }
}

function applyCounterRemovalManaInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (
    /remove (?:one or more )?\+1\/\+1 counters? from among artifacts you control.*add that much \{c\}/.test(text) ||
    /remove .* counters? from .* you control.*add .* mana/.test(text)
  ) {
    applyActivatedActionInference(profile, text, evidence, source, spanText);
    pushUnique(profile.engineInputs, "artifacts_enchantments");
    pushUnique(profile.engineInputs, "counters_on_permanents");
    pushUnique(profile.engineConditions, "counter_to_mana_conversion");
    evidence.push({
      ruleId: "counter_removal_mana_conversion",
      source,
      detail: "remove counters from artifacts → mana (repeatable engine)",
      spanText,
    });
  }
}

function applyCommanderCounterStockInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (/enters with .* \+1\/\+1 counters? on it equal to the amount of mana spent to cast/.test(text)) {
    pushUnique(profile.engineOutputs, "counters");
    pushUnique(profile.engineInputs, "commander_counters");
    pushUnique(profile.engineActions, "counter_stock");
    profile.stateScaling.push({
      scalingBasis: "mana_spent_to_cast",
      countedObjects: ["mana_spent"],
      scaledQuantity: "ability_magnitude",
      controller: "you",
    });
    evidence.push({
      ruleId: "commander_counter_stock_etb",
      source,
      detail: "ETB counters scale with mana spent to cast — counter stock engine",
      spanText,
    });
  }
}

function applyEtbTutorCheatInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (
    !/when .* enters.*search .* library for a .* creature.*put .* onto the battlefield/.test(text) &&
    !/when .* enters.*you may search .* library for a .* creature.*put .* onto the battlefield/.test(text)
  ) {
    return;
  }
  const variableCost = /mana value x or less|mv x or less|converted mana cost x/.test(text);
  const qualification = variableCost ? "creature_mv_x_or_less" : "creature";
  profile.tutorCheats.push({
    cheatId: `tutor_cheat_${profile.tutorCheats.length + 1}`,
    trigger: /if you cast it/.test(text) ? "cast" : "etb",
    searchTarget: "creature",
    qualification,
    destination: "battlefield",
    variableCost,
    spanText: spanText?.slice(0, 120),
  });
  pushUnique(profile.engineTriggers, "etb_trigger");
  pushUnique(profile.engineInputs, "creature_toolbox_targets");
  if (variableCost) pushUnique(profile.engineInputs, "variable_cost_support");
  pushUnique(profile.engineActions, "tutor");
  pushUnique(profile.engineActions, "put_onto_battlefield");
  evidence.push({
    ruleId: "etb_tutor_creature_cheat",
    source,
    detail: `ETB tutor → creature onto battlefield (${qualification})`,
    spanText,
  });
}

function applyAttritionChainInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const markerMatch = text.match(/put a (\w+) counter on each creature you don't control/);
  if (markerMatch) {
    profile.attritionStages.push({
      stageId: `attrition_${profile.attritionStages.length + 1}`,
      stageKind: "STATE_MARKER",
      subject: "opponent_creatures",
      markerType: markerMatch[1],
      spanText: spanText?.slice(0, 120),
    });
    pushUnique(profile.engineTriggers, "end_step_trigger");
    pushUnique(profile.engineInputs, "opponent_creatures");
    pushUnique(profile.engineActions, "state_marker");
    evidence.push({
      ruleId: "attrition_state_marker",
      source,
      detail: `apply ${markerMatch[1]} counter marker to opponent creatures`,
      spanText,
    });
  }

  if (/creatures you don't control get .* for each .* counter on them/.test(text)) {
    profile.attritionStages.push({
      stageId: `attrition_${profile.attritionStages.length + 1}`,
      stageKind: "STATIC_DEBUFF",
      subject: "marked_opponent_creatures",
      markerType: markerMatch?.[1],
      spanText: spanText?.slice(0, 120),
    });
    pushUnique(profile.engineConditions, "static_debuff");
    evidence.push({
      ruleId: "attrition_static_debuff",
      source,
      detail: "marked creatures debuffed by counter count",
      spanText,
    });
  }

  if (/whenever a creature you don't control with a .* counter on it dies/.test(text)) {
    profile.attritionStages.push({
      stageId: `attrition_${profile.attritionStages.length + 1}`,
      stageKind: "MARKED_DEATH_PAYOFF",
      subject: "marked_creature_deaths",
      markerType: markerMatch?.[1],
      spanText: spanText?.slice(0, 120),
    });
    pushUnique(profile.engineTriggers, "dies_trigger");
    pushUnique(profile.engineInputs, "opponent_creature_deaths");
    pushUnique(profile.engineActions, "token_production");
    pushUnique(profile.resourcesProduced, "tokens");
    pushUnique(profile.engineOutputs, "create_token");
    evidence.push({
      ruleId: "attrition_marked_death_token",
      source,
      detail: "marked opponent creature dies → token payoff",
      spanText,
    });
  }
}

function applyStateChangeTriggerInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (/whenever .* becomes tapped/.test(text) && !/whenever you tap/.test(text)) {
    const payoffs: string[] = [];
    if (/get \+\d+\/\+\d+|gets \+\d+\/\+\d+/.test(text)) payoffs.push("combat_buff");
    if (/gain undying|gains undying/.test(text)) payoffs.push("undying");
    if (/draw a card/.test(text)) payoffs.push("card_draw");
    const duplicate = profile.stateChangeTriggers.some(
      (t) => t.stateChange === "becomes_tapped" && t.payoffMechanisms.join(",") === payoffs.join(","),
    );
    if (!duplicate) {
      profile.stateChangeTriggers.push({
        triggerId: `state_${profile.stateChangeTriggers.length + 1}`,
        stateChange: "becomes_tapped",
        payoffMechanisms: payoffs.length > 0 ? payoffs : ["combat_buff"],
        spanText: spanText?.slice(0, 120),
      });
    }
    pushUnique(profile.engineTriggers, "tap_state_trigger");
    pushUnique(profile.engineInputs, "tapped_creatures");
    if (payoffs.includes("combat_buff")) pushUnique(profile.enginePayoffs, "combat_buff");
    evidence.push({
      ruleId: "tap_state_change_trigger",
      source,
      detail: `becomes tapped → ${payoffs.join(", ") || "payoff"}`,
      spanText,
    });
  }

  if (/whenever you scry.*put .* \+1\/\+1 counter/.test(text)) {
    profile.stateChangeTriggers.push({
      triggerId: `state_${profile.stateChangeTriggers.length + 1}`,
      stateChange: "scry",
      payoffMechanisms: ["counters"],
      spanText: spanText?.slice(0, 120),
    });
    pushUnique(profile.engineTriggers, "scry_trigger");
    pushUnique(profile.engineInputs, "scry_events");
    pushUnique(profile.engineActions, "scry");
    pushUnique(profile.engineOutputs, "counters");
    pushUnique(profile.engineActions, "counter_placement");
    evidence.push({
      ruleId: "scry_counter_trigger",
      source,
      detail: "scry → counter placement",
      spanText,
    });
  }
}

function applyTypeQualifiedTriggerInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const playMatch = text.match(
    /whenever you play a card with (two|\d+) or more card types|whenever you play a (?:card|spell) with (\w+(?: or \w+)*) card types?/,
  );
  if (playMatch) {
    const minTypes =
      playMatch[1] === "two" ? 2 : playMatch[1] ? parseInt(playMatch[1], 10) : 2;
    profile.typeQualifiedTriggers.push({
      triggerId: `type_${profile.typeQualifiedTriggers.length + 1}`,
      event: "play",
      typeQualification: playMatch[2] ?? "multi_card_types",
      minCardTypes: minTypes,
      outputMechanism: "TOKEN_GENERATION",
      spanText: spanText?.slice(0, 120),
    });
    pushUnique(profile.engineTriggers, "cast_trigger");
    pushUnique(profile.engineInputs, "multi_type_spells");
    pushUnique(profile.engineActions, "token_production");
    pushUnique(profile.resourcesProduced, "tokens");
    pushUnique(profile.engineOutputs, "create_token");
    evidence.push({
      ruleId: "type_qualified_play_token",
      source,
      detail: `play ${minTypes}+ card types → token production`,
      spanText,
    });
  }

  if (/when .* enters.*create .* token/.test(text) && profile.typeQualifiedTriggers.length === 0) {
    profile.typeQualifiedTriggers.push({
      triggerId: `type_${profile.typeQualifiedTriggers.length + 1}`,
      event: "etb",
      typeQualification: "commander_etb",
      outputMechanism: "TOKEN_GENERATION",
      spanText: spanText?.slice(0, 120),
    });
    pushUnique(profile.engineTriggers, "etb_trigger");
  }
}

function applyStaticTypalBuffInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const typalMatch = text.match(/(\w+)s your team controls have (.+?)(?:\.|$)/);
  if (!typalMatch) return;
  const creatureType = typalMatch[1]?.toLowerCase() ?? "creature";
  const granted = typalMatch[2]?.split(/,|\band\b/).map((k) => k.trim()).filter(Boolean) ?? [];
  profile.staticTypalBuffs.push({
    buffId: `typal_${profile.staticTypalBuffs.length + 1}`,
    creatureType,
    grantedKeywords: granted,
    spanText: spanText?.slice(0, 120),
  });
  pushUnique(profile.engineConditions, "static_typal_modifier");
  pushUnique(profile.enginePayoffs, "combat_buff");
  pushUnique(profile.engineInputs, `${creatureType}_creatures`);
  evidence.push({
    ruleId: "static_typal_buff",
    source,
    detail: `${creatureType} team buff → combat`,
    spanText,
  });
}

function applyEndStepConditionalInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (!/at the beginning of your end step.*if you attacked/.test(text)) return;
  const payoffs: string[] = [];
  if (/create .* token/.test(text)) payoffs.push("token_generation");
  profile.endStepConditionals.push({
    triggerId: `endstep_${profile.endStepConditionals.length + 1}`,
    condition: "attacked_this_turn",
    outcomeMechanisms: payoffs.length > 0 ? payoffs : ["combat_payoff"],
    spanText: spanText?.slice(0, 120),
  });
  pushUnique(profile.engineTriggers, "end_step_trigger");
  pushUnique(profile.engineTriggers, "attack_trigger");
  pushUnique(profile.engineInputs, "combat_attacks");
  if (/create .* token/.test(text)) {
    pushUnique(profile.engineActions, "token_production");
    pushUnique(profile.resourcesProduced, "tokens");
    pushUnique(profile.engineOutputs, "create_token");
  }
  evidence.push({
    ruleId: "end_step_attack_conditional",
    source,
    detail: "end step + attacked → outcome",
    spanText,
  });
}

function applyPlaneswalkerLoyaltyInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const loyaltyRe = /([+\u2212-]\d+):\s*([^+\u2212-]+?)(?=[+\u2212-]\d+:|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = loyaltyRe.exec(text)) !== null) {
    const costRaw = match[1]?.replace("\u2212", "-") ?? "+0";
    const loyaltyCost = parseInt(costRaw, 10);
    const abilityText = match[2]?.trim() ?? "";
    const effects: string[] = [];
    let typeQualification: string | undefined;
    if (/search your library for a (\w+) card/.test(abilityText)) {
      typeQualification = abilityText.match(/search your library for a (\w+) card/)?.[1];
      effects.push("tutor");
      pushUnique(profile.engineActions, "tutor");
      pushUnique(profile.engineActions, "shuffle_library");
      profile.typeQualifiedTutors.push({
        tutorId: `tutor_${profile.typeQualifiedTutors.length + 1}`,
        destination: /put it onto the battlefield/.test(abilityText) ? "battlefield" : "hand",
        typeQualification: typeQualification ?? "creature",
        costType: "loyalty",
        spanText: abilityText.slice(0, 120),
      });
    }
    if (/destroy all non-/.test(abilityText)) effects.push("board_wipe");
    if (/can't attack you/.test(abilityText) || /pay \d+ life/.test(abilityText)) effects.push("combat_tax");
    if (/return up to one target/.test(abilityText) && /draw a card/.test(abilityText)) {
      effects.push("removal", "card_draw");
      pushUnique(profile.engineActions, "removal");
      pushUnique(profile.engineOutputs, "card_draw");
    }
    if (/cast .* as though they had flash/.test(abilityText)) effects.push("timing_permission");
    profile.planeswalkerLoyaltyAbilities.push({
      abilityId: `loyalty_${profile.planeswalkerLoyaltyAbilities.length + 1}`,
      loyaltyCost,
      effects,
      typeQualification,
      spanText: abilityText.slice(0, 120),
    });
    evidence.push({
      ruleId: "planeswalker_loyalty",
      source,
      detail: `loyalty ${loyaltyCost} → ${effects.join(", ") || "effect"}`,
      spanText: abilityText.slice(0, 120),
    });
  }
}

function applyStaticTimingRestrictionInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (!/each opponent can cast spells only any time they could cast a sorcery/.test(text)) return;
  profile.staticTimingRestrictions.push({
    restrictionId: `timing_${profile.staticTimingRestrictions.length + 1}`,
    affectedActors: ["opponents"],
    restriction: "sorcery_speed_only",
    spanText: spanText?.slice(0, 120),
  });
  pushUnique(profile.engineConditions, "static_timing_restriction");
  pushUnique(profile.permissions, "controller_flash_for_sorceries");
  evidence.push({
    ruleId: "static_sorcery_speed_restriction",
    source,
    detail: "opponents sorcery-speed; controller flash permission synergy",
    spanText,
  });
}

function applyExileReplacementInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (!/would die, exile that card/.test(text)) return;
  const marker = /blood counter/.test(text) ? "blood_counter" : /counter on it/.test(text) ? "exile_counter" : undefined;
  profile.exileReplacements.push({
    replacementId: `exile_${profile.exileReplacements.length + 1}`,
    replacedEvent: "creature_death",
    exileMarker: marker,
    spanText: spanText?.slice(0, 120),
  });
  pushUnique(profile.engineInputs, "creature_deaths");
  pushUnique(profile.permissions, "exile_instead_of_graveyard");
  pushUnique(profile.engineInputs, "exiled_creatures");
  evidence.push({
    ruleId: "exile_replacement_on_death",
    source,
    detail: "death → exile zone accumulation",
    spanText,
  });
}

function applyAbilityInheritanceInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (!/as long as an exiled creature card/.test(text) || !/has flying, .* has flying|has flying.* has flying/.test(text)) {
    if (!/as long as an exiled creature card with a blood counter/.test(text)) return;
  }
  const props = [
    "flying",
    "first strike",
    "double strike",
    "deathtouch",
    "haste",
    "hexproof",
    "indestructible",
    "lifelink",
    "menace",
    "reach",
    "trample",
    "vigilance",
  ].filter((p) => new RegExp(`has ${p}|gains ${p}`).test(text));
  profile.abilityInheritances.push({
    inheritanceId: `inherit_${profile.abilityInheritances.length + 1}`,
    sourceZone: "exile",
    sourceMarker: /blood counter/.test(text) ? "blood_counter" : undefined,
    inheritedProperties: props,
    spanText: spanText?.slice(0, 120),
  });
  pushUnique(profile.engineInputs, "exiled_creatures");
  pushUnique(profile.engineConditions, "ability_inheritance");
  pushUnique(profile.enginePayoffs, "combat_buff");
  evidence.push({
    ruleId: "ability_inheritance_from_exile",
    source,
    detail: `inherit ${props.slice(0, 4).join(", ")} from exiled creatures`,
    spanText,
  });
}

function applyTypeCountScalingInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  const shrineMatch = text.match(
    /at the beginning of your end step.*deals x damage.*where x is the number of (\w+)s you control/is,
  );
  if (!shrineMatch && !/where x is the number of (\w+)s you control/.test(text)) return;
  const countedType = (shrineMatch?.[1] ?? text.match(/where x is the number of (\w+)s you control/)?.[1] ?? "permanent").toLowerCase();
  profile.typeCountScaling.push({
    scalingId: `typecount_${profile.typeCountScaling.length + 1}`,
    countedType,
    scaledEffect: /deals x damage|deals .* damage/.test(text) ? "damage" : "magnitude",
    triggerTiming: /end step/.test(text) ? "end_step" : undefined,
    spanText: spanText?.slice(0, 120),
  });
  pushUnique(profile.engineTriggers, "end_step_trigger");
  pushUnique(profile.engineInputs, `${countedType}_count`);
  pushUnique(profile.enginePayoffs, "damage");
  if (/you may pay \{1\}/.test(text) || /you may pay \{\d+\}/.test(text)) {
    pushUnique(profile.engineCosts, "optional_mana_cost");
  }
  evidence.push({
    ruleId: "type_count_scaling",
    source,
    detail: `${countedType} count scales payoff`,
    spanText,
  });
}

function applyShrineTypeDependencyInference(
  profile: CommanderCausalRoleProfile,
  text: string,
  evidence: CausalInferenceEvidence[],
  source: CausalInferenceEvidence["source"],
  spanText?: string,
): void {
  if (!/shrine/.test(text) || profile.typeCountScaling.some((s) => s.countedType === "shrine")) return;
  applyTypeCountScalingInference(profile, text, evidence, source, spanText);
}

/** Apply RC8-adjacent oracle/ability-span inference — mutates profile in place. */
export function applyCommanderCausalInferenceV1_1(input: {
  profile: CommanderCausalRoleProfile;
  actions: SemanticAction[];
  abilities: SemanticAbility[];
  oracleText: string;
}): CausalInferenceEvidence[] {
  const evidence: CausalInferenceEvidence[] = [];
  const texts = collectTexts({ oracleText: input.oracleText, abilities: input.abilities });

  for (const { text, source } of texts) {
    const etb = inferEtbTriggers(text);
    if (etb) applyEtbInference(input.profile, etb, evidence, source, text.slice(0, 120));

    const combat = inferCombatConversion(text);
    if (combat) applyCombatConversionInference(input.profile, combat, evidence, source, text.slice(0, 120));

    const castProd = inferCastProduction(text);
    if (castProd) applyCastProductionInference(input.profile, castProd, evidence, source, text.slice(0, 120));

    applyActivatedSacrificeCostInference(input.profile, text, evidence, source, text.slice(0, 120));

    applySpellCastEventInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyStateScalingInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyProtectionInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyActivatedInteractionInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyCostDependencyInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyActivatedActionInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyOutputMultiplierInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyEtbLandDevelopmentInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyCounterRemovalManaInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyCommanderCounterStockInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyEtbTutorCheatInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyAttritionChainInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyStateChangeTriggerInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyTypeQualifiedTriggerInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyStaticTypalBuffInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyEndStepConditionalInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyPlaneswalkerLoyaltyInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyStaticTimingRestrictionInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyExileReplacementInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyAbilityInheritanceInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyTypeCountScalingInference(input.profile, text, evidence, source, text.slice(0, 120));
    applyShrineTypeDependencyInference(input.profile, text, evidence, source, text.slice(0, 120));

    if (inferPowerScaledMana(text)) {
      applyPowerScaledManaInference(input.profile, evidence, source, text.slice(0, 120));
    }

    if (/whenever you sacrifice an artifact|whenever you sacrifice a permanent|whenever you sacrifice/.test(text)) {
      pushUnique(input.profile.engineTriggers, "sacrifice_trigger");
      pushUnique(input.profile.engineInputs, "sacrifices");
      if (/artifact/.test(text)) pushUnique(input.profile.engineInputs, "artifacts_enchantments");
      if (/create .* token|create a .* token/.test(text)) {
        pushUnique(input.profile.engineOutputs, "create_token");
        pushUnique(input.profile.resourcesProduced, "tokens");
      }
      evidence.push({
        ruleId: "sacrifice_trigger_payoff",
        source,
        detail: "sacrifice → payoff chain",
        spanText: text.slice(0, 120),
      });
    }

    if (inferPostcombatManaFromLifeLoss(text)) {
      pushUnique(input.profile.engineTriggers, "postcombat_trigger");
      pushUnique(input.profile.engineInputs, "opponent_life_loss");
      pushUnique(input.profile.resourcesProduced, "mana");
      pushUnique(input.profile.engineActions, "postcombat_mana_engine");
      evidence.push({
        ruleId: "postcombat_mana_from_life_loss",
        source,
        detail: "postcombat phase mana scaled on opponent life lost",
        spanText: text.slice(0, 120),
      });
    }
    if (/whenever you cast a creature spell.*draw|whenever you cast a creature spell, draw/.test(text)) {
      pushUnique(input.profile.engineTriggers, "cast_trigger");
      pushUnique(input.profile.engineInputs, "creature_spells");
      pushUnique(input.profile.engineInputs, "spell_casts");
      pushUnique(input.profile.engineOutputs, "card_draw");
      evidence.push({
        ruleId: "creature_cast_draw",
        source,
        detail: "creature spell cast → draw",
        spanText: text.slice(0, 120),
      });
    }
    if (/look at the top .* cards of your library.*put .* onto the battlefield/.test(text) && /whenever .* attacks/.test(text)) {
      pushUnique(input.profile.engineActions, "put_onto_battlefield");
      pushUnique(input.profile.engineOutputs, "cheat_into_play");
      pushUnique(input.profile.engineTriggers, "attack_trigger");
      pushUnique(input.profile.engineInputs, "combat_attacks");
      evidence.push({
        ruleId: "attack_triggered_cheat_into_play",
        source,
        detail: "attack → cheat creature from library",
        spanText: text.slice(0, 120),
      });
    }
    if (/afflict \d+|whenever this creature becomes blocked.*loses .* life/.test(text)) {
      pushUnique(input.profile.engineInputs, "combat_life_loss");
      evidence.push({
        ruleId: "combat_life_loss_support",
        source,
        detail: "combat life loss feeder (supporting)",
        spanText: text.slice(0, 120),
      });
    }

    if (
      /whenever .* (?:enters or attacks|enters the battlefield or attacks).*create .* token/.test(text) ||
      /whenever .* attacks.*create .* token/.test(text)
    ) {
      pushUnique(input.profile.engineTriggers, "attack_trigger");
      pushUnique(input.profile.engineInputs, "combat_attacks");
      pushUnique(input.profile.engineActions, "token_production");
      pushUnique(input.profile.resourcesProduced, "tokens");
      pushUnique(input.profile.engineOutputs, "create_token");
      evidence.push({
        ruleId: "attack_or_etb_token_production",
        source,
        detail: "attack/ETB trigger → token production",
        spanText: text.slice(0, 120),
      });
    }

    if (/magecraft — whenever you cast or copy an instant or sorcery spell/.test(text)) {
      pushUnique(input.profile.engineTriggers, "cast_trigger");
      pushUnique(input.profile.engineInputs, "spell_casts");
      pushUnique(input.profile.engineInputs, "instant_sorcery_spells");
      pushUnique(input.profile.enginePayoffs, "recursion");
      pushUnique(input.profile.engineInputs, "graveyard_permanents");
      evidence.push({
        ruleId: "magecraft_spell_recursion",
        source,
        detail: "Magecraft instant/sorcery cast → graveyard recursion",
        spanText: text.slice(0, 120),
      });
    }
  }

  for (const action of input.actions) {
    if (action.actionType === "add_mana") {
      pushUnique(input.profile.resourcesProduced, "mana");
    }
    if (action.actionType === "deal_damage" && input.profile.engineTriggers.includes("combat_damage_trigger")) {
      evidence.push({
        ruleId: "rc8_combat_damage_payoff",
        source: "rc8_action",
        detail: "RC8 deal_damage under combat-damage trigger context",
      });
    }
  }

  evidence.push(...applyPhase56CausalInference({ profile: input.profile, oracleText: input.oracleText }));

  return evidence;
}

/** Depth score for ranking — higher means more upstream/causal. */
export function computeCausalDepthScore(input: {
  profile: CommanderCausalRoleProfile;
  driverMotifIds: string[];
  payoffMotifIds: string[];
}): {
  driverSupport: number;
  payoffSupport: number;
  feedbackSupport: number;
  incidentalSupport: number;
  causalDepth: number;
} {
  const { profile } = input;
  const driverTags = new Set([
    ...profile.engineInputs,
    ...profile.engineTriggers,
    ...profile.engineActions.filter((a) => !["token_production"].includes(a)),
    ...profile.engineConditions,
    ...profile.permissions,
  ]);
  const outputTags = new Set([...profile.engineOutputs, ...profile.enginePayoffs, ...profile.resourcesProduced]);

  const driverMotifTags: Record<string, string[]> = {
    ETB_PAYOFF: ["etb_trigger", "another_object_etb", "permanents_etb"],
    COMBAT_DAMAGE_TRIGGER: ["combat_damage_trigger", "combat_damage", "combat_damage_conversion"],
    SPELL_CAST_TRIGGER: ["cast_trigger", "spell_casts", "artifacts_enchantments", "creature_spells"],
    CAST_FROM_EXILE: ["cast_from_exile", "exiled_cards"],
    ARTIFACT_ENGINE: ["artifacts_enchantments", "artifact_tokens", "sacrifice_trigger"],
    SACRIFICE_ENGINE: ["sacrifice_trigger", "sacrifices"],
    LIFE_GAIN: ["life_gain_trigger", "life_gain_events"],
    TOKEN_GENERATION: ["token_production", "tokens"],
    ACTIVATED_MANA_ENGINE: ["activated_ability", "mana", "power_scaled"],
    TRIGGERED_MANA_ENGINE: ["postcombat_mana_engine", "postcombat_trigger", "opponent_life_loss"],
    MANA_GENERATION: ["mana", "postcombat_mana_engine"],
    POSTCOMBAT_TRIGGER: ["postcombat_trigger"],
    OPPONENT_LIFE_LOSS: ["opponent_life_loss", "combat_life_loss"],
    SACRIFICE_ENGINE: ["sacrifice_trigger", "sacrifices", "activated_ability", "sacrifice"],
    DRAW_ENGINE: ["card_draw", "creature_spells", "cast_trigger"],
  };

  let driverHits = 0;
  for (const motifId of input.driverMotifIds) {
    const tags = driverMotifTags[motifId] ?? [];
    if (tags.some((t) => driverTags.has(t))) driverHits += 1;
  }
  const driverSupport = input.driverMotifIds.length > 0 ? driverHits / input.driverMotifIds.length : 0;

  let payoffHits = 0;
  for (const motifId of input.payoffMotifIds) {
    if (outputTags.has("damage") && motifId === "DAMAGE_TO_OPPONENTS") payoffHits += 1;
    if (outputTags.has("create_token") && motifId === "TOKEN_GENERATION") payoffHits += 1;
    if (outputTags.has("life_gain") && motifId === "LIFE_GAIN") payoffHits += 1;
  }
  const payoffSupport = input.payoffMotifIds.length > 0 ? payoffHits / input.payoffMotifIds.length : 0;

  const feedbackSupport =
    (profile.engineInputs.includes("life_gain_events") && profile.engineOutputs.includes("counters")) ||
    (profile.engineInputs.includes("another_object_etb") && profile.enginePayoffs.includes("damage")) ||
    (profile.engineInputs.includes("spell_casts") && profile.resourcesProduced.includes("tokens")) ||
    (profile.engineConditions.includes("combat_damage_conversion") && profile.resourcesProduced.includes("mana")) ||
    (profile.engineActions.includes("postcombat_mana_engine") && profile.engineInputs.includes("opponent_life_loss"))
      ? 0.85
      : 0;

  const incidentalSupport =
    input.driverMotifIds.length === 0 && payoffSupport > 0.3 && driverSupport < 0.2 ? payoffSupport * 0.65 : 0;

  const causalDepth = Math.min(
    1,
    driverSupport * 0.5 +
      feedbackSupport * 0.25 +
      (input.driverMotifIds.length > 0 ? 0.15 : 0) -
      incidentalSupport * 0.35,
  );

  return { driverSupport, payoffSupport, feedbackSupport, incidentalSupport, causalDepth };
}
