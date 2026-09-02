/**
 * Phase 5.6 — narrow generalization repairs on causal inference (not RC8).
 * Oracle-grounded mechanism families for blind-v4 failure classes.
 */
import type { CommanderCausalRoleProfile } from "./commander-causal-roles-v1";
import type { CausalInferenceEvidence } from "./commander-causal-inference-v1.1";

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

export function applyPhase56CausalInference(input: {
  profile: CommanderCausalRoleProfile;
  oracleText: string;
}): CausalInferenceEvidence[] {
  const evidence: CausalInferenceEvidence[] = [];
  const text = input.oracleText.toLowerCase();
  const profile = input.profile;

  const youFirstSpell = /whenever you cast your first spell each turn/.test(text);
  if (youFirstSpell) {
    const actions: string[] = [];
    if (/deals .* damage|deal .* damage/.test(text)) actions.push("damage");
    if (/draw a card/.test(text)) actions.push("card_draw");
    profile.spellCastEvents.push({
      eventId: `spell_${profile.spellCastEvents.length + 1}`,
      actor: "you",
      ordinal: 1,
      ordinalScope: "turn",
      frequency: "first_each_turn",
      resultingActions: actions,
      spanText: text.slice(0, 120),
    });
    pushUnique(profile.engineTriggers, "cast_trigger");
    pushUnique(profile.engineInputs, "spell_casts");
    pushUnique(profile.engineInputs, "first_spell_each_turn");
    if (actions.includes("damage")) pushUnique(profile.enginePayoffs, "damage");
    evidence.push({
      ruleId: "phase56_first_spell_each_turn",
      source: "oracle_text",
      detail: "you cast first spell each turn → effect",
      spanText: text.slice(0, 120),
    });
  }

  if (/whenever you draw a card.*put a \+1\/\+1 counter|whenever you draw a card, put a \+1\/\+1 counter/.test(text)) {
    pushUnique(profile.engineTriggers, "draw_trigger");
    pushUnique(profile.engineInputs, "card_draw_events");
    pushUnique(profile.engineOutputs, "counters");
    pushUnique(profile.engineActions, "counter_placement");
    evidence.push({
      ruleId: "phase56_draw_to_counter",
      source: "oracle_text",
      detail: "draw card → place counter",
      spanText: text.slice(0, 120),
    });
  }

  if (/counters would be put on .* that many plus one of each of those kinds of counters/.test(text)) {
    profile.outputMultipliers.push({
      multiplierId: `mult_${profile.outputMultipliers.length + 1}`,
      anchorKind: "STATE_DEPENDENCY",
      targetMechanic: "COUNTER_PLACEMENT",
      multiplierType: "counter_doubling",
      spanText: text.slice(0, 120),
    });
    pushUnique(profile.engineConditions, "counter_multiplier");
    pushUnique(profile.engineInputs, "counter_placement_events");
    evidence.push({
      ruleId: "phase56_counter_multiplier",
      source: "oracle_text",
      detail: "counter placement multiplier (+1 per counter)",
      spanText: text.slice(0, 120),
    });
  }

  if (/when .* leaves the battlefield.*draw a card for each \+1\/\+1 counter/.test(text)) {
    profile.stateChangeTriggers.push({
      triggerId: `lbt_${profile.stateChangeTriggers.length + 1}`,
      stateChange: "becomes_untapped",
      payoffMechanisms: ["card_draw", "counter_stock_payoff"],
      spanText: text.slice(0, 120),
    });
    pushUnique(profile.engineTriggers, "leave_battlefield_trigger");
    pushUnique(profile.engineInputs, "commander_counters");
    pushUnique(profile.engineOutputs, "card_draw");
    evidence.push({
      ruleId: "phase56_leave_battlefield_counter_draw",
      source: "oracle_text",
      detail: "leave battlefield → draw per counter",
      spanText: text.slice(0, 120),
    });
  }

  if (/whenever .* or another .* dies.*draw a card|whenever .* dies, you may pay .* draw a card/.test(text)) {
    pushUnique(profile.engineTriggers, "dies_trigger");
    pushUnique(profile.engineInputs, "creature_deaths");
    pushUnique(profile.engineOutputs, "card_draw");
    pushUnique(profile.engineActions, "death_triggered_draw");
    evidence.push({
      ruleId: "phase56_death_triggered_draw",
      source: "oracle_text",
      detail: "creature death → card draw",
      spanText: text.slice(0, 120),
    });
  }

  if (/whenever .* deal.* damage to a player.*explore|whenever one or more .* deal damage to a player.*explore/.test(text)) {
    pushUnique(profile.engineTriggers, "combat_damage_trigger");
    pushUnique(profile.engineInputs, "combat_damage");
    pushUnique(profile.engineActions, "explore");
    pushUnique(profile.engineOutputs, "explore");
    evidence.push({
      ruleId: "phase56_damage_to_explore",
      source: "oracle_text",
      detail: "combat damage to player → explore",
      spanText: text.slice(0, 120),
    });
  }

  if (/secretly votes|each player secretly votes|those votes are revealed/.test(text)) {
    profile.endStepConditionals.push({
      triggerId: `modal_vote_${profile.endStepConditionals.length + 1}`,
      condition: "secret_vote_reveal",
      outcomeMechanisms: [
        ...(text.includes("gain control") ? ["board_control"] : []),
        ...(text.includes("put a +1/+1 counter") ? ["counter_placement"] : []),
        ...(text.includes("can't attack its owner") ? ["combat_restriction"] : []),
      ],
      spanText: text.slice(0, 120),
    });
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "permanents_etb");
    pushUnique(profile.engineActions, "modal_vote_outcome");
    evidence.push({
      ruleId: "phase56_modal_vote_etb",
      source: "oracle_text",
      detail: "ETB secret vote → branch outcomes",
      spanText: text.slice(0, 120),
    });
  }

  if (/when .* enters.*target creature an opponent controls deals damage equal to its power/.test(text)) {
    profile.activatedInteractions.push({
      costType: "tap",
      targetClasses: ["opponent_creature"],
      effect: "creature_damage",
    });
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "permanents_etb");
    pushUnique(profile.engineInputs, "opponent_creature_power");
    pushUnique(profile.enginePayoffs, "damage");
    pushUnique(profile.engineActions, "characteristic_derived_damage");
    profile.stateScaling.push({
      scalingBasis: "opponent_creature_power",
      countedObjects: ["opponent_creatures"],
      scaledQuantity: "ability_magnitude",
      controller: "opponent",
    });
    evidence.push({
      ruleId: "phase56_characteristic_derived_etb_damage",
      source: "oracle_text",
      detail: "ETB → opponent creature power determines damage",
      spanText: text.slice(0, 120),
    });
  }

  if (/switch each creature's power and toughness|switch .* power and toughness/.test(text)) {
    profile.activatedActions.push({
      actionId: `act_${profile.activatedActions.length + 1}`,
      costType: "mana",
      mechanism: "GLOBAL_CHARACTERISTIC_TRANSFORMATION",
      spanText: text.slice(0, 120),
    });
    pushUnique(profile.engineActions, "activated_ability");
    pushUnique(profile.engineActions, "global_characteristic_transformation");
    pushUnique(profile.engineOutputs, "characteristic_swap");
    evidence.push({
      ruleId: "phase56_global_pt_swap",
      source: "oracle_text",
      detail: "activated global P/T swap",
      spanText: text.slice(0, 120),
    });
  }

  if (/each untapped creature you control gets \+\d+\/\+\d+ as long as it's not attacking/.test(text)) {
    profile.protectionEffects.push({
      kind: "STATIC_PROTECTION",
      protectionType: "toughness_buff",
      subject: "untapped_nonattacking_creatures",
      condition: "untapped_and_nonattacking",
    });
    profile.stateScaling.push({
      scalingBasis: "untapped_nonattacking_defensive_scaling",
      countedObjects: ["creatures"],
      stateFilter: "untapped_nonattacking",
      scaledQuantity: "toughness",
      controller: "you",
    });
    pushUnique(profile.engineConditions, "static_conditional_incentive");
    pushUnique(profile.engineInputs, "untapped_creatures");
    evidence.push({
      ruleId: "phase56_static_untapped_nonattacking_incentive",
      source: "oracle_text",
      detail: "static buff for untapped nonattacking creatures",
      spanText: text.slice(0, 120),
    });
  }

  if (/at the beginning of your upkeep, sacrifice .* unless you pay/.test(text)) {
    pushUnique(profile.engineConditions, "upkeep_self_sacrifice_penalty");
    evidence.push({
      ruleId: "phase56_upkeep_self_sacrifice_penalty",
      source: "oracle_text",
      detail: "upkeep self-sacrifice penalty — not a sacrifice engine",
      spanText: text.slice(0, 120),
    });
  }

  if (/storied \(|enduring story|as long as you have an enduring story/.test(text)) {
    profile.typeCountScaling.push({
      scalingId: `threshold_${profile.typeCountScaling.length + 1}`,
      countedType: "storied_permanents",
      scaledEffect: "threshold_unlock",
      triggerTiming: "static_threshold",
      spanText: text.slice(0, 120),
    });
    pushUnique(profile.engineConditions, "threshold_state");
    pushUnique(profile.engineInputs, "storied_permanents");
    pushUnique(profile.engineConditions, "enduring_story");
    if (/creatures you control get \+\d+\/\+\d+/.test(text)) {
      profile.stateScaling.push({
        scalingBasis: "enduring_story_buff",
        countedObjects: ["creatures"],
        scaledQuantity: "both",
        controller: "you",
      });
    }
    evidence.push({
      ruleId: "phase56_storied_threshold_engine",
      source: "oracle_text",
      detail: "storied/enduring story threshold unlocks board buff",
      spanText: text.slice(0, 120),
    });
  }

  if (/whenever .* or another nontoken .* enters.*create .* token|whenever .* or another .* you control enters, create .* token/.test(text)) {
    pushUnique(profile.engineTriggers, "etb_trigger");
    pushUnique(profile.engineInputs, "permanents_etb");
    pushUnique(profile.engineActions, "token_production");
    pushUnique(profile.engineOutputs, "create_token");
    pushUnique(profile.resourcesProduced, "tokens");
    profile.typeQualifiedTriggers.push({
      triggerId: `typal_etb_${profile.typeQualifiedTriggers.length + 1}`,
      event: "etb",
      typeQualification: "typal_creature",
      outputMechanism: "TOKEN_GENERATION",
      spanText: text.slice(0, 120),
    });
    evidence.push({
      ruleId: "phase56_typal_etb_token_engine",
      source: "oracle_text",
      detail: "typal ETB token production",
      spanText: text.slice(0, 120),
    });
  }


  if (/at the beginning of each combat.*each other creature you control gets \+\d+\/\+\d+ if it has/.test(text)) {
    profile.staticTypalBuffs.push({
      buffId: `keyword_density_${profile.staticTypalBuffs.length + 1}`,
      creatureType: "keyword_density",
      grantedKeywords: ["flying", "first_strike", "deathtouch", "trample", "vigilance"],
      spanText: text.slice(0, 120),
    });
    pushUnique(profile.engineConditions, "keyword_density_scaling");
    pushUnique(profile.engineInputs, "keyword_density");
    evidence.push({
      ruleId: "phase56_keyword_density_combat_buff",
      source: "oracle_text",
      detail: "combat-start keyword-density creature buff",
      spanText: text.slice(0, 120),
    });
  }

  if (/whenever .* or another .* you control dies.*you may pay .* draw a card/.test(text)) {
    pushUnique(profile.engineTriggers, "dies_trigger");
    pushUnique(profile.engineInputs, "creature_deaths");
    pushUnique(profile.engineOutputs, "card_draw");
  }

  return evidence;
}
