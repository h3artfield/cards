#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 P11 — Residual spec consistency audit v2 (8 overlay cases only).
 * Audits the whole effective Phase-6 specification + effective mechanical direction.
 * Oracle-grounded per-field causal audit — not heuristic defensibility.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import {
  buildGlobalCatalogSemanticIndex,
  discoverArchetypes,
  resolveBenchmarkCommanderOracleIds,
} from "../src/lib/deck-synthesis";
import {
  PHASE6A1_SPEC_CORRECTION_OVERLAY_V131,
  RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
  applySpecCorrectionOverlayV131,
} from "./lib/phase6a1-spec-correction-overlay-v1.3.1";
import {
  auditEffectiveSpecV2,
  collectScalarFields,
  SPEC_FIELD_KEYS,
} from "./lib/phase6a1-p11-residual-spec-audit-rules-v2";

loadProjectEnvLocal();

const OUT_PATH = resolve("data/milestones/deck-synthesis/phase6a1-p11-residual-spec-audit-v2.json");
const OVERLAY_OUT_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-p11-spec-correction-overlay-applied-v1.3.1.json",
);
const ALL_CASES = [...ARCHETYPE_DISCOVERY_BENCHMARK_V1, ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5];

const AUDITED_SPEC_DIMENSIONS = [
  "mechanicalDirection",
  ...SPEC_FIELD_KEYS,
  "selfPenaltyConditions",
];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });

  const caseAudits: Array<Record<string, unknown>> = [];

  for (const overlay of PHASE6A1_SPEC_CORRECTION_OVERLAY_V131) {
    const benchCase = ALL_CASES.find((c) => c.id === overlay.caseId)!;
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, benchCase.commanders);
    if (!resolution.resolved) throw new Error(`Unresolved: ${overlay.caseId}`);

    const report = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: benchCase.bracket },
      { catalog, shadowIndex, globalCatalogIndex: globalIndex },
    );
    const primary = report.buildDirections.find((d) => d.rank === 1)!;
    const frozenSpec = primary.retrievalSpecification;
    const frozenDirection = primary.mechanicalDescription;

    const effective = applySpecCorrectionOverlayV131(frozenSpec, frozenDirection, overlay);

    const oracleTexts = resolution.oracleIds.map((id) => ({
      name: catalog.byOracleId.get(id)?.canonicalName ?? id,
      oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
    }));

    const audit = auditEffectiveSpecV2({
      caseId: overlay.caseId,
      effectiveSpec: effective.spec,
      effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
      oracleTexts,
    });

    const frozenFieldCount = collectScalarFields(frozenSpec).length;
    const effectiveFieldCount = collectScalarFields(effective.spec).length;

    caseAudits.push({
      caseId: overlay.caseId,
      commanders: benchCase.commanders,
      correctionId: overlay.correctionId,
      p11AdjudicationLabel: overlay.independentAdjudicationLabel,
      overlayVersion: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
      overlayStatus: overlay.overlayStatus,
      v12CorrectionsApplied: overlay.corrections,
      v13ResidualCorrectionsApplied: overlay.residualCorrections,
      v131CleanupCorrectionsApplied: overlay.cleanupCorrections,
      effectiveMechanicalDirectionOverride: effective.directionOverride,
      frozenPhase5MechanicalDirection: frozenDirection,
      effectivePhase6MechanicalDirection: effective.effectiveMechanicalDirection,
      commanderOracleTexts: oracleTexts,
      auditedDimensions: AUDITED_SPEC_DIMENSIONS,
      specClassification: {
        caseClassification: audit.caseClassification,
        confirmedCorrectedSpec: audit.caseClassification === "CONFIRMED_CORRECTED_SPEC",
        frozenPhase5FieldCount: frozenFieldCount,
        effectivePhase6FieldCount: effectiveFieldCount,
        remainingIssueCount: audit.remainingIssues.length,
        note:
          "CONFIRMED_CORRECTED_SPEC only when every effective Phase-6 field and direction passes Oracle-grounded audit.",
      },
      effectiveSpec: effective.spec,
      effectiveSpecFieldAudit: audit.fieldAudits,
      remainingIssues: audit.remainingIssues,
    });
  }

  const classificationCounts = {
    CONFIRMED_CORRECTED_SPEC: caseAudits.filter(
      (c) => (c.specClassification as { caseClassification: string }).caseClassification === "CONFIRMED_CORRECTED_SPEC",
    ).length,
    RESIDUAL_CONTAMINATION: caseAudits.filter(
      (c) => (c.specClassification as { caseClassification: string }).caseClassification === "RESIDUAL_CONTAMINATION",
    ).length,
    AMBIGUOUS_REQUIRES_REVIEW: caseAudits.filter(
      (c) =>
        (c.specClassification as { caseClassification: string }).caseClassification === "AMBIGUOUS_REQUIRES_REVIEW",
    ).length,
  };

  const report = {
    version: "phase6a1-p11-residual-spec-audit-v2",
    priorAuditVersion: "phase6a1-p11-residual-spec-audit-v1",
    priorAuditConclusion: "NOT_ACCEPTED — methodology repaired in v2",
    overlayVersion: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
    generatedAt: new Date().toISOString(),
    scope: "8 P11 overlay cases only — whole effective specification audit",
    phase5Artifacts: "FROZEN",
    correctionsMechanism:
      "Phase-6 RetrievalSpecificationCorrection overlay v1.3.1 + effectiveMechanicalDirectionOverride",
    auditMethodology: {
      inspectsWholeEffectiveSpec: true,
      auditedDimensions: AUDITED_SPEC_DIMENSIONS,
      perFieldOutput: ["field", "value", "verdict", "causalDefense", "oracleEvidence"],
      outcomeCategories: ["CONFIRMED_CORRECTED_SPEC", "RESIDUAL_CONTAMINATION", "AMBIGUOUS_REQUIRES_REVIEW"],
      heuristicKeywordDefensibilityAlone: "PROHIBITED",
    },
    authorization: {
      v12Corrections: "KEEP / ACCEPTED",
      residualAuditV1Conclusion: "NOT_ACCEPTED",
      residualAuditMethodologyV2: "AUTHORIZED / COMPLETE",
      overlayV131DesiredFunctionsCleanup: "AUTHORIZED / APPLIED",
      additionalPhase6CorrectionsV13: "AUTHORIZED / APPLIED",
      effectiveMechanicalDirectionOverride: "AUTHORIZED / APPLIED",
      phase5Mutation: "PROHIBITED",
      cleanP14BaselineRerun: classificationCounts.RESIDUAL_CONTAMINATION === 0 ? "AUTHORIZED_IF_NO_HARD_UNSUPPORTED" : "WAIT",
      additionalRetrieverSemanticTuning: "WAIT",
      phase6AFreeze: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
    },
    summary: {
      caseCount: caseAudits.length,
      classificationCounts,
      note: "Before clean P14 baseline, stratify SPEC_VALID / CONFIRMED_CORRECTED_SPEC / UPSTREAM_INVALID_EXCLUDED separately.",
    },
    caseAudits,
  };

  mkdirSync(resolve("data/milestones/deck-synthesis"), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  writeFileSync(
    OVERLAY_OUT_PATH,
    JSON.stringify(
      {
        version: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
        priorVersion: "phase6-retrieval-spec-correction-overlay-v1.3",
        generatedAt: new Date().toISOString(),
        entries: PHASE6A1_SPEC_CORRECTION_OVERLAY_V131,
        note: "v1.3.1 adds desiredFunctions policy cleanup on v1.3. Phase-5 unchanged.",
      },
      null,
      2,
    ),
  );

  console.log(`Residual spec audit v2: ${OUT_PATH}`);
  console.log(`Applied overlay v1.3.1: ${OVERLAY_OUT_PATH}`);
  console.log(`Classification: ${JSON.stringify(classificationCounts)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
