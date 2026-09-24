/**
 * Phase 6A.1 — Upstream spec-gap overlay v1.
 * Phase-6 corrections for commander-oracle vs frozen Phase-5 spec gaps (not P11 overlay cases).
 * Phase-5 artifacts remain frozen.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  applySpecCorrectionOverlayV131,
  getEffectiveSpecForCase as getEffectiveSpecV131,
  type EffectiveOverlayResult,
  type ProposedSpecCorrectionV13,
  type RetrievalSpecificationCorrectionOverlayEntryV131,
} from "./phase6a1-spec-correction-overlay-v1.3.1";
import {
  type EffectiveMechanicalDirectionOverride,
  type ProposedSpecCorrectionV13 as Correction,
} from "./phase6a1-spec-correction-overlay-v1.3";

export const UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION = "phase6a1-upstream-spec-gap-overlay-v1";

const GAP_PROVENANCE = "PHASE6A1_UPSTREAM_SPEC_GAP_AUDIT_AUTHORIZED";

export type UpstreamSpecGapEntry = {
  caseId: string;
  commanders: string[];
  gapAuditConclusion: string;
  specCorrections: Correction[];
  effectiveMechanicalDirectionOverride: EffectiveMechanicalDirectionOverride;
};

export const UPSTREAM_SPEC_GAP_OVERLAY_V1: UpstreamSpecGapEntry[] = [
  {
    caseId: "single-graveyard-meren",
    commanders: ["Meren of Clan Nel Toth"],
    gapAuditConclusion:
      "Meren Oracle contains creature-death experience and end-step creature recursion from graveyard. Frozen spec only had generic graveyard_setup — confirmed UPSTREAM_SPEC_GAP.",
    specCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "graveyard_setup",
        rationale: "Replace generic graveyard_setup with typed recursion/death engines.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "graveyard_permanents",
        rationale: "Generic graveyard permanents superseded by typed creature-dies and recursion inputs.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        addValue: "recursion",
        rationale: "Meren returns creature cards from graveyard at end step.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        addValue: "reanimation",
        rationale: "Return creature card from graveyard to battlefield is reanimation.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        addValue: "creature_dies_controller_controls",
        rationale: "Experience counters gained when controller's creatures die.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "outputsToExploit",
        addValue: "death_triggers",
        rationale: "Death-trigger density supports Meren experience engine.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "ZONE_DEPENDENCY:GRAVEYARD → graveyard_setup",
      effectivePhase6Direction:
        "COMPOSITE: creature_dies → EXPERIENCE_COUNTER + end_step_creature_recursion_from_graveyard",
      correctionReason: "Meren doubles down on creature deaths and recurs creatures from own graveyard.",
      independentAdjudicationProvenance: GAP_PROVENANCE,
    },
  },
  {
    caseId: "single-mill-bruvac",
    commanders: ["Bruvac the Grandiloquent"],
    gapAuditConclusion:
      "Bruvac Oracle doubles opponent milling. Frozen spec incorrectly emphasized graveyard_setup and blink_flicker — confirmed UPSTREAM_SPEC_GAP.",
    specCorrections: [
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "graveyard_setup",
        rationale: "Not commander-derived for Bruvac mill multiplier.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        removeValue: "blink_flicker",
        rationale: "Blink/flicker absent from Bruvac Oracle text.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "graveyard_permanents",
        rationale: "Generic graveyard input not commander-derived.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "etb_permanents",
        rationale: "ETB input not commander-derived.",
      },
      {
        action: "REMOVE_LINKED_SPEC_FIELD",
        field: "desiredFunctions",
        removeValue: "combat_payoff",
        rationale: "Combat payoff absent from Bruvac Oracle text.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        addValue: "mill",
        rationale: "Bruvac doubles opponent mill events.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        addValue: "opponent_mill_amplification",
        rationale: "Typed requirement: opponent mills twice instead.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "ZONE_DEPENDENCY:GRAVEYARD → graveyard_setup",
      effectivePhase6Direction: "STATE_MODIFIER: opponent_mill_doubled → mill_amplification",
      correctionReason: "If an opponent would mill, they mill twice that many instead.",
      independentAdjudicationProvenance: GAP_PROVENANCE,
    },
  },
  {
    caseId: "blindv5-29-static-restriction",
    commanders: ["Hua Tuo, Honored Physician"],
    gapAuditConclusion:
      "Hua Tuo activated ability puts creature card from graveyard on top of library. Frozen spec only had generic graveyard_setup — confirmed UPSTREAM_SPEC_GAP.",
    specCorrections: [
      {
        action: "REPLACE_LINKED_SPEC_FIELD",
        field: "requiredInputs",
        removeValue: "graveyard_permanents",
        replaceWith: "creature_card_in_graveyard",
        rationale: "Activated ability targets creature card in graveyard.",
      },
      {
        action: "ADD_LINKED_SPEC_FIELD",
        field: "requiredFunctions",
        addValue: "graveyard_to_library_top",
        rationale: "Typed activated ability: graveyard creature → top of library.",
      },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "ZONE_DEPENDENCY:GRAVEYARD → graveyard_setup",
      effectivePhase6Direction:
        "ACTIVATED_ACTION: creature_card_in_graveyard → put_on_top_of_library",
      correctionReason: "{T}: Put target creature card from your graveyard on top of your library.",
      independentAdjudicationProvenance: GAP_PROVENANCE,
    },
  },
];

function applyCorrections(spec: RetrievalSpecification, corrections: Correction[]): RetrievalSpecification {
  let out = spec;
  for (const pc of corrections) {
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
  return out;
}

export function getUpstreamGapEntry(caseId: string): UpstreamSpecGapEntry | undefined {
  return UPSTREAM_SPEC_GAP_OVERLAY_V1.find((e) => e.caseId === caseId);
}

/** Phase-5 frozen → P11 v1.3.1 → upstream gap overlay v1. Use contamination overlay for full chain. */
export function getEffectiveSpecAfterUpstreamGap(
  caseId: string,
  frozenSpec: RetrievalSpecification,
  frozenDirection: string,
  p11Entry?: RetrievalSpecificationCorrectionOverlayEntryV131,
): EffectiveOverlayResult & { upstreamGapApplied: boolean } {
  const afterP11 = p11Entry
    ? applySpecCorrectionOverlayV131(frozenSpec, frozenDirection, p11Entry)
    : getEffectiveSpecV131(caseId, frozenSpec, frozenDirection);

  const gap = getUpstreamGapEntry(caseId);
  if (!gap) {
    return { ...afterP11, upstreamGapApplied: false };
  }

  return {
    spec: applyCorrections(afterP11.spec, gap.specCorrections),
    effectiveMechanicalDirection: gap.effectiveMechanicalDirectionOverride.effectivePhase6Direction,
    originalFrozenMechanicalDirection: frozenDirection,
    directionOverride: gap.effectiveMechanicalDirectionOverride,
    upstreamGapApplied: true,
  };
}

export { type ProposedSpecCorrectionV13 };
