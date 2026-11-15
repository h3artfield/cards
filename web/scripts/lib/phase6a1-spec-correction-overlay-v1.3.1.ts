/**
 * Phase 6A.1 P11 — RetrievalSpecificationCorrection overlay v1.3.1.
 * Narrow desiredFunctions cleanup on top of accepted v1.3.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  PHASE6A1_SPEC_CORRECTION_OVERLAY_V13,
  type EffectiveMechanicalDirectionOverride,
  type ProposedSpecCorrectionV13,
  type RetrievalSpecificationCorrectionOverlayEntryV13,
  applySpecCorrectionOverlayV13 as applyV13Base,
  type EffectiveOverlayResult,
} from "./phase6a1-spec-correction-overlay-v1.3";

export const RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION =
  "phase6-retrieval-spec-correction-overlay-v1.3.1";

const CLEANUP_PROVENANCE = "PHASE6A1_P11_V131_DESIRED_FUNCTIONS_CLEANUP";

export type RetrievalSpecificationCorrectionOverlayEntryV131 = RetrievalSpecificationCorrectionOverlayEntryV13 & {
  cleanupCorrections: ProposedSpecCorrectionV13[];
};

const CLEANUP_BY_CASE: Record<string, ProposedSpecCorrectionV13[]> = {
  "blindv5-23-triggered-engine": [
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "requiredFunctions",
      removeValue: "ramp",
      rationale: "Generic ramp is not commander-derived for Elsha prowess/token engine.",
    },
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "resourcesToProduce",
      removeValue: "mana",
      rationale: "No mana production in Elsha Oracle text.",
    },
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "mana_generation",
      rationale: "Generic mana_generation lacks causal link to Elsha mechanics.",
    },
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "life_loss",
      rationale: "Generic life_loss lacks causal link to Elsha mechanics.",
    },
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "card_draw",
      rationale: "Generic card_draw lacks causal link to Elsha mechanics.",
    },
  ],
  "blindv5-44-unusual-zones": [
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "combat_payoff",
      rationale: "Combat payoff is not commander-derived for Chainer reanimation engine.",
    },
    {
      action: "REPLACE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "mill",
      replaceWith: "creature_graveyard_setup",
      rationale: "Typed indirect support: stock creature cards in graveyard for Chainer reanimation.",
    },
  ],
  "blindv5-25-activated-engine": [
    {
      action: "REPLACE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "card_draw",
      replaceWith: "enchantment_card_advantage",
      rationale: "Typed indirect support: enchantress-style draw from enchantment casting/resolution.",
    },
  ],
  "blindv5-51-tokens": [
    {
      action: "REPLACE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "card_draw",
      replaceWith: "targeted_cantrip",
      rationale: "Typed indirect support: inst/sorc targeting own permanent triggers Orvar and replaces/draws.",
    },
  ],
  "blindv5-53-counters": [
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "card_draw",
      rationale: "Generic card_draw lacks commander-derived causal link for Nita.",
    },
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "sacrifice_payoff",
      rationale: "Sacrifice is a cost on Nita, not generic sacrifice-payoff support.",
    },
    {
      action: "REMOVE_LINKED_SPEC_FIELD",
      field: "desiredFunctions",
      removeValue: "mill",
      rationale: "Typed opponent_graveyard_instant_sorcery_availability supersedes generic mill.",
    },
  ],
};

export const PHASE6A1_SPEC_CORRECTION_OVERLAY_V131: RetrievalSpecificationCorrectionOverlayEntryV131[] =
  PHASE6A1_SPEC_CORRECTION_OVERLAY_V13.map((entry) => ({
    ...entry,
    cleanupCorrections: CLEANUP_BY_CASE[entry.caseId] ?? [],
    note: `${entry.note} v1.3.1 desiredFunctions policy cleanup applied where authorized.`,
  }));

export const P11_OVERLAY_CASE_IDS = PHASE6A1_SPEC_CORRECTION_OVERLAY_V131.map((e) => e.caseId);

function applyCorrections(
  spec: RetrievalSpecification,
  corrections: ProposedSpecCorrectionV13[],
): RetrievalSpecification {
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

export function applySpecCorrectionOverlayV131(
  spec: RetrievalSpecification,
  frozenMechanicalDirection: string,
  entry: RetrievalSpecificationCorrectionOverlayEntryV131,
): EffectiveOverlayResult {
  const base = applyV13Base(spec, frozenMechanicalDirection, entry);
  if (entry.cleanupCorrections.length === 0) return base;
  return {
    ...base,
    spec: applyCorrections(base.spec, entry.cleanupCorrections),
  };
}

export function getOverlayForCaseV131(caseId: string): RetrievalSpecificationCorrectionOverlayEntryV131 | undefined {
  return PHASE6A1_SPEC_CORRECTION_OVERLAY_V131.find((e) => e.caseId === caseId);
}

export function getEffectiveSpecForCase(
  caseId: string,
  frozenSpec: RetrievalSpecification,
  frozenDirection: string,
): EffectiveOverlayResult {
  const entry = getOverlayForCaseV131(caseId);
  if (!entry) {
    return {
      spec: frozenSpec,
      effectiveMechanicalDirection: frozenDirection,
      originalFrozenMechanicalDirection: frozenDirection,
      directionOverride: null,
    };
  }
  return applySpecCorrectionOverlayV131(frozenSpec, frozenDirection, entry);
}

export {
  type EffectiveMechanicalDirectionOverride,
  type EffectiveOverlayResult,
  type ProposedSpecCorrectionV13,
};
