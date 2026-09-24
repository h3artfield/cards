/**
 * Phase 6A.1 — Oracle-grounded overlay v2.
 * Case-specific Phase-6 corrections from independent Oracle adjudication.
 * Phase-5 remains frozen.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { ProposedSpecCorrectionV13 } from "./phase6a1-spec-correction-overlay-v1.3";
import type { EffectiveMechanicalDirectionOverride } from "./phase6a1-spec-correction-overlay-v1.3";

export const ORACLE_GROUNDED_OVERLAY_V2_VERSION = "phase6a1-oracle-grounded-overlay-v2";

const PROVENANCE = "PHASE6A1_CASE_SPECIFIC_ORACLE_ADJUDICATION_AUTHORIZED";

export type OracleGroundedOverlayEntry = {
  caseId: string;
  commanders: string[];
  specCorrections: ProposedSpecCorrectionV13[];
  effectiveMechanicalDirectionOverride: EffectiveMechanicalDirectionOverride;
};

export const ORACLE_GROUNDED_OVERLAY_V2: OracleGroundedOverlayEntry[] = [
  {
    caseId: "single-aristocrats-teysa",
    commanders: ["Teysa Karlov"],
    specCorrections: [
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        addValue: "creature_dies_triggers_controller_ability",
        rationale: "Teysa doubles triggered abilities when a creature dying causes a permanent's ability to trigger.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        addValue: "death_trigger_multiplication",
        rationale: "Typed semantic intent for death-caused trigger doubling.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "desiredFunctions",
        removeValue: "combat_payoff",
        rationale: "Token lifelink/vigilance is INDIRECT_SUPPORT only — not commander engine requirement.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:ETB_TRIGGER → blink_flicker",
      effectivePhase6Direction: "EVENT_TRIGGER: creature_dies_triggers_controller_ability → DEATH_TRIGGER_MULTIPLICATION",
      correctionReason: "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "multi-kenrith",
    commanders: ["Kenrith, the Returned King"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "damage_to_opponent_creatures", rationale: "Not in Kenrith Oracle." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "graveyard_permanents", rationale: "Replace with typed activated reanimation input." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "graveyard_setup", rationale: "Kenrith reanimates by activated ability, not generic graveyard setup." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "desiredFunctions", removeValue: "mill", rationale: "Not commander-derived." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "desiredFunctions", removeValue: "combat_payoff", rationale: "Trample/haste is activated combat buff, not generic combat payoff." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "combat_buff", rationale: "{R}: all creatures gain trample and haste." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "counter_placement", rationale: "{1}{G}: put +1/+1 counter on target creature." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "reanimation", rationale: "{4}{B}: return creature card from graveyard to battlefield." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "creature_card_in_graveyard", rationale: "Activated reanimation targets creature card in graveyard." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "ACTIVATED_ACTION:COUNTER_PLACEMENT → mana",
      effectivePhase6Direction:
        "COMPOSITE: activated combat_buff + counter_placement + life_gain + card_draw + creature_reanimation_from_graveyard",
      correctionReason: "Kenrith provides five distinct activated abilities — not counter→mana.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "stax-augustin",
    commanders: ["Grand Arbiter Augustin IV"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "countermagic", rationale: "Augustin does not counter spells." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "outputsToExploit", removeValue: "spell_counter", rationale: "Replace with spell cost modification semantics." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "spell_cost_reduction", rationale: "Your white/blue spells cost {1} less." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "opponent_spell_tax", rationale: "Opponents' spells cost {1} more." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "STATIC_CONSTRAINT:COUNTER_SPELL → tax",
      effectivePhase6Direction: "STATIC: controller_spell_cost_reduction + opponent_spell_cost_increase",
      correctionReason: "Cost reduction/tax — not counterspell semantics.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "hybrid-kinnan",
    commanders: ["Kinnan, Bonder Prodigy"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "untap", rationale: "Kinnan does not untap permanents." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "nonland_permanent_tapped_for_mana", rationale: "Whenever you tap a nonland permanent for mana..." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "mana_doubling", rationale: "Add one mana of any type that permanent produced." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "creature_from_library_top", rationale: "{5}{G}{U}: put non-Human creature from top five onto battlefield." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "COMPOSITE: ACTIVATED_ACTION:UNTAP_ENGINE + ACTIVATED_ACTION:MANA_GENERATION",
      effectivePhase6Direction:
        "COMPOSITE: nonland_permanent_tapped_for_mana → extra_mana + paid_library_top_creature",
      correctionReason: "Tap-for-mana doubling and paid top-five creature — not untap engine.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "hybrid-prosper",
    commanders: ["Prosper, Tome-Bound"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "ramp", rationale: "Not commander-derived." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "token_generation", rationale: "Treasure is output of engine, not generic token generation requirement." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "artifacts", rationale: "Replace with typed exile/play inputs." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "outputsToExploit", removeValue: "free_cast", rationale: "Play permission is not free cast." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "spell_cast_from_exile", rationale: "Whenever you play a card from exile..." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "outputsToExploit", addValue: "treasure_tokens", rationale: "Create a Treasure token on exile cast." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:TOKEN_GENERATION → TOKEN_GENERATION",
      effectivePhase6Direction:
        "COMPOSITE: end_step_exile_top → temporary_play_permission + spell_cast_from_exile → TREASURE_TOKEN",
      correctionReason: "Mystic Arcanum exile/play chain with Pact Boon Treasures.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "partner-thrasios-tymna",
    commanders: ["Thrasios, Triton Hero", "Tymna the Weaver"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "mana", rationale: "Replace with typed Thrasios activation input." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "card_draw", rationale: "Split Thrasios land/draw and Tymna combat-draw engines." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "thrasios_mana_activation", rationale: "{4}: scry/reveal — land to battlefield or draw." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "combat_damage_to_opponents", rationale: "Tymna postcombat draw scales with combat damage dealt." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "ramp", rationale: "Thrasios puts land onto battlefield." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "card_draw", rationale: "Thrasios draw branch and Tymna combat-draw." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "Thrasios, Triton Hero: ACTIVATED_ACTION:DRAW → mana",
      effectivePhase6Direction:
        "COMPOSITE: thrasios_pay_mana → scry → land_or_draw + combat_damage_to_opponents → pay_life → draw",
      correctionReason: "Model both partner engines independently.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "blindv5-59-tutor-toolbox",
    commanders: ["The Earth King"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "blink_flicker", rationale: "Not in Earth King Oracle." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "tutor", rationale: "Land search on attack is typed ramp, not generic tutor." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "multi_type_spells", rationale: "Not in Oracle." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "outputsToExploit", removeValue: "card_draw", rationale: "Not commander-derived." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "land_ramp", rationale: "Search basic lands on power 4+ attack." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "power4_creature_attack", rationale: "Creatures with power 4 or greater attack." },
      { action: "REPLACE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "etb_permanents", replaceWith: "commander_etb", rationale: "When The Earth King enters — typed ETB." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:TYPE_QUALIFIED_PLAY → TOKEN_GENERATION",
      effectivePhase6Direction: "COMPOSITE: commander_etb → BEAR_TOKEN + power4_creature_attack → BASIC_LAND_RAMP",
      correctionReason: "ETB Bear token and power-4-attack land ramp.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "blindv5-01-partner-pair",
    commanders: ["Leonardo, the Balance", "Reyhan, Last of the Abzan"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "damage_to_opponent_creatures", rationale: "Neither partner uses opponent-creature damage engine." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "token_enters", rationale: "Leonardo: whenever a token enters..." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "creature_dies_or_command_zone_with_counters", rationale: "Reyhan: creature dies or put into command zone with counters." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "Leonardo, the Balance: STATE_DEPENDENCY:COUNTER_PLACEMENT → counters",
      effectivePhase6Direction:
        "COMPOSITE: token_enters → counter_placement + creature_dies_or_command_zone_with_counters → counter_transfer",
      correctionReason: "Leonardo token counter spread + Reyhan counter transfer.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "blindv5-11-commander-background",
    commanders: ["Erinis, Gloom Stalker", "Clan Crafter"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "damage_to_opponent_creatures", rationale: "Not in Oracle." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "ramp", rationale: "Erinis returns land from graveyard — typed, not generic ramp." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "erinis_attacks", rationale: "Whenever Erinis attacks, return land from graveyard." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "artifact_sacrifice", rationale: "Clan Crafter: sacrifice artifact for counters/draw." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "Clan Crafter: ACTIVATED_ACTION:COUNTER_PLACEMENT → sacrifice",
      effectivePhase6Direction: "COMPOSITE: erinis_attacks → land_recursion + artifact_sacrifice → counter_and_draw",
      correctionReason: "Background sacrifice engine + Erinis attack land recursion.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "blindv5-19-narrow-single-engine",
    commanders: ["Dionus, Elvish Archdruid"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "combat_manipulation", rationale: "Not in Dionus Oracle." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "damage_to_opponent_creatures", rationale: "Not in Dionus Oracle." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "creature_tapped_during_your_turn", rationale: "Whenever this creature becomes tapped during your turn..." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:TAP_STATE_TRIGGER → combat_buff",
      effectivePhase6Direction: "EVENT_TRIGGER: creature_tapped_during_your_turn → untap_and_counter",
      correctionReason: "Elves untap and get +1/+1 counter when tapped on your turn.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "blindv5-26-activated-engine",
    commanders: ["Shaun & Rebecca, Agents"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "untap", rationale: "Shaun & Rebecca do not untap permanents." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "artifact_or_clue_sacrifice", rationale: "Sacrifice artifact or clue for draw/damage." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "COMPOSITE: ACTIVATED_ACTION:MANA_GENERATION + ACTIVATED_ACTION:UNTAP_ENGINE + ACTIVATED_ACTION:MANA_GENERATION",
      effectivePhase6Direction: "ACTIVATED: artifact_or_clue_sacrifice → draw_or_damage",
      correctionReason: "Activated sacrifice of artifacts/clues — not untap/mana engine.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "blindv5-45-graveyard",
    commanders: ["Mishra, Tamer of Mak Fawa"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "sacrifice_outlet", rationale: "Mishra grants ward-sacrifice — deck needs fodder, not generic outlet input." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "artifact_card_in_graveyard", rationale: "Each artifact in graveyard has unearth." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "unearth", rationale: "Artifact unearth from graveyard." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "ACTIVATED_ACTION:RECURSION → GRAVEYARD_RECURSION",
      effectivePhase6Direction: "COMPOSITE: artifact_unearth_from_graveyard + ward_sacrifice_permanents",
      correctionReason: "Unearth artifacts + ward—sacrifice a permanent.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "blindv5-50-enchantments",
    commanders: ["Terra, Magical Adept // Esper Terra"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "sacrifice_outlet", rationale: "Saga copies sacrifice at end step — not generic outlet requirement." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "untap", rationale: "Terra does not untap permanents." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "enchantment_in_graveyard_or_milled", rationale: "Mill five, put enchantment from milled into hand." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "enchantment_recursion", rationale: "Recover enchantments from mill." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "saga_token_copy", rationale: "Esper Terra creates enchantment/Saga token copies." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "COMPOSITE: ACTIVATED_ACTION:TOKEN_GENERATION + EVENT_TRIGGER:SACRIFICE_ENGINE + ACTIVATED_ACTION:UNTAP_ENGINE + ACTIVATED_ACTION:MANA_GENERATION",
      effectivePhase6Direction:
        "COMPOSITE: mill_enchantment_to_hand + saga_enchantment_token_copy + transform_mana_burst",
      correctionReason: "Enchantment mill/recursion and Saga token copies — not untap engine.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
];

export function getOracleGroundedOverlayEntry(caseId: string): OracleGroundedOverlayEntry | undefined {
  return ORACLE_GROUNDED_OVERLAY_V2.find((e) => e.caseId === caseId);
}

export function applyOracleGroundedOverlayV2(
  spec: RetrievalSpecification,
  frozenDirection: string,
  entry: OracleGroundedOverlayEntry,
): { spec: RetrievalSpecification; effectiveMechanicalDirection: string } {
  let out = spec;
  for (const pc of entry.specCorrections) {
    if (pc.action === "NOOP_PHANTOM_FIELD") continue;
    const clone: RetrievalSpecification = {
      ...out,
      requiredFunctions: [...out.requiredFunctions],
      desiredFunctions: [...out.desiredFunctions],
      requiredInputs: [...out.requiredInputs],
      outputsToExploit: [...out.outputsToExploit],
      resourcesToProduce: [...out.resourcesToProduce],
      resourcesToConsume: [...out.resourcesToConsume],
      statesToMaintain: [...out.statesToMaintain],
      statesToIncrease: [...out.statesToIncrease],
      relevantCardTypes: [...out.relevantCardTypes],
      relevantZones: [...out.relevantZones],
      protectionNeeds: [...out.protectionNeeds],
      redundancyNeeds: [...out.redundancyNeeds],
      structuralNeeds: [...out.structuralNeeds],
      avoidFunctions: [...out.avoidFunctions],
      avoidCardClasses: [...out.avoidCardClasses],
      selfPenaltyConditions: [...out.selfPenaltyConditions],
      constructionConstraints: [...out.constructionConstraints],
    };
    const arr = [...(clone[pc.field] as string[])];
    if (pc.action === "REMOVE_LINKED_SPEC_FIELD" && pc.removeValue) {
      clone[pc.field] = arr.filter((v) => v !== pc.removeValue) as never;
    } else if (pc.action === "REPLACE_LINKED_SPEC_FIELD" && pc.removeValue && pc.replaceWith) {
      clone[pc.field] = arr.map((v) => (v === pc.removeValue ? pc.replaceWith! : v)) as never;
    } else if (pc.action === "ADD_LINKED_SPEC_FIELD" && pc.addValue && !arr.includes(pc.addValue)) {
      clone[pc.field] = [...arr, pc.addValue] as never;
    }
    out = clone;
  }
  return {
    spec: out,
    effectiveMechanicalDirection: entry.effectiveMechanicalDirectionOverride.effectivePhase6Direction,
  };
}
