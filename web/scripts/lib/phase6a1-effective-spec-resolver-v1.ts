/**
 * Phase 6A.1 — Effective spec resolver: full Phase-6 overlay chain.
 */
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import {
  applyPopulationTemplateCleanup,
  applyContaminationSpecCorrections,
  getContaminationEntry,
} from "./phase6a1-contamination-correction-overlay-v1";
import {
  getEffectiveSpecAfterUpstreamGap,
  type UpstreamSpecGapEntry,
} from "./phase6a1-upstream-spec-gap-overlay-v1";
import {
  getOverlayForCaseV131,
  type EffectiveOverlayResult,
  type RetrievalSpecificationCorrectionOverlayEntryV131,
} from "./phase6a1-spec-correction-overlay-v1.3.1";
import {
  applyOracleGroundedOverlayV2,
  getOracleGroundedOverlayEntry,
  ORACLE_GROUNDED_OVERLAY_V2_VERSION,
} from "./phase6a1-oracle-grounded-overlay-v2";
import {
  applySemanticRoleCorrections,
  SEMANTIC_ROLE_ADJUDICATION_V1_VERSION,
} from "./phase6a1-semantic-role-correction-overlay-v1";
import type { FieldRoleAdjudication } from "./phase6a1-semantic-role-types-v1";

export const EFFECTIVE_SPEC_RESOLVER_V1_VERSION = "phase6a1-effective-spec-resolver-v1";

export type ResolvedEffectiveSpec = EffectiveOverlayResult & {
  upstreamGapApplied: boolean;
  contaminationCorrectionApplied: boolean;
  oracleGroundedOverlayV2Applied: boolean;
  semanticRoleCorrectionApplied: boolean;
  populationTemplateCleanupApplied: boolean;
  overlayChain: string[];
  semanticRoleAdjudications: FieldRoleAdjudication[];
  preSemanticRoleSpec: RetrievalSpecification;
};

export function resolveEffectiveSpec(input: {
  caseId: string;
  frozenSpec: RetrievalSpecification;
  frozenDirection: string;
  oracleTexts: Array<{ name: string; oracleText: string }>;
  p11Entry?: RetrievalSpecificationCorrectionOverlayEntryV131;
}): ResolvedEffectiveSpec {
  const chain: string[] = [];
  const afterGap = getEffectiveSpecAfterUpstreamGap(
    input.caseId,
    input.frozenSpec,
    input.frozenDirection,
    input.p11Entry ?? getOverlayForCaseV131(input.caseId),
  );
  if (input.p11Entry || getOverlayForCaseV131(input.caseId)) chain.push("phase6-retrieval-spec-correction-overlay-v1.3.1");
  if (afterGap.upstreamGapApplied) chain.push("phase6a1-upstream-spec-gap-overlay-v1");

  let spec = afterGap.spec;
  let effectiveMechanicalDirection = afterGap.effectiveMechanicalDirection;
  let directionOverride: EffectiveMechanicalDirectionOverride | null = afterGap.directionOverride;
  let contaminationCorrectionApplied = false;
  let oracleGroundedOverlayV2Applied = false;

  const contamination = getContaminationEntry(input.caseId);
  if (contamination) {
    spec = applyContaminationSpecCorrections(spec, contamination.specCorrections);
    effectiveMechanicalDirection = contamination.effectiveMechanicalDirectionOverride.effectivePhase6Direction;
    directionOverride = contamination.effectiveMechanicalDirectionOverride;
    contaminationCorrectionApplied = true;
    chain.push("phase6a1-contamination-correction-overlay-v1");
  }

  const oracleV2 = getOracleGroundedOverlayEntry(input.caseId);
  if (oracleV2) {
    const applied = applyOracleGroundedOverlayV2(spec, input.frozenDirection, oracleV2);
    spec = applied.spec;
    effectiveMechanicalDirection = applied.effectiveMechanicalDirection;
    directionOverride = oracleV2.effectiveMechanicalDirectionOverride;
    oracleGroundedOverlayV2Applied = true;
    chain.push(ORACLE_GROUNDED_OVERLAY_V2_VERSION);
  }

  let populationTemplateCleanupApplied = false;
  const cleaned = applyPopulationTemplateCleanup({
    caseId: input.caseId,
    spec,
    direction: effectiveMechanicalDirection,
    oracleTexts: input.oracleTexts,
  });
  if (cleaned.templatesRemoved.length > 0) {
    spec = cleaned.spec;
    populationTemplateCleanupApplied = true;
    chain.push("phase6a1-population-template-cleanup");
  }

  const preSemanticRoleSpec = spec;
  const oracleBlob = input.oracleTexts.map((t) => t.oracleText).join("\n").toLowerCase();
  const roleApplied = applySemanticRoleCorrections({
    caseId: input.caseId,
    spec,
    oracleBlob,
  });
  if (roleApplied.semanticRoleCorrectionApplied) {
    spec = roleApplied.spec;
    chain.push(SEMANTIC_ROLE_ADJUDICATION_V1_VERSION);
  }

  return {
    spec,
    effectiveMechanicalDirection,
    originalFrozenMechanicalDirection: input.frozenDirection,
    directionOverride,
    upstreamGapApplied: afterGap.upstreamGapApplied,
    contaminationCorrectionApplied,
    oracleGroundedOverlayV2Applied,
    semanticRoleCorrectionApplied: roleApplied.semanticRoleCorrectionApplied,
    populationTemplateCleanupApplied,
    overlayChain: chain,
    semanticRoleAdjudications: roleApplied.adjudicationsApplied,
    preSemanticRoleSpec,
  };
}

export { getOverlayForCaseV131, type UpstreamSpecGapEntry };
