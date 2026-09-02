/**
 * DirectionAnchor + RetrievalSpecification — Phase 5.4 compositional layer.
 * anchorKind is structural; mechanism is separate mechanical motif vocabulary.
 */
import type { DerivedRoleName } from "@/lib/semantic-visualization/derived-features-v1";
import type {
  CommanderMechanicalProfile,
  DirectionAnchor,
  DirectionAnchorKind,
  DirectionValidity,
  EvaluationContextStatus,
  RetrievalSpecification,
} from "./archetype-discovery-types-v1";
import type { CommanderCausalRoleProfile } from "./commander-causal-roles-v1";
import type { ExtractedMotif, MechanicalMotifId } from "./mechanical-motifs-v1";

export type AnchorMechanism =
  | "SPELL_PUNISHMENT"
  | "COUNTER_SPELL"
  | "CREATURE_REMOVAL"
  | "CREATURE_DAMAGE"
  | "COUNTER_PLACEMENT"
  | "PROTECTION_PROVIDER"
  | "STATIC_PROTECTION"
  | "CONDITIONAL_PROTECTION"
  | "TARGETED_PROTECTION"
  | "MANA_GENERATION"
  | "COMBAT_BUFF"
  | "TOKEN_GENERATION"
  | "STATE_SCALING"
  | "CONVOKE_COST"
  | "COMMANDER_SCALING"
  | "DAMAGE_TO_PLAYER"
  | "DAMAGE_TO_CREATURE"
  | "SPELL_CAST_TRIGGER"
  | "ETB_TRIGGER"
  | "ATTACK_TRIGGER"
  | "COMBAT_DAMAGE_TRIGGER"
  | "SACRIFICE_ENGINE"
  | "DRAW_ENGINE"
  | "LANDFALL"
  | "GRAVEYARD"
  | "COPY_COMMANDER"
  | "COPY"
  | "RECURSION"
  | "UNTAP"
  | "CAST_FROM_EXILE"
  | "OUTPUT_MULTIPLIER"
  | "LAND_DEVELOPMENT"
  | "STATE_ATTRITION"
  | "MARKED_DEATH_PAYOFF"
  | "TUTOR_CHEAT"
  | "TAP_STATE_TRIGGER"
  | "SCRY_TRIGGER"
  | "TYPE_QUALIFIED_PLAY"
  | "SCRY"
  | "COUNTER_STOCK"
  | "STATIC_TYPAL_BUFF"
  | "PLANESWALKER_LOYALTY"
  | "EXILE_REPLACEMENT"
  | "ABILITY_INHERITANCE"
  | "TYPE_COUNT_SCALING"
  | "STATIC_TIMING_RESTRICTION"
  | "END_STEP_TRIGGER"
  | "TYPE_QUALIFIED_TUTOR"
  | "GLOBAL_CHARACTERISTIC_TRANSFORMATION"
  | "CHARACTERISTIC_DERIVED_EFFECT"
  | "EXPLORE_ENGINE"
  | "THRESHOLD_STATE"
  | "KEYWORD_DENSITY_SCALING";

let anchorCounter = 0;

function nextAnchorId(prefix: string): string {
  anchorCounter += 1;
  return `anchor:${prefix}:${anchorCounter}`;
}

function pushUnique(arr: string[], value: string): void {
  if (!arr.includes(value)) arr.push(value);
}

export function resetDirectionAnchorCounter(): void {
  anchorCounter = 0;
}

export function detectEvaluationContext(input: {
  profile: CommanderMechanicalProfile;
  commanderOracleIds: string[];
  oracleTexts?: string[];
}): {
  evaluationContextStatus: EvaluationContextStatus;
  contextRequirements: string[];
} {
  const oracleJoined = (input.oracleTexts ?? []).join(" ").toLowerCase();
  const text = `${input.profile.commanderNames.join(" ")} ${oracleJoined}`.toLowerCase();

  const needsPartnerContext =
    /perfect clone|copy of your other commander|if enolc is one of two partner|as though it was a copy of any of your commanders/.test(
      text,
    );
  const hasOptionalBackground =
    /choose a background/.test(text) && !needsPartnerContext;
  const hasPartnerKeyword = /\bpartner\b/.test(text) && !needsPartnerContext;
  const singleCommander = input.commanderOracleIds.length === 1;

  if (needsPartnerContext && singleCommander) {
    return {
      evaluationContextStatus: "COMMAND_ZONE_CONTEXT_REQUIRED",
      contextRequirements: ["partner_commander", "command_zone_composition"],
    };
  }

  if ((hasOptionalBackground || hasPartnerKeyword) && singleCommander) {
    return {
      evaluationContextStatus: "OPTIONAL_COMMAND_ZONE_CONTEXT",
      contextRequirements: hasOptionalBackground
        ? ["background_commander"]
        : ["partner_commander"],
    };
  }

  return {
    evaluationContextStatus: "COMPLETE",
    contextRequirements: [],
  };
}

export function extractDirectionAnchors(input: {
  profile: CommanderMechanicalProfile;
  motifs: ExtractedMotif[];
}): DirectionAnchor[] {
  resetDirectionAnchorCounter();
  const { profile } = input;
  const causal = profile.causalRoles;
  const anchors: DirectionAnchor[] = [];

  for (const event of causal.spellCastEvents ?? []) {
    const mechanism: AnchorMechanism =
      event.resultingActions.includes("counter") ? "COUNTER_SPELL" : "SPELL_PUNISHMENT";
    const subject = [
      event.actor,
      event.objectRestriction,
      event.frequency,
      event.ordinal ? `${event.ordinal}${event.ordinalScope ?? "turn"}_spell` : null,
    ]
      .filter(Boolean)
      .join(" ");
    anchors.push({
      anchorId: nextAnchorId("spell"),
      anchorKind: "EVENT_TRIGGER",
      mechanism,
      subject,
      requirement: event.objectRestriction ?? "spell_cast",
      scalingBasis: event.ordinal ? `ordinal_${event.ordinal}` : undefined,
      sourceAbilityRef: event.spanText ?? "spell_cast_trigger",
      evidenceRefs: [`spell_event:${event.actor}`, ...(event.resultingActions ?? [])],
    });
  }

  for (const scaling of causal.stateScaling ?? []) {
    anchors.push({
      anchorId: nextAnchorId("state"),
      anchorKind: scaling.scaledQuantity === "both" ? "RESOURCE_SCALER" : "STATE_DEPENDENCY",
      mechanism: "STATE_SCALING",
      subject: scaling.countedObjects.join(", "),
      requirement: scaling.stateFilter ?? "count",
      scalingBasis: scaling.scalingBasis,
      sourceAbilityRef: scaling.scalingBasis,
      evidenceRefs: [scaling.scalingBasis, ...(scaling.countedObjects ?? [])],
    });
  }

  for (const prot of causal.protectionEffects ?? []) {
    anchors.push({
      anchorId: nextAnchorId("protection"),
      anchorKind: prot.kind === "STATIC_PROTECTION" ? "STATIC_INCENTIVE" : "EVENT_TRIGGER",
      mechanism:
        prot.kind === "TARGETED_PROTECTION"
          ? "TARGETED_PROTECTION"
          : prot.kind === "CONDITIONAL_PROTECTION"
            ? "CONDITIONAL_PROTECTION"
            : "STATIC_PROTECTION",
      subject: prot.subject,
      requirement: prot.condition ?? prot.protectionType,
      sourceAbilityRef: prot.protectionType,
      evidenceRefs: [prot.kind, prot.protectionType, prot.subject],
    });
  }

  for (const act of causal.activatedInteractions ?? []) {
    anchors.push({
      anchorId: nextAnchorId("activated"),
      anchorKind: "ACTIVATED_ACTION",
      mechanism: act.effect === "creature_removal" ? "CREATURE_REMOVAL" : "CREATURE_DAMAGE",
      subject: act.targetClasses.join(", ") || "creature",
      requirement: act.costType,
      sourceAbilityRef: `activated_${act.effect}`,
      evidenceRefs: [act.costType, ...act.targetClasses, act.effect],
    });
  }

  for (const action of causal.activatedActions ?? []) {
    const mechanism = action.mechanism as AnchorMechanism;
    anchors.push({
      anchorId: nextAnchorId("activated_action"),
      anchorKind: "ACTIVATED_ACTION",
      mechanism,
      subject: action.mechanism.toLowerCase(),
      requirement: action.costType,
      sourceAbilityRef: action.spanText ?? `activated_${action.mechanism}`,
      evidenceRefs: [action.costType, action.mechanism, ...(action.costDetail ? [action.costDetail] : [])],
    });
  }

  for (const mult of causal.outputMultipliers ?? []) {
    anchors.push({
      anchorId: nextAnchorId("multiplier"),
      anchorKind: mult.anchorKind,
      mechanism: "OUTPUT_MULTIPLIER",
      subject: mult.targetMechanic,
      requirement: mult.multiplierType,
      scalingBasis: mult.multiplierType,
      sourceAbilityRef: mult.spanText ?? mult.multiplierType,
      evidenceRefs: [mult.multiplierType, mult.targetMechanic, mult.anchorKind],
    });
  }

  for (const stage of causal.attritionStages ?? []) {
    const mechanism: AnchorMechanism =
      stage.stageKind === "STATE_MARKER" || stage.stageKind === "STATIC_DEBUFF"
        ? "STATE_ATTRITION"
        : stage.stageKind === "MARKED_DEATH_PAYOFF"
          ? "MARKED_DEATH_PAYOFF"
          : "STATE_ATTRITION";
    anchors.push({
      anchorId: nextAnchorId("attrition"),
      anchorKind: stage.stageKind === "STATIC_DEBUFF" ? "STATIC_INCENTIVE" : "EVENT_TRIGGER",
      mechanism,
      subject: stage.subject,
      requirement: stage.markerType ?? stage.stageKind,
      sourceAbilityRef: stage.stageKind,
      evidenceRefs: [stage.stageKind, stage.subject, ...(stage.markerType ? [stage.markerType] : [])],
    });
  }

  for (const cheat of causal.tutorCheats ?? []) {
    anchors.push({
      anchorId: nextAnchorId("tutor_cheat"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "TUTOR_CHEAT",
      subject: cheat.searchTarget,
      requirement: cheat.qualification ?? cheat.destination,
      scalingBasis: cheat.variableCost ? "variable_cost" : undefined,
      sourceAbilityRef: cheat.trigger,
      evidenceRefs: [cheat.trigger, cheat.searchTarget, cheat.destination, ...(cheat.qualification ? [cheat.qualification] : [])],
    });
  }

  for (const trigger of causal.stateChangeTriggers ?? []) {
    const mechanism: AnchorMechanism =
      trigger.stateChange === "scry" ? "SCRY_TRIGGER" : "TAP_STATE_TRIGGER";
    anchors.push({
      anchorId: nextAnchorId("state_change"),
      anchorKind: "EVENT_TRIGGER",
      mechanism,
      subject: trigger.stateChange,
      requirement: trigger.payoffMechanisms.join(", "),
      sourceAbilityRef: trigger.stateChange,
      evidenceRefs: [trigger.stateChange, ...trigger.payoffMechanisms],
    });
  }

  for (const tq of causal.typeQualifiedTriggers ?? []) {
    anchors.push({
      anchorId: nextAnchorId("type_trigger"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "TYPE_QUALIFIED_PLAY",
      subject: tq.typeQualification,
      requirement: tq.outputMechanism,
      scalingBasis: tq.minCardTypes ? `min_${tq.minCardTypes}_types` : undefined,
      sourceAbilityRef: tq.event,
      evidenceRefs: [tq.event, tq.typeQualification, tq.outputMechanism],
    });
  }

  for (const buff of causal.staticTypalBuffs ?? []) {
    if (buff.creatureType === "keyword_density") continue;
    anchors.push({
      anchorId: nextAnchorId("static_typal"),
      anchorKind: "STATIC_INCENTIVE",
      mechanism: "STATIC_TYPAL_BUFF",
      subject: buff.creatureType,
      requirement: buff.grantedKeywords.join(", "),
      sourceAbilityRef: "static_typal_buff",
      evidenceRefs: [buff.creatureType, ...buff.grantedKeywords],
    });
  }

  for (const endStep of causal.endStepConditionals ?? []) {
    anchors.push({
      anchorId: nextAnchorId("end_step"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "END_STEP_TRIGGER",
      subject: endStep.condition,
      requirement: endStep.outcomeMechanisms.join(", "),
      sourceAbilityRef: "end_step_conditional",
      evidenceRefs: [endStep.condition, ...endStep.outcomeMechanisms],
    });
  }

  for (const loyalty of causal.planeswalkerLoyaltyAbilities ?? []) {
    anchors.push({
      anchorId: nextAnchorId("loyalty"),
      anchorKind: loyalty.loyaltyCost >= 0 ? "ACTIVATED_ACTION" : "ACTIVATED_ACTION",
      mechanism: "PLANESWALKER_LOYALTY",
      subject: `loyalty_${loyalty.loyaltyCost >= 0 ? "+" : ""}${loyalty.loyaltyCost}`,
      requirement: loyalty.effects.join(", "),
      sourceAbilityRef: loyalty.spanText ?? "planeswalker_loyalty",
      evidenceRefs: [`loyalty:${loyalty.loyaltyCost}`, ...loyalty.effects],
    });
  }

  for (const restriction of causal.staticTimingRestrictions ?? []) {
    anchors.push({
      anchorId: nextAnchorId("timing"),
      anchorKind: "STATIC_INCENTIVE",
      mechanism: "STATIC_TIMING_RESTRICTION",
      subject: restriction.restriction,
      requirement: restriction.affectedActors.join(", "),
      sourceAbilityRef: "static_timing_restriction",
      evidenceRefs: [restriction.restriction, ...restriction.affectedActors],
    });
  }

  for (const exile of causal.exileReplacements ?? []) {
    anchors.push({
      anchorId: nextAnchorId("exile_replace"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "EXILE_REPLACEMENT",
      subject: exile.replacedEvent,
      requirement: exile.exileMarker ?? "exile",
      sourceAbilityRef: "exile_replacement",
      evidenceRefs: [exile.replacedEvent, ...(exile.exileMarker ? [exile.exileMarker] : [])],
    });
  }

  for (const inherit of causal.abilityInheritances ?? []) {
    anchors.push({
      anchorId: nextAnchorId("inherit"),
      anchorKind: "STATE_DEPENDENCY",
      mechanism: "ABILITY_INHERITANCE",
      subject: inherit.sourceZone,
      requirement: inherit.inheritedProperties.slice(0, 6).join(", "),
      sourceAbilityRef: "ability_inheritance",
      evidenceRefs: [inherit.sourceZone, ...(inherit.sourceMarker ? [inherit.sourceMarker] : []), ...inherit.inheritedProperties.slice(0, 4)],
    });
  }

  for (const scale of causal.typeCountScaling ?? []) {
    anchors.push({
      anchorId: nextAnchorId("type_count"),
      anchorKind: "STATE_DEPENDENCY",
      mechanism: scale.scaledEffect === "threshold_unlock" ? "THRESHOLD_STATE" : "TYPE_COUNT_SCALING",
      subject: scale.countedType,
      requirement: scale.scaledEffect,
      scalingBasis: scale.countedType,
      sourceAbilityRef: scale.triggerTiming ?? "type_count_scaling",
      evidenceRefs: [scale.countedType, scale.scaledEffect],
    });
  }

  for (const tutor of causal.typeQualifiedTutors ?? []) {
    anchors.push({
      anchorId: nextAnchorId("type_tutor"),
      anchorKind: tutor.destination === "hand" ? "ACTIVATED_ACTION" : "EVENT_TRIGGER",
      mechanism: "TYPE_QUALIFIED_TUTOR",
      subject: tutor.typeQualification,
      requirement: tutor.destination,
      sourceAbilityRef: tutor.spanText ?? "type_qualified_tutor",
      evidenceRefs: [tutor.typeQualification, tutor.destination, ...(tutor.costType ? [tutor.costType] : [])],
    });
  }

  for (const action of causal.activatedActions ?? []) {
    if (action.mechanism === "GLOBAL_CHARACTERISTIC_TRANSFORMATION") {
      anchors.push({
        anchorId: nextAnchorId("global_transform"),
        anchorKind: "ACTIVATED_ACTION",
        mechanism: "GLOBAL_CHARACTERISTIC_TRANSFORMATION",
        subject: "power_toughness",
        requirement: action.costType,
        sourceAbilityRef: action.spanText ?? "global_characteristic_transformation",
        evidenceRefs: ["power_toughness_swap", action.costType],
      });
    }
  }

  for (const scaling of causal.stateScaling ?? []) {
    if (scaling.scalingBasis === "opponent_creature_power") {
      anchors.push({
        anchorId: nextAnchorId("char_derived"),
        anchorKind: "EVENT_TRIGGER",
        mechanism: "CHARACTERISTIC_DERIVED_EFFECT",
        subject: "opponent_creature_power",
        requirement: "etb_trigger",
        scalingBasis: scaling.scalingBasis,
        sourceAbilityRef: "characteristic_derived_damage",
        evidenceRefs: ["opponent_creature_power", "etb_trigger", "damage"],
      });
    }
    if (scaling.scalingBasis === "untapped_nonattacking_defensive_scaling") {
      anchors.push({
        anchorId: nextAnchorId("static_incentive"),
        anchorKind: "STATIC_INCENTIVE",
        mechanism: "STATE_SCALING",
        subject: "untapped_nonattacking_creatures",
        requirement: scaling.stateFilter ?? "untapped_nonattacking",
        scalingBasis: scaling.scalingBasis,
        sourceAbilityRef: "static_conditional_incentive",
        evidenceRefs: ["untapped", "nonattacking", "defensive_scaling"],
      });
    }
  }

  if (causal.engineTriggers.includes("draw_trigger") && causal.engineOutputs.includes("counters")) {
    if (!anchors.some((a) => a.mechanism === "DRAW_ENGINE")) {
      anchors.push({
        anchorId: nextAnchorId("draw_counter"),
        anchorKind: "EVENT_TRIGGER",
        mechanism: "DRAW_ENGINE",
        subject: "card_draw_events",
        requirement: "counter_placement",
        sourceAbilityRef: "draw_to_counter",
        evidenceRefs: ["draw_trigger", "counters"],
      });
    }
  }

  if (causal.engineActions.includes("explore") || causal.engineOutputs.includes("explore")) {
    if (!anchors.some((a) => a.mechanism === "EXPLORE_ENGINE")) {
      anchors.push({
        anchorId: nextAnchorId("explore"),
        anchorKind: "EVENT_TRIGGER",
        mechanism: "EXPLORE_ENGINE",
        subject: "combat_damage",
        requirement: "explore",
        sourceAbilityRef: "damage_to_explore",
        evidenceRefs: ["combat_damage", "explore"],
      });
    }
  }

  if (causal.engineTriggers.includes("leave_battlefield_trigger")) {
    anchors.push({
      anchorId: nextAnchorId("lbt"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "DRAW_ENGINE",
      subject: "leave_battlefield",
      requirement: "counter_stock_payoff",
      sourceAbilityRef: "leave_battlefield_counter_draw",
      evidenceRefs: ["leave_battlefield", "counters", "card_draw"],
    });
  }

  if (causal.engineActions.includes("death_triggered_draw")) {
    anchors.push({
      anchorId: nextAnchorId("death_draw"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "DRAW_ENGINE",
      subject: "creature_deaths",
      requirement: "card_draw",
      sourceAbilityRef: "death_triggered_draw",
      evidenceRefs: ["dies_trigger", "card_draw"],
    });
  }

  for (const endStep of causal.endStepConditionals ?? []) {
    if (endStep.condition === "secret_vote_reveal") {
      anchors.push({
        anchorId: nextAnchorId("modal_vote"),
        anchorKind: "EVENT_TRIGGER",
        mechanism: "ETB_TRIGGER",
        subject: "modal_vote",
        requirement: endStep.outcomeMechanisms.join(", ") || "branch_outcomes",
        sourceAbilityRef: endStep.spanText ?? "modal_vote_etb",
        evidenceRefs: ["secret_vote", ...endStep.outcomeMechanisms],
      });
    }
  }

  for (const buff of causal.staticTypalBuffs ?? []) {
    if (buff.creatureType === "keyword_density") {
      anchors.push({
        anchorId: nextAnchorId("keyword_density"),
        anchorKind: "STATIC_INCENTIVE",
        mechanism: "KEYWORD_DENSITY_SCALING",
        subject: "keyword_density",
        requirement: buff.grantedKeywords.slice(0, 4).join(", "),
        sourceAbilityRef: buff.spanText ?? "keyword_density_combat_buff",
        evidenceRefs: ["keyword_density", ...buff.grantedKeywords.slice(0, 3)],
      });
    }
  }

  for (const motif of input.motifs.filter(
    (m) => (m.causalPosition === "OUTPUT" || m.causalPosition === "ENGINE") && m.strength >= 0.8,
  )) {
    const mechanism = motifToMechanism(motif.motifId);
    if (anchors.some((a) => a.mechanism === mechanism)) continue;
    if (motif.motifId === "DRAW_ENGINE" && !causal.engineOutputs.includes("card_draw")) continue;
    if (motif.motifId === "COUNTER_PLACEMENT" && !causal.engineOutputs.includes("counters")) continue;
    if (motif.motifId === "TOKEN_GENERATION" && !causal.engineOutputs.includes("create_token")) continue;
    const kind = motifToAnchorKind(motif.motifId);
    anchors.push({
      anchorId: nextAnchorId("output_motif"),
      anchorKind: kind,
      mechanism,
      subject: motif.motifId.toLowerCase(),
      requirement: motif.evidence.join(", ") || motif.motifId,
      sourceAbilityRef: motif.motifId,
      evidenceRefs: motif.evidence,
    });
  }

  if (
    causal.engineInputs.includes("commander_counters") &&
    causal.engineActions.includes("counter_conversion") &&
    !anchors.some((a) => a.mechanism === "COUNTER_STOCK")
  ) {
    anchors.push({
      anchorId: nextAnchorId("counter_stock"),
      anchorKind: "STATE_DEPENDENCY",
      mechanism: "COUNTER_STOCK",
      subject: "commander_counters",
      requirement: "replenish_and_spend",
      sourceAbilityRef: "counter_stock",
      evidenceRefs: ["commander_counters", "counter_conversion"],
    });
  }

  for (const cost of causal.costDependencies ?? []) {
    anchors.push({
      anchorId: nextAnchorId("cost"),
      anchorKind: "COST_DEPENDENCY",
      mechanism: "CONVOKE_COST",
      subject: cost.requiredResource,
      requirement: cost.dependency,
      sourceAbilityRef: cost.dependency,
      evidenceRefs: [cost.dependency, cost.requiredResource, cost.effect],
    });
  }

  for (const motif of input.motifs.filter((m) => m.causalPosition === "DRIVER")) {
    const mechanism = motifToMechanism(motif.motifId);
    if (anchors.some((a) => a.mechanism === mechanism && a.subject === motif.motifId.toLowerCase())) continue;
    const kind = motifToAnchorKind(motif.motifId);
    anchors.push({
      anchorId: nextAnchorId("motif"),
      anchorKind: kind,
      mechanism,
      subject: motif.motifId.toLowerCase(),
      requirement: motif.evidence.join(", ") || motif.motifId,
      sourceAbilityRef: motif.motifId,
      evidenceRefs: motif.evidence,
    });
  }

  for (const event of causal.spellCastEvents ?? []) {
    if (event.resultingActions.includes("damage") && event.actor === "any_player") {
      const existing = anchors.find((a) => a.mechanism === "SPELL_PUNISHMENT");
      if (existing) {
        pushUnique(existing.evidenceRefs, "self_penalty_possible");
      }
    }
  }

  if (
    causal.engineTriggers.includes("attack_trigger") ||
    causal.engineInputs.includes("combat_attacks")
  ) {
    if (!anchors.some((a) => a.mechanism === "ATTACK_TRIGGER")) {
      anchors.push({
        anchorId: nextAnchorId("combat"),
        anchorKind: "EVENT_TRIGGER",
        mechanism: "ATTACK_TRIGGER",
        subject: "combat_attacks",
        requirement: "attack",
        sourceAbilityRef: "attack_trigger",
        evidenceRefs: ["attack_trigger", "combat_attacks"],
      });
    }
  }

  if (
    causal.engineTriggers.includes("combat_damage_trigger") ||
    causal.engineInputs.includes("combat_damage")
  ) {
    if (!anchors.some((a) => a.mechanism === "COMBAT_DAMAGE_TRIGGER")) {
      anchors.push({
        anchorId: nextAnchorId("combat_dmg"),
        anchorKind: "EVENT_TRIGGER",
        mechanism: "COMBAT_DAMAGE_TRIGGER",
        subject: "combat_damage",
        requirement: "combat_damage",
        sourceAbilityRef: "combat_damage_trigger",
        evidenceRefs: ["combat_damage_trigger"],
      });
    }
  }

  if (causal.engineTriggers.includes("etb_trigger") || causal.engineInputs.includes("permanents_etb")) {
    if (!anchors.some((a) => a.mechanism === "ETB_TRIGGER")) {
      anchors.push({
        anchorId: nextAnchorId("etb"),
        anchorKind: "EVENT_TRIGGER",
        mechanism: "ETB_TRIGGER",
        subject: "permanents_etb",
        requirement: "etb",
        sourceAbilityRef: "etb_trigger",
        evidenceRefs: ["etb_trigger", "permanents_etb"],
      });
    }
  }

  if (
    causal.engineActions.includes("tutor") &&
    causal.engineInputs.includes("land_drops") &&
    !anchors.some((a) => a.mechanism === "LAND_DEVELOPMENT")
  ) {
    anchors.push({
      anchorId: nextAnchorId("land_dev"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "LAND_DEVELOPMENT",
      subject: "land_drops",
      requirement: "etb_land_search",
      sourceAbilityRef: "etb_land_development",
      evidenceRefs: ["etb_trigger", "land_drops", "tutor"],
    });
  }

  if (
    causal.engineTriggers.includes("cast_trigger") &&
    !causal.spellCastEvents?.length &&
    causal.engineInputs.includes("spell_casts")
  ) {
    if (!anchors.some((a) => a.mechanism === "SPELL_CAST_TRIGGER")) {
      anchors.push({
        anchorId: nextAnchorId("cast"),
        anchorKind: "EVENT_TRIGGER",
        mechanism: "SPELL_CAST_TRIGGER",
        subject: "spell_casts",
        requirement: "you_cast",
        sourceAbilityRef: "cast_trigger",
        evidenceRefs: ["cast_trigger", "spell_casts"],
      });
    }
  }

  if (
    causal.engineTriggers.includes("cast_trigger") &&
    causal.engineInputs.includes("opponent_creature_damaged")
  ) {
    anchors.push({
      anchorId: nextAnchorId("dmg_trigger"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "COUNTER_PLACEMENT",
      subject: "opponent_creature_damaged",
      requirement: "damage_to_opponent_creature",
      scalingBasis: "commander_growth",
      sourceAbilityRef: "opponent_creature_damaged",
      evidenceRefs: ["opponent_creature_damaged", "counters"],
    });
  }

  if (
    causal.engineActions.includes("token_production") &&
    causal.engineTriggers.includes("attack_trigger") &&
    !anchors.some((a) => a.mechanism === "TOKEN_GENERATION" && a.subject === "attack_token")
  ) {
    anchors.push({
      anchorId: nextAnchorId("attack_token"),
      anchorKind: "EVENT_TRIGGER",
      mechanism: "TOKEN_GENERATION",
      subject: "attack_token",
      requirement: "attack_or_etb",
      sourceAbilityRef: "attack_token_production",
      evidenceRefs: ["attack_trigger", "token_production", "combat_attacks"],
    });
  }

  return anchors.filter(
    (anchor, index, all) =>
      all.findIndex(
        (other) =>
          other.mechanism === anchor.mechanism &&
          other.subject === anchor.subject &&
          other.requirement === anchor.requirement,
      ) === index,
  );
}

function motifToAnchorKind(motifId: MechanicalMotifId): DirectionAnchorKind {
  const map: Partial<Record<MechanicalMotifId, DirectionAnchorKind>> = {
    ATTACK_TRIGGER: "EVENT_TRIGGER",
    COMBAT_DAMAGE_TRIGGER: "EVENT_TRIGGER",
    SPELL_CAST_TRIGGER: "EVENT_TRIGGER",
    ETB_PAYOFF: "EVENT_TRIGGER",
    DEATH_PAYOFF: "EVENT_TRIGGER",
    CAST_FROM_EXILE: "PERMISSION",
    STATIC_TAX: "STATIC_CONSTRAINT",
    SPELL_PUNISHMENT: "EVENT_TRIGGER",
    COUNTER_SPELL: "STATIC_CONSTRAINT",
    ACTIVATED_MANA_ENGINE: "ACTIVATED_ACTION",
    TRIGGERED_MANA_ENGINE: "EVENT_TRIGGER",
    SACRIFICE_ENGINE: "EVENT_TRIGGER",
    TOKEN_GENERATION: "EVENT_TRIGGER",
    GRAVEYARD_SETUP: "ZONE_DEPENDENCY",
    GRAVEYARD_RECURSION: "ZONE_DEPENDENCY",
    LANDFALL_ENGINE: "EVENT_TRIGGER",
    ARTIFACT_ENGINE: "TYPE_DEPENDENCY",
    AURA_EQUIPMENT: "TYPE_DEPENDENCY",
    LIFE_GAIN: "EVENT_TRIGGER",
    OPPONENT_LIFE_LOSS: "EVENT_TRIGGER",
    LEGENDARY_PRESENCE: "TYPE_DEPENDENCY",
    PROLIFERATE_ENGINE: "ACTIVATED_ACTION",
    COUNTER_PLACEMENT: "STATE_DEPENDENCY",
    COUNTER_PAYOFF: "RESOURCE_SCALER",
    DRAW_ENGINE: "EVENT_TRIGGER",
    CREATURE_CHEAT: "EVENT_TRIGGER",
    MILL_ENGINE: "ZONE_DEPENDENCY",
    TOP_LIBRARY_MANIPULATION: "ZONE_DEPENDENCY",
    BLINK_ETB: "EVENT_TRIGGER",
    CREATURE_REMOVAL: "ACTIVATED_ACTION",
    PROTECTION_PROVIDER: "EVENT_TRIGGER",
    STATIC_PROTECTION: "STATIC_INCENTIVE",
    STATE_SCALING: "STATE_DEPENDENCY",
    CONVOKE_COST: "COST_DEPENDENCY",
    POSTCOMBAT_TRIGGER: "EVENT_TRIGGER",
    POSTCOMBAT_MANA_CONVERSION: "EVENT_TRIGGER",
    UNTAP_ENGINE: "ACTIVATED_ACTION",
    TUTOR_ENGINE: "ACTIVATED_ACTION",
  };
  return map[motifId] ?? "EVENT_TRIGGER";
}

function motifToMechanism(motifId: MechanicalMotifId): AnchorMechanism {
  const map: Partial<Record<MechanicalMotifId, AnchorMechanism>> = {
    ATTACK_TRIGGER: "ATTACK_TRIGGER",
    COMBAT_DAMAGE_TRIGGER: "COMBAT_DAMAGE_TRIGGER",
    COMBAT_BUFF: "COMBAT_BUFF",
    DAMAGE_TO_OPPONENTS: "DAMAGE_TO_PLAYER",
    SPELL_CAST_TRIGGER: "SPELL_CAST_TRIGGER",
    ETB_PAYOFF: "ETB_TRIGGER",
    STATIC_TAX: "COUNTER_SPELL",
    TOKEN_GENERATION: "TOKEN_GENERATION",
    COUNTER_PLACEMENT: "COUNTER_PLACEMENT",
    DRAW_ENGINE: "DRAW_ENGINE",
    SACRIFICE_ENGINE: "SACRIFICE_ENGINE",
    LANDFALL_ENGINE: "LANDFALL",
    GRAVEYARD_SETUP: "GRAVEYARD",
    GRAVEYARD_RECURSION: "GRAVEYARD",
    ACTIVATED_MANA_ENGINE: "MANA_GENERATION",
    PROLIFERATE_ENGINE: "COUNTER_PLACEMENT",
    MILL_ENGINE: "GRAVEYARD",
    TOP_LIBRARY_MANIPULATION: "DRAW_ENGINE",
    BLINK_ETB: "ETB_TRIGGER",
    LIFE_GAIN: "DRAW_ENGINE",
    OPPONENT_LIFE_LOSS: "DAMAGE_TO_PLAYER",
    CREATURE_CHEAT: "ETB_TRIGGER",
    TUTOR_ENGINE: "DRAW_ENGINE",
  };
  return map[motifId] ?? motifId;
}

export function assessDirectionValidity(input: {
  directionAnchors: DirectionAnchor[];
  drivers: string[];
  payoffs: string[];
  causalChainStatus: string;
}): DirectionValidity {
  if (input.directionAnchors.length === 0) {
    if (input.payoffs.length > 0 && input.drivers.length === 0) return "UNANCHORED_SIGNAL";
    return "ABSENT";
  }
  if (input.directionAnchors.length >= 1 && input.drivers.length > 0) return "ANCHORED";
  if (input.directionAnchors.length >= 1) return "ANCHORED";
  return "UNANCHORED_SIGNAL";
}

export function buildRetrievalSpecification(input: {
  profile: CommanderMechanicalProfile;
  anchors: DirectionAnchor[];
  motifs: ExtractedMotif[];
  requiredSupportFunctions: DerivedRoleName[];
  optionalSupportFunctions: DerivedRoleName[];
}): RetrievalSpecification {
  const causal = input.profile.causalRoles;
  const spec: RetrievalSpecification = {
    requiredFunctions: [...input.requiredSupportFunctions],
    desiredFunctions: [...input.optionalSupportFunctions],
    requiredInputs: [],
    outputsToExploit: [],
    resourcesToProduce: [...causal.resourcesProduced],
    resourcesToConsume: [...causal.resourcesConsumed, ...causal.costConsumes],
    statesToMaintain: [],
    statesToIncrease: [],
    relevantCardTypes: [],
    relevantZones: [],
    protectionNeeds: [],
    redundancyNeeds: [],
    structuralNeeds: [],
    avoidFunctions: [],
    avoidCardClasses: [],
    selfPenaltyConditions: [],
    constructionConstraints: [],
  };

  for (const anchor of input.anchors) {
    switch (anchor.mechanism) {
      case "SPELL_PUNISHMENT":
        pushUnique(spec.outputsToExploit, "spell_punishment_damage");
        pushUnique(spec.requiredInputs, "opponent_noncreature_spells");
        pushUnique(spec.constructionConstraints, "minimize_controller_noncreature_spells");
        break;
      case "COUNTER_SPELL":
        pushUnique(spec.requiredFunctions, "countermagic" as DerivedRoleName);
        pushUnique(spec.outputsToExploit, "spell_counter");
        break;
      case "CREATURE_REMOVAL":
      case "CREATURE_DAMAGE":
        pushUnique(spec.requiredFunctions, "removal" as DerivedRoleName);
        pushUnique(spec.outputsToExploit, "creature_removal");
        break;
      case "COUNTER_PLACEMENT":
        pushUnique(spec.statesToIncrease, "commander_counters");
        pushUnique(spec.requiredInputs, "damage_to_opponent_creatures");
        if (anchor.anchorKind === "ACTIVATED_ACTION") {
          pushUnique(spec.structuralNeeds, "counter_sources");
        }
        break;
      case "STATE_SCALING":
        pushUnique(spec.statesToMaintain, anchor.scalingBasis ?? "scaling_state");
        pushUnique(spec.statesToIncrease, anchor.subject);
        pushUnique(spec.requiredInputs, "untapped_permanents");
        pushUnique(spec.protectionNeeds, "threat_protection");
        pushUnique(spec.structuralNeeds, "board_development");
        break;
      case "CONVOKE_COST":
        pushUnique(spec.requiredInputs, "creature_board");
        pushUnique(spec.resourcesToConsume, "untapped_creatures");
        break;
      case "STATIC_PROTECTION":
      case "CONDITIONAL_PROTECTION":
        pushUnique(spec.statesToMaintain, anchor.requirement);
        pushUnique(spec.protectionNeeds, anchor.mechanism);
        break;
      case "TARGETED_PROTECTION":
        pushUnique(spec.protectionNeeds, "indestructible_grant");
        pushUnique(spec.requiredInputs, "etb_creatures");
        break;
      case "ATTACK_TRIGGER":
      case "COMBAT_DAMAGE_TRIGGER":
      case "COMBAT_BUFF":
        pushUnique(spec.outputsToExploit, "combat_payoff");
        break;
      case "TOKEN_GENERATION":
        pushUnique(spec.outputsToExploit, "tokens");
        break;
      case "OUTPUT_MULTIPLIER":
        pushUnique(spec.outputsToExploit, anchor.subject);
        pushUnique(spec.requiredInputs, anchor.requirement);
        pushUnique(spec.statesToIncrease, anchor.subject);
        pushUnique(spec.structuralNeeds, "repeatable_output_engine");
        break;
      case "CAST_FROM_EXILE":
        pushUnique(spec.relevantZones, "exile");
        pushUnique(spec.requiredInputs, "exiled_cards");
        pushUnique(spec.outputsToExploit, "free_cast");
        if (causal.engineConditions.includes("cost_reduction")) {
          pushUnique(spec.structuralNeeds, "cost_reduction_on_exiled_casts");
        }
        if (causal.engineInputs.includes("library_top")) pushUnique(spec.relevantZones, "library_top");
        break;
      case "COPY":
        pushUnique(spec.requiredInputs, "tokens");
        pushUnique(spec.outputsToExploit, "token_copy");
        break;
      case "RECURSION":
        pushUnique(spec.relevantZones, "graveyard");
        pushUnique(spec.outputsToExploit, "recursion");
        break;
      case "LAND_DEVELOPMENT":
        pushUnique(spec.requiredInputs, "land_drops");
        pushUnique(spec.resourcesToProduce, "mana");
        pushUnique(spec.structuralNeeds, "mana_development");
        break;
      case "COUNTER_STOCK":
        pushUnique(spec.statesToIncrease, "commander_counters");
        pushUnique(spec.requiredInputs, "commander_counters");
        pushUnique(spec.structuralNeeds, "counter_replenishment");
        break;
      case "STATE_ATTRITION":
        pushUnique(spec.requiredInputs, "opponent_creatures");
        pushUnique(spec.statesToIncrease, "opponent_state_markers");
        pushUnique(spec.outputsToExploit, "attrition_pressure");
        break;
      case "MARKED_DEATH_PAYOFF":
        pushUnique(spec.requiredInputs, "marked_creature_deaths");
        pushUnique(spec.outputsToExploit, "tokens");
        break;
      case "TUTOR_CHEAT":
        pushUnique(spec.requiredInputs, "creature_toolbox_targets");
        pushUnique(spec.outputsToExploit, "cheat_into_play");
        if (anchor.scalingBasis === "variable_cost") {
          pushUnique(spec.requiredInputs, "variable_cost_support");
          pushUnique(spec.structuralNeeds, "mana_for_scaled_cost");
        }
        break;
      case "TAP_STATE_TRIGGER":
        pushUnique(spec.requiredInputs, "tapped_creatures");
        pushUnique(spec.outputsToExploit, "combat_payoff");
        if (anchor.requirement.includes("undying")) pushUnique(spec.statesToMaintain, "undying_recursion");
        break;
      case "SCRY_TRIGGER":
        pushUnique(spec.requiredInputs, "scry_events");
        pushUnique(spec.statesToIncrease, "commander_counters");
        pushUnique(spec.relevantZones, "library_top");
        break;
      case "SCRY":
        pushUnique(spec.requiredInputs, "scry_events");
        pushUnique(spec.relevantZones, "library_top");
        break;
      case "TYPE_QUALIFIED_PLAY":
        pushUnique(spec.requiredInputs, "multi_type_spells");
        pushUnique(spec.relevantCardTypes, anchor.subject);
        pushUnique(spec.outputsToExploit, "tokens");
        break;
      case "MANA_GENERATION":
        pushUnique(spec.resourcesToProduce, "mana");
        if (anchor.requirement === "counter_removal") {
          pushUnique(spec.requiredInputs, "counters_on_permanents");
          pushUnique(spec.requiredInputs, "artifacts_enchantments");
        }
        break;
      case "DRAW_ENGINE":
        pushUnique(spec.outputsToExploit, "card_draw");
        break;
      case "GRAVEYARD":
        pushUnique(spec.relevantZones, "graveyard");
        pushUnique(spec.requiredInputs, "graveyard_permanents");
        break;
      case "SACRIFICE_ENGINE":
        pushUnique(spec.requiredInputs, "sacrifice_outlet");
        break;
      case "ETB_TRIGGER":
        pushUnique(spec.requiredInputs, "etb_permanents");
        break;
      case "STATIC_TYPAL_BUFF":
        pushUnique(spec.requiredInputs, `${anchor.subject}_creatures`);
        pushUnique(spec.relevantCardTypes, anchor.subject);
        pushUnique(spec.outputsToExploit, "combat_payoff");
        break;
      case "END_STEP_TRIGGER":
        pushUnique(spec.requiredInputs, "combat_attacks");
        pushUnique(spec.outputsToExploit, "tokens");
        break;
      case "PLANESWALKER_LOYALTY":
        if (anchor.requirement.includes("tutor")) {
          pushUnique(spec.requiredFunctions, "tutor" as DerivedRoleName);
          pushUnique(spec.requiredInputs, "toolbox_targets");
        }
        if (anchor.requirement.includes("card_draw")) pushUnique(spec.outputsToExploit, "card_draw");
        break;
      case "STATIC_TIMING_RESTRICTION":
        pushUnique(spec.statesToMaintain, "sorcery_speed_advantage");
        pushUnique(spec.constructionConstraints, "instant_sorcery_balance");
        break;
      case "EXILE_REPLACEMENT":
        pushUnique(spec.relevantZones, "exile");
        pushUnique(spec.requiredInputs, "creature_deaths");
        break;
      case "ABILITY_INHERITANCE":
        pushUnique(spec.relevantZones, "exile");
        pushUnique(spec.requiredInputs, "exiled_creatures");
        pushUnique(spec.outputsToExploit, "combat_payoff");
        break;
      case "TYPE_COUNT_SCALING":
        pushUnique(spec.requiredInputs, `${anchor.subject}_count`);
        pushUnique(spec.relevantCardTypes, anchor.subject);
        pushUnique(spec.outputsToExploit, "scaled_damage");
        break;
      case "TYPE_QUALIFIED_TUTOR":
        pushUnique(spec.requiredFunctions, "tutor" as DerivedRoleName);
        pushUnique(spec.requiredInputs, `${anchor.subject}_toolbox`);
        pushUnique(spec.relevantCardTypes, anchor.subject);
        break;
      default:
        if (anchor.requirement) pushUnique(spec.requiredInputs, anchor.requirement);
        break;
    }
  }

  for (const penalty of causal.selfPenaltyConditions ?? []) {
    spec.selfPenaltyConditions.push({
      trigger: penalty.trigger,
      actor: penalty.actor,
      penalty: penalty.penalty,
      constructionImplication: penalty.constructionImplication,
    });
    for (const impl of penalty.constructionImplication) {
      pushUnique(spec.constructionConstraints, impl);
    }
    if (penalty.constructionImplication.some((i) => i.includes("noncreature"))) {
      pushUnique(spec.avoidCardClasses, "noncreature_spells");
    }
  }

  if (causal.permissions.includes("cast_from_exile")) pushUnique(spec.relevantZones, "exile");
  if (causal.engineInputs.includes("graveyard_permanents")) pushUnique(spec.relevantZones, "graveyard");
  if (causal.engineInputs.includes("library_top")) pushUnique(spec.relevantZones, "library_top");

  return spec;
}

export function computeRetrievalSpecificationCompleteness(spec: RetrievalSpecification): number {
  let score = 0;
  if (spec.requiredFunctions.length > 0) score += 0.2;
  if (spec.requiredInputs.length > 0 || spec.outputsToExploit.length > 0) score += 0.25;
  if (spec.resourcesToProduce.length > 0 || spec.statesToIncrease.length > 0 || spec.statesToMaintain.length > 0)
    score += 0.2;
  if (spec.relevantZones.length > 0 || spec.protectionNeeds.length > 0 || spec.structuralNeeds.length > 0) score += 0.15;
  if (spec.constructionConstraints.length > 0 || spec.selfPenaltyConditions.length > 0) score += 0.1;
  if (spec.desiredFunctions.length > 0) score += 0.1;
  return Math.min(1, score);
}

// Extend RetrievalSpecification type usage — directionAnchors attached at build time in build-direction module
