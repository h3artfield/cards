/**
 * Phase 6A.1 P11 — RetrievalSpecificationCorrection overlay v1.2 (post independent adjudication).
 * Phase-5 artifacts remain frozen. Corrections apply only via Phase-6 overlay.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";

export const RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_2_VERSION = "phase6-retrieval-spec-correction-overlay-v1.2";

export type SpecCorrectionAction =
  | "REMOVE_LINKED_SPEC_FIELD"
  | "REPLACE_LINKED_SPEC_FIELD"
  | "ADD_LINKED_SPEC_FIELD"
  | "NOOP_PHANTOM_FIELD";

export type ProposedSpecCorrectionV12 = {
  action: SpecCorrectionAction;
  field: keyof RetrievalSpecification;
  removeValue?: string;
  replaceWith?: string;
  addValue?: string;
  rationale: string;
};

export type P11AdjudicationLabel = "ACCEPT_CORRECTION" | "REJECT_CORRECTION" | "NEEDS_DIFFERENT_CORRECTION";

export type OverlayApplicationStatus =
  | "ACCEPTED"
  | "ACCEPTED_DIFFERENT_CORRECTION"
  | "REJECTED"
  | "PENDING_INDEPENDENT_REVIEW";

export type RetrievalSpecificationCorrectionOverlayEntryV12 = {
  correctionId: string;
  caseId: string;
  commanders: string[];
  conflictRequirementId: string;
  conflictLinkedSpecField: string;
  independentAdjudicationLabel: P11AdjudicationLabel;
  independentAdjudicationNotes: string;
  overlayStatus: OverlayApplicationStatus;
  corrections: ProposedSpecCorrectionV12[];
  /** Fields requiring scrutiny in residual consistency audit (may extend beyond P11 correction). */
  residualAuditFocus: string[];
  provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL";
  note: string;
};

/** Post-adjudication overlay — 8 entries, all adjudicated 2026-08-13. */
export const PHASE6A1_SPEC_CORRECTION_OVERLAY_V12: RetrievalSpecificationCorrectionOverlayEntryV12[] = [
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
    residualAuditFocus: ["requiredFunctions:blink_flicker"],
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "ACCEPT does not certify remainder of frozen Phase-5 spec.",
  },
  {
    correctionId: "p11-elsha-top-of-library",
    caseId: "blindv5-23-triggered-engine",
    commanders: ["Elsha, Threefold Master"],
    conflictRequirementId: "top_of_library_manipulation",
    conflictLinkedSpecField: "requiredInputs:top_of_library",
    independentAdjudicationLabel: "NEEDS_DIFFERENT_CORRECTION",
    independentAdjudicationNotes:
      "Reject cast_from_top_of_library replacement — Oracle has prowess and combat-damage tokens, not top-of-library casting. top_of_library absent from frozen spec. Remove phantom requirement only.",
    overlayStatus: "ACCEPTED_DIFFERENT_CORRECTION",
    corrections: [
      {
        action: "NOOP_PHANTOM_FIELD",
        field: "requiredInputs",
        removeValue: "top_of_library",
        rationale: "Phantom top_of_library field absent from frozen Phase-5 spec — no replacement added.",
      },
    ],
    residualAuditFocus: [
      "requiredInputs:opponent_noncreature_spells",
      "constructionConstraints:minimize_controller_noncreature_spells",
    ],
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "Residual audit required: prowess rewards controller noncreature spells vs minimize constraint.",
  },
  {
    correctionId: "p11-cyclonus-damage-opponent-creatures",
    caseId: "blindv5-42-resource-conversion",
    commanders: ["Cyclonus, the Saboteur // Cyclonus, Cybertronian Fighter"],
    conflictRequirementId: "required_input:damage_to_opponent_creatures",
    conflictLinkedSpecField: "requiredInputs:damage_to_opponent_creatures",
    independentAdjudicationLabel: "NEEDS_DIFFERENT_CORRECTION",
    independentAdjudicationNotes:
      "Replace with combat_damage_to_player — both faces trigger on combat damage to a player.",
    overlayStatus: "ACCEPTED_DIFFERENT_CORRECTION",
    corrections: [
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "damage_to_opponent_creatures",
        replaceWith: "combat_damage_to_player",
        rationale: "Cyclonus triggers when dealing combat damage to a player, not generic opponent-creature damage.",
      },
    ],
    residualAuditFocus: ["requiredInputs:combat_damage_to_player"],
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "Typed trigger condition replaces incorrect required input.",
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
        rationale: "Chainer is a nightmare/discard-reanimation engine; combat manipulation not commander-derived.",
      },
    ],
    residualAuditFocus: [],
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "ACCEPT does not certify remainder of frozen Phase-5 spec.",
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
    residualAuditFocus: [],
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "ACCEPT does not certify remainder of frozen Phase-5 spec.",
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
        rationale: "Orvar copies triggered abilities of permanents; spell copying not commander-derived.",
      },
    ],
    residualAuditFocus: [],
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "ACCEPT does not certify remainder of frozen Phase-5 spec.",
  },
  {
    correctionId: "p11-zellix-graveyard-setup",
    caseId: "blindv5-16-commander-background",
    commanders: ["Zellix, Sanity Flayer", "Acolyte of Bahamut"],
    conflictRequirementId: "required_function:graveyard_setup",
    conflictLinkedSpecField: "requiredFunctions:graveyard_setup",
    independentAdjudicationLabel: "NEEDS_DIFFERENT_CORRECTION",
    independentAdjudicationNotes:
      "Replace generic graveyard_setup with typed mill semantics: mill_target_player, creature_cards_milled, token payoff.",
    overlayStatus: "ACCEPTED_DIFFERENT_CORRECTION",
    corrections: [
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "graveyard_setup",
        replaceWith: "mill_target_player",
        rationale: "Zellix triggers when any player mills creature cards; replace generic graveyard_setup.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        addValue: "creature_cards_milled",
        rationale: "Hive Mind trigger requires creature cards milled (any player).",
      },
    ],
    residualAuditFocus: ["requiredFunctions:mill_target_player", "requiredInputs:creature_cards_milled", "requiredInputs:graveyard_permanents"],
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "Self-graveyard filling must not masquerade as the requirement.",
  },
  {
    correctionId: "p11-nita-graveyard-setup",
    caseId: "blindv5-53-counters",
    commanders: ["Nita, Forum Conciliator"],
    conflictRequirementId: "required_function:graveyard_setup",
    conflictLinkedSpecField: "requiredFunctions:graveyard_setup",
    independentAdjudicationLabel: "NEEDS_DIFFERENT_CORRECTION",
    independentAdjudicationNotes:
      "Replace graveyard_setup with opponent_graveyard_instant_sorcery_availability. Audit top_library_cast / CAST_FROM_LIBRARY_TOP — unsupported by Oracle.",
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
    residualAuditFocus: [
      "requiredInputs:top_library_cast",
      "mechanicalDirection:CAST_FROM_LIBRARY_TOP",
      "requiredFunctions:spell_copying",
    ],
    provenance: "PHASE6A1_P11_INDEPENDENT_ADJUDICATION_GPT56SOL",
    note: "Opponent mill/discard may qualify as DIRECT/INDIRECT support for typed requirement.",
  },
];

export function applySpecCorrectionOverlay(
  spec: RetrievalSpecification,
  entries: RetrievalSpecificationCorrectionOverlayEntryV12[],
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

  const applicable = entries.filter(
    (e) => e.overlayStatus === "ACCEPTED" || e.overlayStatus === "ACCEPTED_DIFFERENT_CORRECTION",
  );

  for (const entry of applicable) {
    for (const pc of entry.corrections) {
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
  }
  return out;
}

export function getOverlayForCase(caseId: string): RetrievalSpecificationCorrectionOverlayEntryV12 | undefined {
  return PHASE6A1_SPEC_CORRECTION_OVERLAY_V12.find((e) => e.caseId === caseId);
}
