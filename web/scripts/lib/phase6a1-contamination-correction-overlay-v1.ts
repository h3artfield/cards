/**
 * Phase 6A.1 — Contamination correction overlay v1.
 * Oracle-grounded Phase-6 corrections for population-wide template contamination.
 * Phase-5 artifacts remain frozen.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  detectContaminationTemplates,
  type ContaminationTemplateHit,
} from "./phase6a1-effective-spec-oracle-audit-v1";
import {
  getEffectiveSpecAfterUpstreamGap,
  type UpstreamSpecGapEntry,
} from "./phase6a1-upstream-spec-gap-overlay-v1";
import {
  applySpecCorrectionOverlayV131,
  getEffectiveSpecForCase as getEffectiveSpecV131,
  getOverlayForCaseV131,
  type EffectiveOverlayResult,
  type ProposedSpecCorrectionV13,
  type RetrievalSpecificationCorrectionOverlayEntryV131,
} from "./phase6a1-spec-correction-overlay-v1.3.1";
import {
  applyOracleGroundedOverlayV2,
  getOracleGroundedOverlayEntry,
} from "./phase6a1-oracle-grounded-overlay-v2";

export const CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION = "phase6a1-contamination-correction-overlay-v1";

const PROVENANCE = "PHASE6A1_POPULATION_ORACLE_AUDIT_AUTHORIZED";

export type ContaminationCorrectionEntry = {
  caseId: string;
  commanders: string[];
  contaminationTemplates: string[];
  specCorrections: ProposedSpecCorrectionV13[];
  effectiveMechanicalDirectionOverride: EffectiveMechanicalDirectionOverride;
};

export const CONTAMINATION_CORRECTION_OVERLAY_V1: ContaminationCorrectionEntry[] = [
  {
    caseId: "blindv5-22-broad-composite",
    commanders: ["Curie, Emergent Intelligence"],
    contaminationTemplates: [
      "MANA_GENERATION_DRAW_ENGINE_DIRECTION",
      "GENERIC_RAMP_WITHOUT_ORACLE",
      "GENERIC_MANA_PRODUCTION_WITHOUT_ORACLE",
      "GENERIC_LIFE_LOSS_WITHOUT_ORACLE",
    ],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "ramp", rationale: "Curie Oracle has no mana production." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "desiredFunctions", removeValue: "mana_generation", rationale: "Not commander-derived." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "desiredFunctions", removeValue: "life_loss", rationale: "Not commander-derived." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "resourcesToProduce", removeValue: "mana", rationale: "Curie does not produce mana." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "card_draw", rationale: "Replace with typed combat-damage draw engine." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "removal", rationale: "Replace with exile-copy engine." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "combat_payoff", rationale: "Combat damage to player draws equal to power." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "combat_damage_to_player", rationale: "Draw trigger on combat damage to player." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "exiled_nontoken_artifact_creature", rationale: "Exile trigger — Curie becomes copy; deck supplies copy targets." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:MANA_GENERATION → DRAW_ENGINE",
      effectivePhase6Direction:
        "COMPOSITE: combat_damage_to_player → CARD_DRAW + exiled_nontoken_artifact_creature → COPY_CREATURE",
      correctionReason: "Curie draws on combat damage and copies exiled artifact creatures — not mana generation.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "yuriko-ninja",
    commanders: ["Yuriko, the Tiger's Shadow"],
    contaminationTemplates: [
      "MANA_GENERATION_DRAW_ENGINE_DIRECTION",
      "GENERIC_RAMP_WITHOUT_ORACLE",
      "GENERIC_MANA_PRODUCTION_WITHOUT_ORACLE",
    ],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "ramp", rationale: "Yuriko Oracle has no mana production." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "desiredFunctions", removeValue: "mana_generation", rationale: "Not commander-derived." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "resourcesToProduce", removeValue: "mana", rationale: "No mana production in Oracle." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "card_draw", rationale: "Replace with ninjutsu top-reveal engine." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "combat_payoff", rationale: "Ninja combat damage triggers reveal/hand/life loss." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "ninjutsu_combat_damage", rationale: "Unblocked attacker / ninjutsu damage triggers top reveal." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "outputsToExploit", addValue: "top_of_library", rationale: "Reveal top of library on ninja damage." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:MANA_GENERATION → DRAW_ENGINE",
      effectivePhase6Direction:
        "COMPOSITE: ninjutsu_combat_damage → reveal_top_card + put_into_hand + opponent_life_loss_by_mana_value",
      correctionReason: "Yuriko engine is ninja combat damage → top reveal/hand/life loss, not mana generation.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "multi-korvold",
    commanders: ["Korvold, Fae-Cursed King"],
    contaminationTemplates: [
      "ETB_TRIGGER_DRAW_ENGINE_DIRECTION",
      "ETB_PERMANENTS_WITHOUT_ORACLE",
      "COMBAT_MANIPULATION_WITHOUT_ORACLE",
    ],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "combat_manipulation", rationale: "Not in Korvold Oracle." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredInputs", removeValue: "etb_permanents", rationale: "Korvold engine is sacrifice, not ETB." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "card_draw", rationale: "Replace with sacrifice-triggered draw." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "sacrifice_outlet", rationale: "Deck needs ways to sacrifice for Korvold triggers." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredFunctions", addValue: "sacrifice_payoff", rationale: "Sacrifice triggers counters and draw on Korvold." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "permanent_sacrificed", rationale: "Whenever you sacrifice a permanent." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "outputsToExploit", addValue: "card_draw", rationale: "Draw a card on sacrifice." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "resourcesToConsume", addValue: "sacrifice_fodder", rationale: "Permanents to sacrifice for value." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "ETB_TRIGGER → DRAW_ENGINE",
      effectivePhase6Direction: "COMPOSITE: permanent_sacrificed → PLUS_ONE_PLUS_ONE_COUNTERS + CARD_DRAW",
      correctionReason: "Whenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
  {
    caseId: "blindv5-47-artifacts",
    commanders: ["Kain, Traitorous Dragoon"],
    contaminationTemplates: ["MANA_GENERATION_DRAW_ENGINE_DIRECTION", "GENERIC_RAMP_WITHOUT_ORACLE", "GENERIC_MANA_PRODUCTION_WITHOUT_ORACLE"],
    specCorrections: [
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "requiredFunctions", removeValue: "ramp", rationale: "Kain Oracle has no mana production." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "desiredFunctions", removeValue: "mana_generation", rationale: "Not commander-derived." },
      { action: "REMOVE_LINKED_SPEC_FIELD", field: "resourcesToProduce", removeValue: "mana", rationale: "Treasure tokens are output, not commander mana production." },
      { action: "ADD_LINKED_SPEC_FIELD", field: "requiredInputs", addValue: "combat_damage_to_player", rationale: "Combat damage triggers draw/treasure/life loss chain." },
    ],
    effectiveMechanicalDirectionOverride: {
      originalFrozenDirection: "EVENT_TRIGGER:MANA_GENERATION → DRAW_ENGINE",
      effectivePhase6Direction:
        "COMPOSITE: combat_damage_to_player → CARD_DRAW + TREASURE_TOKENS + controller_life_loss",
      correctionReason: "Kain combat damage gives opponent control; you draw, create Treasures, lose life.",
      independentAdjudicationProvenance: PROVENANCE,
    },
  },
];

export function applyContaminationSpecCorrections(
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

export function getContaminationEntry(caseId: string): ContaminationCorrectionEntry | undefined {
  return CONTAMINATION_CORRECTION_OVERLAY_V1.find((e) => e.caseId === caseId);
}

function templateHitToCorrection(hit: ContaminationTemplateHit): ProposedSpecCorrectionV13 | null {
  if (hit.field === "mechanicalDirection") return null;
  return {
    action: "REMOVE_LINKED_SPEC_FIELD",
    field: hit.field as keyof RetrievalSpecification,
    removeValue: hit.value,
    rationale: `Population template cleanup: ${hit.templateId}`,
  };
}

export function applyPopulationTemplateCleanup(input: {
  caseId: string;
  spec: RetrievalSpecification;
  direction: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
}): {
  spec: RetrievalSpecification;
  direction: string;
  templatesRemoved: ContaminationTemplateHit[];
} {
  let spec = input.spec;
  let direction = input.direction;
  const allRemoved: ContaminationTemplateHit[] = [];

  for (let pass = 0; pass < 4; pass++) {
    const hits = detectContaminationTemplates({
      caseId: input.caseId,
      effectiveSpec: spec,
      effectiveMechanicalDirection: direction,
      oracleTexts: input.oracleTexts,
    }).filter((h) => h.field !== "mechanicalDirection");

    if (!hits.length) break;

    const corrections = hits.map(templateHitToCorrection).filter(Boolean) as ProposedSpecCorrectionV13[];
    if (!corrections.length) break;

    spec = applyContaminationSpecCorrections(spec, corrections);
    allRemoved.push(...hits);
  }

  return { spec, direction, templatesRemoved: allRemoved };
}

/** Full effective spec: P11 v1.3.1 → upstream gap v1 → explicit contamination → population template cleanup. */
export function getFullyEffectiveSpec(
  caseId: string,
  frozenSpec: RetrievalSpecification,
  frozenDirection: string,
  p11Entry?: RetrievalSpecificationCorrectionOverlayEntryV131,
  oracleTexts?: Array<{ name: string; oracleText: string }>,
): EffectiveOverlayResult & {
  upstreamGapApplied: boolean;
  contaminationCorrectionApplied: boolean;
  oracleGroundedOverlayV2Applied: boolean;
  populationTemplateCleanupApplied: boolean;
  populationTemplatesRemoved: ContaminationTemplateHit[];
} {
  const afterGap = getEffectiveSpecAfterUpstreamGap(caseId, frozenSpec, frozenDirection, p11Entry);
  const contamination = getContaminationEntry(caseId);

  let spec = afterGap.spec;
  let effectiveMechanicalDirection = afterGap.effectiveMechanicalDirection;
  let directionOverride = afterGap.directionOverride;
  let contaminationCorrectionApplied = false;

  if (contamination) {
    spec = applyContaminationSpecCorrections(spec, contamination.specCorrections);
    effectiveMechanicalDirection = contamination.effectiveMechanicalDirectionOverride.effectivePhase6Direction;
    directionOverride = contamination.effectiveMechanicalDirectionOverride;
    contaminationCorrectionApplied = true;
  }

  let populationTemplateCleanupApplied = false;
  let populationTemplatesRemoved: ContaminationTemplateHit[] = [];
  let oracleGroundedOverlayV2Applied = false;

  const oracleV2 = getOracleGroundedOverlayEntry(caseId);
  if (oracleV2) {
    const applied = applyOracleGroundedOverlayV2(spec, frozenDirection, oracleV2);
    spec = applied.spec;
    effectiveMechanicalDirection = applied.effectiveMechanicalDirection;
    directionOverride = oracleV2.effectiveMechanicalDirectionOverride;
    oracleGroundedOverlayV2Applied = true;
  }

  if (oracleTexts?.length) {
    const cleaned = applyPopulationTemplateCleanup({
      caseId,
      spec,
      direction: effectiveMechanicalDirection,
      oracleTexts,
    });
    if (cleaned.templatesRemoved.length > 0) {
      spec = cleaned.spec;
      populationTemplateCleanupApplied = true;
      populationTemplatesRemoved = cleaned.templatesRemoved;
    }
  }

  return {
    spec,
    effectiveMechanicalDirection,
    originalFrozenMechanicalDirection: frozenDirection,
    directionOverride,
    upstreamGapApplied: afterGap.upstreamGapApplied,
    contaminationCorrectionApplied,
    oracleGroundedOverlayV2Applied,
    populationTemplateCleanupApplied,
    populationTemplatesRemoved,
  };
}

export { getEffectiveSpecV131, getOverlayForCaseV131, type UpstreamSpecGapEntry };
