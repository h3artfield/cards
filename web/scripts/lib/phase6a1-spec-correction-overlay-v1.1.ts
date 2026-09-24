/**
 * Phase 6A.1 — RetrievalSpecificationCorrection overlay (P11 upstream spec conflicts).
 * Does NOT mutate frozen Phase-5 discovery artifacts.
 * Case IDs verified against frozen 271-packet UPSTREAM_SPEC_CONFLICT pairs.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";

export const RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_1_VERSION = "phase6-retrieval-spec-correction-overlay-v1.1";

export type ProposedSpecCorrection = {
  action: "REMOVE_LINKED_SPEC_FIELD" | "REPLACE_LINKED_SPEC_FIELD";
  field: keyof RetrievalSpecification;
  removeValue?: string;
  replaceWith?: string;
  rationale: string;
};

export type RetrievalSpecificationCorrectionOverlayEntryV11 = {
  correctionId: string;
  caseId: string;
  commanders: string[];
  conflictRequirementId: string;
  conflictLinkedSpecField: string;
  frozenPhase5RetrievalSpecification: RetrievalSpecification | null;
  overlayStatus: "PENDING_INDEPENDENT_REVIEW" | "ACCEPTED" | "REJECTED";
  proposedCorrection: ProposedSpecCorrection;
  provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW";
  note: string;
};

/** P11 — eight requirement-level upstream spec conflicts (not retriever failures). */
export const PHASE6A1_UPSTREAM_SPEC_CONFLICTS: RetrievalSpecificationCorrectionOverlayEntryV11[] = [
  {
    correctionId: "p11-teysa-blink-flicker",
    caseId: "single-aristocrats-teysa",
    commanders: ["Teysa Karlov"],
    conflictRequirementId: "required_function:blink_flicker",
    conflictLinkedSpecField: "requiredFunctions:blink_flicker",
    frozenPhase5RetrievalSpecification: null,
    overlayStatus: "PENDING_INDEPENDENT_REVIEW",
    proposedCorrection: {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "requiredFunctions",
      removeValue: "blink_flicker",
      rationale:
        "Teysa Karlov rewards doubled death triggers and aristocrats sacrifice payoffs. Blink/flicker is not a commander-derived retrieval requirement for this direction.",
    },
    provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW",
    note: "Overlay only — Phase-5 artifact unchanged until independent adjudication accepts correction.",
  },
  {
    correctionId: "p11-elsha-top-of-library",
    caseId: "blindv5-23-triggered-engine",
    commanders: ["Elsha, Threefold Master"],
    conflictRequirementId: "top_of_library_manipulation",
    conflictLinkedSpecField: "requiredInputs:top_of_library",
    frozenPhase5RetrievalSpecification: null,
    overlayStatus: "PENDING_INDEPENDENT_REVIEW",
    proposedCorrection: {
      action: "REPLACE_LINKED_SPEC_FIELD",
      field: "requiredInputs",
      removeValue: "top_of_library",
      replaceWith: "cast_from_top_of_library",
      rationale:
        "Elsha, Threefold Master casts noncreature spells from the top of the library. Retrieval should encode cast-from-top permission, not generic top-of-library manipulation.",
    },
    provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW",
    note: "Overlay only — Phase-5 artifact unchanged until independent adjudication accepts correction.",
  },
  {
    correctionId: "p11-cyclonus-damage-opponent-creatures",
    caseId: "blindv5-42-resource-conversion",
    commanders: ["Cyclonus, the Saboteur // Cyclonus, Cybertronian Fighter"],
    conflictRequirementId: "required_input:damage_to_opponent_creatures",
    conflictLinkedSpecField: "requiredInputs:damage_to_opponent_creatures",
    frozenPhase5RetrievalSpecification: null,
    overlayStatus: "PENDING_INDEPENDENT_REVIEW",
    proposedCorrection: {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "requiredInputs",
      removeValue: "damage_to_opponent_creatures",
      rationale:
        "Cyclonus's vehicle/transform identity does not derive a required-input obligation to damage opponent creatures.",
    },
    provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW",
    note: "Overlay only — Phase-5 artifact unchanged until independent adjudication accepts correction.",
  },
  {
    correctionId: "p11-chainer-combat-manipulation",
    caseId: "blindv5-44-unusual-zones",
    commanders: ["Chainer, Dementia Master"],
    conflictRequirementId: "required_function:combat_manipulation",
    conflictLinkedSpecField: "requiredFunctions:combat_manipulation",
    frozenPhase5RetrievalSpecification: null,
    overlayStatus: "PENDING_INDEPENDENT_REVIEW",
    proposedCorrection: {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "requiredFunctions",
      removeValue: "combat_manipulation",
      rationale:
        "Chainer, Dementia Master is a nightmare/discard-reanimation engine. Combat manipulation is not a commander-derived retrieval requirement.",
    },
    provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW",
    note: "Overlay only — Phase-5 artifact unchanged until independent adjudication accepts correction.",
  },
  {
    correctionId: "p11-daxos-spell-copying",
    caseId: "blindv5-25-activated-engine",
    commanders: ["Daxos the Returned"],
    conflictRequirementId: "required_function:spell_copying",
    conflictLinkedSpecField: "requiredFunctions:spell_copying",
    frozenPhase5RetrievalSpecification: null,
    overlayStatus: "PENDING_INDEPENDENT_REVIEW",
    proposedCorrection: {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "requiredFunctions",
      removeValue: "spell_copying",
      rationale:
        "Daxos the Returned rewards enchantment casting and experience counters. Spell copying is not present in the commander text or derived direction.",
    },
    provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW",
    note: "Overlay only — Phase-5 artifact unchanged until independent adjudication accepts correction.",
  },
  {
    correctionId: "p11-orvar-spell-copying",
    caseId: "blindv5-51-tokens",
    commanders: ["Orvar, the All-Form"],
    conflictRequirementId: "required_function:spell_copying",
    conflictLinkedSpecField: "requiredFunctions:spell_copying",
    frozenPhase5RetrievalSpecification: null,
    overlayStatus: "PENDING_INDEPENDENT_REVIEW",
    proposedCorrection: {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "requiredFunctions",
      removeValue: "spell_copying",
      rationale:
        "Orvar, the All-Form copies triggered abilities of other permanents. Spell copying is not a commander-derived retrieval requirement.",
    },
    provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW",
    note: "Overlay only — Phase-5 artifact unchanged until independent adjudication accepts correction.",
  },
  {
    correctionId: "p11-zellix-graveyard-setup",
    caseId: "blindv5-16-commander-background",
    commanders: ["Zellix, Sanity Flayer", "Acolyte of Bahamut"],
    conflictRequirementId: "required_function:graveyard_setup",
    conflictLinkedSpecField: "requiredFunctions:graveyard_setup",
    frozenPhase5RetrievalSpecification: null,
    overlayStatus: "PENDING_INDEPENDENT_REVIEW",
    proposedCorrection: {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "requiredFunctions",
      removeValue: "graveyard_setup",
      rationale:
        "Zellix, Sanity Flayer is a mill/discard punishment engine. Graveyard setup as a required function conflicts with milling opponents rather than filling your graveyard.",
    },
    provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW",
    note: "Overlay only — Phase-5 artifact unchanged until independent adjudication accepts correction.",
  },
  {
    correctionId: "p11-nita-graveyard-setup",
    caseId: "blindv5-53-counters",
    commanders: ["Nita, Forum Conciliator"],
    conflictRequirementId: "required_function:graveyard_setup",
    conflictLinkedSpecField: "requiredFunctions:graveyard_setup",
    frozenPhase5RetrievalSpecification: null,
    overlayStatus: "PENDING_INDEPENDENT_REVIEW",
    proposedCorrection: {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "requiredFunctions",
      removeValue: "graveyard_setup",
      rationale:
        "Nita exiles opponents' instant/sorcery cards from graveyards for casting. Generic graveyard_setup (self-mill/fill) does not follow from the commander — opponent graveyard stocking is the relevant axis.",
    },
    provenance: "PHASE6A1_INDEPENDENT_POST_HOC_REVIEW",
    note: "Overlay only — Phase-5 artifact unchanged until independent adjudication accepts correction.",
  },
];

export function applyAcceptedSpecCorrections(
  spec: RetrievalSpecification,
  accepted: RetrievalSpecificationCorrectionOverlayEntryV11[],
): RetrievalSpecification {
  const out = { ...spec };
  for (const entry of accepted.filter((e) => e.overlayStatus === "ACCEPTED")) {
    const { proposedCorrection: pc } = entry;
    const arr = [...(out[pc.field] as string[])];
    if (pc.action === "REMOVE_LINKED_SPEC_FIELD" && pc.removeValue) {
      out[pc.field] = arr.filter((v) => v !== pc.removeValue) as never;
    } else if (pc.action === "REPLACE_LINKED_SPEC_FIELD" && pc.removeValue && pc.replaceWith) {
      out[pc.field] = arr.map((v) => (v === pc.removeValue ? pc.replaceWith! : v)) as never;
    }
  }
  return out;
}
