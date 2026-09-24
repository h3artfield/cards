/**
 * Phase 6A.1 — Requirement provenance classification for current-surface evaluation.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  CALIBRATION_V2_GOLD,
  defaultFunctionalRequirements,
  type CaseCalibrationGold,
} from "./phase6a-calibration-v2-gold";
import type { FunctionalSemanticRequirement } from "./phase6a-calibration-v2-types";
import { requirementSignature } from "./phase6a1-current-surface-v1";

export const REQUIREMENT_PROVENANCE_V1_VERSION = "phase6a1-requirement-provenance-v1";

export type RequirementProvenanceClass =
  | "ACTIVE_EFFECTIVE_SPEC_REQUIREMENT"
  | "EXTERNAL_GOLD_SENTINEL"
  | "UPSTREAM_SPEC_GAP"
  | "OBSOLETE_REMOVED_REQUIREMENT";

export type RequirementProvenanceRecord = {
  caseId: string;
  requirementId: string;
  description: string;
  linkedSpecFields: string[];
  classification: RequirementProvenanceClass;
  linkedFieldsActiveInEffectiveSpec: string[];
  linkedFieldsMissingFromEffectiveSpec: string[];
  auditRationale: string;
  overlayApplied?: string;
  evaluateOnProductSurface: boolean;
  evaluateOnSentinelSurface: boolean;
};

const OBSOLETE_GOLD_REQUIREMENTS: Record<string, string> = {
  "blindv5-23-triggered-engine|top_of_library_manipulation":
    "P11 established Elsha has no cast-from-top ability; v1.3.1 effective spec is prowess + combat-damage tokens only.",
};

const EXTERNAL_GOLD_SENTINEL_REQUIREMENTS: Record<string, string> = {
  "multi-korvold|sacrifice_outlets_and_fodder":
    "Calibration v2 gold tests sacrifice engine breadth beyond frozen Phase-5 product spec.",
  "partner-thrasios-tymna|card_advantage_engine":
    "Calibration v2 gold tests generic card-advantage staples outside commander-derived product surface.",
  "blindv5-22-broad-composite|composite_value_functions":
    "Calibration v2 gold tests broad composite staples outside commander-derived product surface.",
  "single-graveyard-meren|death_payoff_density":
    "Calibration gold tests death-value density; corrected product surface uses typed recursion/reanimation/death-trigger inputs instead of this gold requirementId.",
};

const UPSTREAM_GAP_GOLD_REQUIREMENTS: Record<string, { rationale: string; overlay: string }> = {
  "single-graveyard-meren|repeatable_creature_recursion": {
    rationale:
      "Meren Oracle contains creature-death experience and end-step creature recursion; frozen spec only had generic graveyard_setup. Confirmed upstream gap — Phase-6 overlay v1 adds recursion/reanimation to effective spec.",
    overlay: "phase6a1-upstream-spec-gap-overlay-v1",
  },
  "single-mill-bruvac|mill_amplification": {
    rationale:
      "Bruvac Oracle doubles opponent milling; frozen spec incorrectly emphasized graveyard_setup/blink_flicker. Confirmed upstream gap — Phase-6 overlay v1 adds mill/opponent_mill_amplification.",
    overlay: "phase6a1-upstream-spec-gap-overlay-v1",
  },
  "blindv5-29-static-restriction|activated_graveyard_to_library_top": {
    rationale:
      "Hua Tuo activated ability puts creature from graveyard on top of library; frozen spec only had generic graveyard_setup. Confirmed upstream gap — Phase-6 overlay v1 adds graveyard_to_library_top.",
    overlay: "phase6a1-upstream-spec-gap-overlay-v1",
  },
};

function pairKey(caseId: string, requirementId: string): string {
  return `${caseId}|${requirementId}`;
}

export function linkedFieldsInSpec(
  linkedSpecFields: string[],
  spec: RetrievalSpecification,
): { active: string[]; missing: string[] } {
  const active: string[] = [];
  const missing: string[] = [];
  for (const field of linkedSpecFields) {
    const [key, value] = field.split(":");
    if (!key || !value) {
      missing.push(field);
      continue;
    }
    const arr = spec[key as keyof RetrievalSpecification];
    if (Array.isArray(arr) && (arr as string[]).includes(value)) {
      active.push(field);
    } else {
      missing.push(field);
    }
  }
  return { active, missing };
}

export function classifyGoldRequirementProvenance(input: {
  caseId: string;
  requirement: FunctionalSemanticRequirement;
  effectiveSpec: RetrievalSpecification;
}): RequirementProvenanceRecord {
  const key = pairKey(input.caseId, input.requirement.requirementId);
  const { active, missing } = linkedFieldsInSpec(input.requirement.linkedSpecFields, input.effectiveSpec);

  if (OBSOLETE_GOLD_REQUIREMENTS[key]) {
    return {
      caseId: input.caseId,
      requirementId: input.requirement.requirementId,
      description: input.requirement.description,
      linkedSpecFields: input.requirement.linkedSpecFields,
      classification: "OBSOLETE_REMOVED_REQUIREMENT",
      linkedFieldsActiveInEffectiveSpec: active,
      linkedFieldsMissingFromEffectiveSpec: missing,
      auditRationale: OBSOLETE_GOLD_REQUIREMENTS[key]!,
      evaluateOnProductSurface: false,
      evaluateOnSentinelSurface: false,
    };
  }

  const external = EXTERNAL_GOLD_SENTINEL_REQUIREMENTS[key];
  if (external) {
    return {
      caseId: input.caseId,
      requirementId: input.requirement.requirementId,
      description: input.requirement.description,
      linkedSpecFields: input.requirement.linkedSpecFields,
      classification: "EXTERNAL_GOLD_SENTINEL",
      linkedFieldsActiveInEffectiveSpec: active,
      linkedFieldsMissingFromEffectiveSpec: missing,
      auditRationale: external,
      evaluateOnProductSurface: false,
      evaluateOnSentinelSurface: true,
    };
  }

  const gap = UPSTREAM_GAP_GOLD_REQUIREMENTS[key];
  if (gap) {
    return {
      caseId: input.caseId,
      requirementId: input.requirement.requirementId,
      description: input.requirement.description,
      linkedSpecFields: input.requirement.linkedSpecFields,
      classification: "UPSTREAM_SPEC_GAP",
      linkedFieldsActiveInEffectiveSpec: active,
      linkedFieldsMissingFromEffectiveSpec: missing,
      auditRationale: gap.rationale,
      overlayApplied: gap.overlay,
      evaluateOnProductSurface: false,
      evaluateOnSentinelSurface: true,
    };
  }

  const allLinked = missing.length === 0 && active.length > 0;
  return {
    caseId: input.caseId,
    requirementId: input.requirement.requirementId,
    description: input.requirement.description,
    linkedSpecFields: input.requirement.linkedSpecFields,
    classification: allLinked ? "ACTIVE_EFFECTIVE_SPEC_REQUIREMENT" : "UPSTREAM_SPEC_GAP",
    linkedFieldsActiveInEffectiveSpec: active,
    linkedFieldsMissingFromEffectiveSpec: missing,
    auditRationale: allLinked
      ? "Gold requirement linked fields are represented in effective Phase-6 spec."
      : "Gold requirement has zero or partial linked-field representation in effective spec — unresolved upstream gap.",
    evaluateOnProductSurface: allLinked,
    evaluateOnSentinelSurface: !allLinked,
  };
}

/** Product-surface requirements derived solely from fully effective Phase-6 spec. */
export function buildProductRequirements(spec: RetrievalSpecification): FunctionalSemanticRequirement[] {
  return defaultFunctionalRequirements(spec);
}

/** Sentinel-surface requirements from calibration v2 gold blocks (diagnostic only). */
export function buildSentinelRequirements(caseId: string): FunctionalSemanticRequirement[] {
  return CALIBRATION_V2_GOLD[caseId]?.functionalSemanticRequirements ?? [];
}

export function auditAllRequirementPairs(input: {
  caseId: string;
  frozenSpec: RetrievalSpecification;
  fullyEffectiveSpec: RetrievalSpecification;
}): RequirementProvenanceRecord[] {
  const gold = CALIBRATION_V2_GOLD[input.caseId];
  if (gold) {
    return gold.functionalSemanticRequirements.map((req) =>
      classifyGoldRequirementProvenance({
        caseId: input.caseId,
        requirement: req,
        effectiveSpec: input.fullyEffectiveSpec,
      }),
    );
  }

  return buildProductRequirements(input.fullyEffectiveSpec).map((req) => ({
    caseId: input.caseId,
    requirementId: req.requirementId,
    description: req.description,
    linkedSpecFields: req.linkedSpecFields,
    classification: "ACTIVE_EFFECTIVE_SPEC_REQUIREMENT" as const,
    linkedFieldsActiveInEffectiveSpec: req.linkedSpecFields,
    linkedFieldsMissingFromEffectiveSpec: [],
    auditRationale: "Derived directly from fully effective Phase-6 retrieval specification.",
    evaluateOnProductSurface: true,
    evaluateOnSentinelSurface: false,
  }));
}

export function buildMateriallyChangedProductRequirementSet(input: {
  frozenSpec: RetrievalSpecification;
  fullyEffectiveSpec: RetrievalSpecification;
}): Set<string> {
  const frozenReqs = buildProductRequirements(input.frozenSpec);
  const effectiveReqs = buildProductRequirements(input.fullyEffectiveSpec);
  return buildMateriallyChangedRequirementSetFromLists(frozenReqs, effectiveReqs);
}

export function buildMateriallyChangedRequirementSetFromLists(
  frozenReqs: FunctionalSemanticRequirement[],
  effectiveReqs: FunctionalSemanticRequirement[],
): Set<string> {
  const frozenSigs = new Map(frozenReqs.map((r) => [r.requirementId, requirementSignature(r)]));
  const changed = new Set<string>();
  for (const req of effectiveReqs) {
    const frozenSig = frozenSigs.get(req.requirementId);
    if (!frozenSig || frozenSig !== requirementSignature(req)) {
      changed.add(req.requirementId);
    }
  }
  for (const req of frozenReqs) {
    if (!effectiveReqs.some((e) => e.requirementId === req.requirementId)) {
      changed.add(req.requirementId);
    }
  }
  return changed;
}

export function summarizeProvenance(records: RequirementProvenanceRecord[]) {
  const byClass: Record<RequirementProvenanceClass, number> = {
    ACTIVE_EFFECTIVE_SPEC_REQUIREMENT: 0,
    EXTERNAL_GOLD_SENTINEL: 0,
    UPSTREAM_SPEC_GAP: 0,
    OBSOLETE_REMOVED_REQUIREMENT: 0,
  };
  for (const r of records) byClass[r.classification] += 1;
  return byClass;
}

export type { CaseCalibrationGold };
