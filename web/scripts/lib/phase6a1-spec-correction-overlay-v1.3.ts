/**
 * Phase 6A.1 P11 — RetrievalSpecificationCorrection overlay v1.3.
 * Extends v1.2 with residual-audit Phase-6 corrections and effective mechanical-direction overrides.
 * Phase-5 artifacts remain frozen; corrections apply only via Phase-6 overlay.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  type P11AdjudicationLabel,
  type ProposedSpecCorrectionV12,
  type SpecCorrectionAction,
  type OverlayApplicationStatus,
} from "./phase6a1-spec-correction-overlay-v1.2";

export const RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_VERSION = "phase6-retrieval-spec-correction-overlay-v1.3";

export type ProposedSpecCorrectionV13 = ProposedSpecCorrectionV12;

export type EffectiveMechanicalDirectionOverride = {
  originalFrozenDirection: string;
  effectivePhase6Direction: string;
  correctionReason: string;
  independentAdjudicationProvenance: string;
};

export type RetrievalSpecificationCorrectionOverlayEntryV13 = {
  correctionId: string;
  caseId: string;
  commanders: string[];
  conflictRequirementId: string;
  conflictLinkedSpecField: string;
  independentAdjudicationLabel: P11AdjudicationLabel;
  independentAdjudicationNotes: string;
  overlayStatus: OverlayApplicationStatus;
  /** v1.2 P11 adjudication corrections — retained. */
  corrections: ProposedSpecCorrectionV13[];
  /** v1.3 residual-audit Phase-6 corrections — authorized post P11. */
  residualCorrections: ProposedSpecCorrectionV13[];
  effectiveMechanicalDirectionOverride: EffectiveMechanicalDirectionOverride;
  provenance: string;
  note: string;
};

const RESIDUAL_PROVENANCE = "PHASE6A1_P11_RESIDUAL_AUDIT_V2_AUTHORIZED_CORRECTIONS";

/** Full overlay — v1.2 operations retained plus v1.3 residual corrections. */
export const PHASE6A1_SPEC_CORRECTION_OVERLAY_V13: RetrievalSpecificationCorrectionOverlayEntryV13[] = [
  {
    correctionId: "p11-teysa-blink-flicker",
    caseId: "single-aristocrats-teysa",
    commanders: ["Teysa Karlov"],
    conflictRequirementId: "required_function:blink_flicker",
    conflictLinkedSpecField: "requiredFunctions:blink_flicker",
    independentAdjudicationLabel: "ACCEPT_CORRECTION",
    independentAdjudicationNotes: "Remove requiredFunctions:blink_flicker — not commander-derived for Teysa Karlov.",
    overlayStatus: "ACCEPTED",
    corrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "blink_flicker",
        rationale: "Teysa Karlov rewards doubled death triggers; blink/flicker is not commander-derived.",
      },
    ],
    residualCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "etb_permanents",
        rationale: "Teysa doubles death-caused triggers, not ETB triggers; etb_permanents is not commander-derived.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:ETB_TRIGGER → blink_flicker",
      effectivePhase6Direction: "EVENT_TRIGGER:CREATURE_DIES → DEATH_TRIGGER_MULTIPLICATION",
      correctionReason:
        "Creature dies → death-caused permanent trigger → additional trigger. ETB/blink direction is historically frozen but not effective.",
      independentAdjudicationProvenance: RESIDUAL_PROVENANCE,
    },
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "v1.3 residual: remove etb_permanents; override mechanical direction to death-trigger multiplication.",
  },
  {
    correctionId: "p11-elsha-top-of-library",
    caseId: "blindv5-23-triggered-engine",
    commanders: ["Elsha, Threefold Master"],
    conflictRequirementId: "top_of_library_manipulation",
    conflictLinkedSpecField: "requiredInputs:top_of_library",
    independentAdjudicationLabel: "NEEDS_DIFFERENT_CORRECTION",
    independentAdjudicationNotes:
      "Reject cast_from_top_of_library — Oracle has prowess and combat-damage tokens, not top-of-library casting.",
    overlayStatus: "ACCEPTED_DIFFERENT_CORRECTION",
    corrections: [
      {
        action: "NOOP_PHANTOM_FIELD",
        field: "requiredInputs",
        removeValue: "top_of_library",
        rationale: "Phantom top_of_library field absent from frozen Phase-5 spec — no replacement added.",
      },
    ],
    residualCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "spell_copying",
        rationale: "Spell copying not in Elsha Oracle text.",
      },
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "opponent_noncreature_spells",
        replaceWith: "controller_noncreature_spell_cast",
        rationale: "Prowess triggers when YOU cast a noncreature spell — controller input, not opponent.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "constructionConstraints",
        removeValue: "minimize_controller_noncreature_spells",
        rationale: "Prowess rewards controller casting noncreature spells; minimize constraint conflicts.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "outputsToExploit",
        removeValue: "spell_punishment_damage",
        rationale: "No spell-punishment damage mechanic in Elsha Oracle text.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:TOKEN_GENERATION → TOKEN_GENERATION",
      effectivePhase6Direction:
        "COMPOSITE: controller_noncreature_spell_cast → PROWESS + combat_damage_to_player → TOKEN_GENERATION",
      correctionReason:
        "Controller casts noncreature spell → prowess; combat damage to player → Monk token generation. No top-of-library semantics.",
      independentAdjudicationProvenance: RESIDUAL_PROVENANCE,
    },
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "v1.3 residual: typed controller noncreature input; remove spell_copying, spell_punishment, minimize constraint.",
  },
  {
    correctionId: "p11-cyclonus-damage-opponent-creatures",
    caseId: "blindv5-42-resource-conversion",
    commanders: ["Cyclonus, the Saboteur // Cyclonus, Cybertronian Fighter"],
    conflictRequirementId: "required_input:damage_to_opponent_creatures",
    conflictLinkedSpecField: "requiredInputs:damage_to_opponent_creatures",
    independentAdjudicationLabel: "NEEDS_DIFFERENT_CORRECTION",
    independentAdjudicationNotes: "Replace with combat_damage_to_player — both faces trigger on combat damage to a player.",
    overlayStatus: "ACCEPTED_DIFFERENT_CORRECTION",
    corrections: [
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "damage_to_opponent_creatures",
        replaceWith: "combat_damage_to_player",
        rationale: "Cyclonus triggers when dealing combat damage to a player.",
      },
    ],
    residualCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "resourcesToProduce",
        removeValue: "mana",
        rationale: "Oracle describes connive/convert and extra beginning phase, not mana production.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection:
        "COMPOSITE: EVENT_TRIGGER:MANA_GENERATION + STATE_DEPENDENCY:COUNTER_PLACEMENT + ACTIVATED_ACTION:MANA_GENERATION",
      effectivePhase6Direction:
        "COMPOSITE: combat_damage_to_player → CONNIVE + CONVERT + ADDITIONAL_BEGINNING_PHASE",
      correctionReason:
        "Combat damage to player triggers connive and convert; fighter face grants additional beginning phase. Mana generation direction unsupported.",
      independentAdjudicationProvenance: RESIDUAL_PROVENANCE,
    },
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "v1.3 residual: remove unsupported mana production; override direction to connive/convert/extra phase.",
  },
  {
    correctionId: "p11-chainer-combat-manipulation",
    caseId: "blindv5-44-unusual-zones",
    commanders: ["Chainer, Dementia Master"],
    conflictRequirementId: "required_function:combat_manipulation",
    conflictLinkedSpecField: "requiredFunctions:combat_manipulation",
    independentAdjudicationLabel: "ACCEPT_CORRECTION",
    independentAdjudicationNotes: "Remove requiredFunctions:combat_manipulation.",
    overlayStatus: "ACCEPTED",
    corrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "combat_manipulation",
        rationale: "Chainer is a nightmare reanimation engine; combat manipulation not commander-derived.",
      },
    ],
    residualCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "etb_permanents",
        rationale: "Chainer reanimates from graveyard via activated ability, not ETB triggers.",
      },
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "graveyard_permanents",
        replaceWith: "creature_card_in_graveyard",
        rationale: "Activated ability targets creature card in a graveyard for reanimation.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:ETB_TRIGGER → put_onto_battlefield",
      effectivePhase6Direction:
        "ACTIVATED_ACTION: pay_life + creature_card_in_graveyard → put_onto_battlefield_under_your_control",
      correctionReason: "Reanimation via activated ability and life payment, not ETB-trigger engine.",
      independentAdjudicationProvenance: RESIDUAL_PROVENANCE,
    },
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "v1.3 residual: typed graveyard creature card input; remove etb_permanents.",
  },
  {
    correctionId: "p11-daxos-spell-copying",
    caseId: "blindv5-25-activated-engine",
    commanders: ["Daxos the Returned"],
    conflictRequirementId: "required_function:spell_copying",
    conflictLinkedSpecField: "requiredFunctions:spell_copying",
    independentAdjudicationLabel: "ACCEPT_CORRECTION",
    independentAdjudicationNotes: "Remove requiredFunctions:spell_copying.",
    overlayStatus: "ACCEPTED",
    corrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "spell_copying",
        rationale: "Daxos rewards enchantment casting and experience; spell copying not in commander text.",
      },
    ],
    residualCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "opponent_noncreature_spells",
        rationale: "Daxos triggers on controller enchantment spells, not opponent noncreature spells.",
      },
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "spell_cast",
        replaceWith: "controller_enchantment_spell_cast",
        rationale: "Whenever you cast an enchantment spell → experience counter.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "outputsToExploit",
        removeValue: "spell_punishment_damage",
        rationale: "No spell-punishment damage in Daxos Oracle text.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "constructionConstraints",
        removeValue: "minimize_controller_noncreature_spells",
        rationale: "Daxos rewards enchantment spell casting; minimize constraint unsupported.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:SPELL_PUNISHMENT → enchantment",
      effectivePhase6Direction:
        "COMPOSITE: controller_enchantment_spell_cast → EXPERIENCE_COUNTER + ACTIVATED_ACTION → Spirit_enchantment_creature_token",
      correctionReason:
        "Controller casts enchantment → experience counter → Spirit enchantment-creature token scaling.",
      independentAdjudicationProvenance: RESIDUAL_PROVENANCE,
    },
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "v1.3 residual: typed enchantment input; remove opponent/spell-punishment/minimize contamination.",
  },
  {
    correctionId: "p11-orvar-spell-copying",
    caseId: "blindv5-51-tokens",
    commanders: ["Orvar, the All-Form"],
    conflictRequirementId: "required_function:spell_copying",
    conflictLinkedSpecField: "requiredFunctions:spell_copying",
    independentAdjudicationLabel: "ACCEPT_CORRECTION",
    independentAdjudicationNotes: "Remove requiredFunctions:spell_copying.",
    overlayStatus: "ACCEPTED",
    corrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "spell_copying",
        rationale: "Orvar creates token copies when you cast inst/sorc targeting own permanent; not spell copying.",
      },
    ],
    residualCorrections: [
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "opponent_noncreature_spells",
        replaceWith: "controller_instant_or_sorcery_targets_own_permanent",
        rationale: "Trigger requires YOU cast inst/sorc targeting another permanent you control.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "outputsToExploit",
        removeValue: "spell_punishment_damage",
        rationale: "No spell-punishment damage in Orvar Oracle text.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "constructionConstraints",
        removeValue: "minimize_controller_noncreature_spells",
        rationale: "Orvar rewards casting inst/sorc; minimize constraint conflicts.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "spell_cast",
        rationale: "Generic spell_cast superseded by typed controller_instant_or_sorcery_targets_own_permanent input.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:SPELL_PUNISHMENT → TOKEN_GENERATION",
      effectivePhase6Direction:
        "EVENT_TRIGGER: controller_instant_or_sorcery_targets_own_permanent → TOKEN_COPY_OF_TARGET_PERMANENT",
      correctionReason:
        "Cast instant/sorcery targeting another permanent you control → create token copy. Copied spells are not cast.",
      independentAdjudicationProvenance: RESIDUAL_PROVENANCE,
    },
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "v1.3 residual: typed inst/sorc targeting input; remove spell-punishment/minimize contamination.",
  },
  {
    correctionId: "p11-zellix-graveyard-setup",
    caseId: "blindv5-16-commander-background",
    commanders: ["Zellix, Sanity Flayer", "Acolyte of Bahamut"],
    conflictRequirementId: "required_function:graveyard_setup",
    conflictLinkedSpecField: "requiredFunctions:graveyard_setup",
    independentAdjudicationLabel: "NEEDS_DIFFERENT_CORRECTION",
    independentAdjudicationNotes: "Replace graveyard_setup with typed mill semantics.",
    overlayStatus: "ACCEPTED_DIFFERENT_CORRECTION",
    corrections: [
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "graveyard_setup",
        replaceWith: "mill_target_player",
        rationale: "Zellix triggers when any player mills creature cards.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        addValue: "creature_cards_milled",
        rationale: "Hive Mind trigger requires creature cards milled.",
      },
    ],
    residualCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "graveyard_permanents",
        rationale: "Mill-to-token engine does not require generic graveyard permanents input.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "Zellix, Sanity Flayer: EVENT_TRIGGER:TOKEN_GENERATION → TOKEN_GENERATION",
      effectivePhase6Direction: "COMPOSITE: player_mills_creature_cards → Horror_TOKEN_GENERATION",
      correctionReason: "Player mills creature card(s) → Horror token generation. Graveyard zone is descriptive only.",
      independentAdjudicationProvenance: RESIDUAL_PROVENANCE,
    },
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "v1.3 residual: remove graveyard_permanents; self-graveyard setup must not masquerade as requirement.",
  },
  {
    correctionId: "p11-nita-graveyard-setup",
    caseId: "blindv5-53-counters",
    commanders: ["Nita, Forum Conciliator"],
    conflictRequirementId: "required_function:graveyard_setup",
    conflictLinkedSpecField: "requiredFunctions:graveyard_setup",
    independentAdjudicationLabel: "NEEDS_DIFFERENT_CORRECTION",
    independentAdjudicationNotes: "Replace graveyard_setup with opponent_graveyard_instant_sorcery_availability.",
    overlayStatus: "ACCEPTED_DIFFERENT_CORRECTION",
    corrections: [
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "graveyard_setup",
        replaceWith: "opponent_graveyard_instant_sorcery_availability",
        rationale: "Nita activated ability exiles opponent instant/sorcery from graveyard to cast.",
      },
    ],
    residualCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "spell_copying",
        rationale: "Spell copying not in Nita Oracle text.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "top_library_cast",
        rationale: "Nita does not cast from top of library.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "outputsToExploit",
        removeValue: "free_cast",
        rationale: "Nita casts opponent spell with mana payment flexibility, not free cast.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "sacrifice_outlet",
        rationale: "Nita herself supplies the sacrifice outlet; deck needs expendable creatures, not extra outlets.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "sacrifice_outlet",
        rationale: "Commander provides sacrifice outlet; resourcesToConsume:creatures covers fodder need.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:CAST_FROM_LIBRARY_TOP → top_library_cast",
      effectivePhase6Direction:
        "COMPOSITE: sacrifice_creature + opponent_graveyard_instant_sorcery → exile_cast_spell_you_dont_own → COUNTER_PLACEMENT",
      correctionReason:
        "Sacrifice another creature → exile opponent inst/sorc from graveyard → cast spell you don't own → +1/+1 counter on each creature.",
      independentAdjudicationProvenance: RESIDUAL_PROVENANCE,
    },
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "v1.3 residual: remove top_library, free_cast, spell_copying, redundant sacrifice_outlet requirements.",
  },
];

export type EffectiveOverlayResult = {
  spec: RetrievalSpecification;
  effectiveMechanicalDirection: string;
  originalFrozenMechanicalDirection: string;
  directionOverride: EffectiveMechanicalDirectionOverride | null;
};

function applyCorrections(
  spec: RetrievalSpecification,
  corrections: ProposedSpecCorrectionV13[],
): RetrievalSpecification {
  const out: RetrievalSpecification = {
    ...spec,
    requiredFunctions: [...spec.requiredFunctions],
    desiredFunctions: [...spec.desiredFunctions],
    requiredInputs: [...spec.requiredInputs],
    outputsToExploit: [...spec.outputsToExploit],
    resourcesToProduce: [...spec.resourcesToProduce],
    resourcesToConsume: [...spec.resourcesToConsume],
    statesToMaintain: [...spec.statesToMaintain],
    statesToIncrease: [...spec.statesToIncrease],
    relevantCardTypes: [...spec.relevantCardTypes],
    relevantZones: [...spec.relevantZones],
    protectionNeeds: [...spec.protectionNeeds],
    redundancyNeeds: [...spec.redundancyNeeds],
    structuralNeeds: [...spec.structuralNeeds],
    avoidFunctions: [...spec.avoidFunctions],
    avoidCardClasses: [...spec.avoidCardClasses],
    selfPenaltyConditions: [...spec.selfPenaltyConditions],
    constructionConstraints: [...spec.constructionConstraints],
  };

  for (const pc of corrections) {
    if (pc.action === "NOOP_PHANTOM_FIELD") continue;
    const arr = [...(out[pc.field] as string[])];
    if (pc.action === "REMOVE_LINKED_SPEC_FIELD" && pc.removeValue) {
      out[pc.field] = arr.filter((v) => v !== pc.removeValue) as never;
    } else if (pc.action === "REPLACE_LINKED_SPEC_FIELD" && pc.removeValue && pc.replaceWith) {
      out[pc.field] = arr.map((v) => (v === pc.removeValue ? pc.replaceWith! : v)) as never;
    } else if (pc.action === "ADD_LINKED_SPEC_FIELD" && pc.addValue && !arr.includes(pc.addValue)) {
      out[pc.field] = [...arr, pc.addValue] as never;
    }
  }
  return out;
}

export function applySpecCorrectionOverlayV13(
  spec: RetrievalSpecification,
  frozenMechanicalDirection: string,
  entry: RetrievalSpecificationCorrectionOverlayEntryV13,
): EffectiveOverlayResult {
  if (entry.overlayStatus !== "ACCEPTED" && entry.overlayStatus !== "ACCEPTED_DIFFERENT_CORRECTION") {
    return {
      spec,
      effectiveMechanicalDirection: frozenMechanicalDirection,
      originalFrozenMechanicalDirection: frozenMechanicalDirection,
      directionOverride: null,
    };
  }

  let effectiveSpec = applyCorrections(spec, entry.corrections);
  effectiveSpec = applyCorrections(effectiveSpec, entry.residualCorrections);

  return {
    spec: effectiveSpec,
    effectiveMechanicalDirection: entry.effectiveMechanicalDirectionOverride.effectivePhase6Direction,
    originalFrozenMechanicalDirection: frozenMechanicalDirection,
    directionOverride: entry.effectiveMechanicalDirectionOverride,
  };
}

export function getOverlayForCaseV13(caseId: string): RetrievalSpecificationCorrectionOverlayEntryV13 | undefined {
  return PHASE6A1_SPEC_CORRECTION_OVERLAY_V13.find((e) => e.caseId === caseId);
}

export { type SpecCorrectionAction };
