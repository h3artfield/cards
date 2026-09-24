#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Full effective-spec Oracle audit across all review cases.
 */
import { mkdirSync, writeFileSync } from "node:fs";
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
import { getCalibrationCaseIds } from "./lib/phase6a-calibration-v2-gold";
import {
  CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION,
  getFullyEffectiveSpec,
  getOverlayForCaseV131,
} from "./lib/phase6a1-contamination-correction-overlay-v1";
import {
  auditEffectiveSpecUniversal,
  collectScalarFields,
  EFFECTIVE_SPEC_ORACLE_AUDIT_V1_VERSION,
  type ContaminationTemplateHit,
} from "./lib/phase6a1-effective-spec-oracle-audit-v1";
import { UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION } from "./lib/phase6a1-upstream-spec-gap-overlay-v1";
import { RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION } from "./lib/phase6a1-spec-correction-overlay-v1.3.1";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const AUDIT_PATH = resolve(OUT_DIR, "phase6a1-effective-spec-oracle-audit-v1.json");
const ALL_CASES = [...ARCHETYPE_DISCOVERY_BENCHMARK_V1, ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  const caseAudits: Array<Record<string, unknown>> = [];
  const allTemplateHits: ContaminationTemplateHit[] = [];

  for (const c of ALL_CASES) {
    if (!reviewCaseIds.has(c.id)) continue;
    const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
    if (!resolution.resolved) continue;

    const discovery = discoverArchetypes(
      { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
      { catalog, shadowIndex, globalCatalogIndex: globalIndex },
    );
    const primary = discovery.buildDirections.find((d) => d.rank === 1);
    if (!primary?.phase6RetrievalReady) continue;

    const frozenSpec = primary.retrievalSpecification;
    const frozenDirection = primary.mechanicalDescription;
    const oracleTexts = resolution.oracleIds.map((id) => ({
      name: catalog.byOracleId.get(id)?.canonicalName ?? id,
      oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
    }));
    const effective = getFullyEffectiveSpec(c.id, frozenSpec, frozenDirection, getOverlayForCaseV131(c.id), oracleTexts);

    const audit = auditEffectiveSpecUniversal({
      caseId: c.id,
      effectiveSpec: effective.spec,
      effectiveMechanicalDirection: effective.effectiveMechanicalDirection,
      oracleTexts,
    });

    allTemplateHits.push(...audit.contaminationTemplates);

    caseAudits.push({
      caseId: c.id,
      commanders: c.commanders,
      auditMethod: audit.auditMethod,
      overlayChain: {
        p11: RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
        upstreamGap: effective.upstreamGapApplied ? UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION : null,
        contamination: effective.contaminationCorrectionApplied ? CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION : null,
      },
      frozenPhase5MechanicalDirection: frozenDirection,
      effectivePhase6MechanicalDirection: effective.effectiveMechanicalDirection,
      commanderOracleTexts: oracleTexts,
      caseClassification: audit.caseClassification,
      confirmedCorrectedSpec: audit.caseClassification === "CONFIRMED_CORRECTED_SPEC",
      remainingIssueCount: audit.remainingIssues.length,
      contaminationTemplateHits: audit.contaminationTemplates,
      effectiveSpec: effective.spec,
      effectiveSpecFieldAudit: audit.fieldAudits,
      remainingIssues: audit.remainingIssues,
      frozenFieldCount: collectScalarFields(frozenSpec).length,
      effectiveFieldCount: collectScalarFields(effective.spec).length,
    });
  }

  const templateFamilyCounts: Record<string, number> = {};
  for (const hit of allTemplateHits) {
    templateFamilyCounts[hit.templateId] = (templateFamilyCounts[hit.templateId] ?? 0) + 1;
  }

  const auditArtifact = {
    version: EFFECTIVE_SPEC_ORACLE_AUDIT_V1_VERSION,
    generatedAt: new Date().toISOString(),
    authorization: {
      full27CaseOracleAudit: "AUTHORIZED / COMPLETE",
      phase5Mutation: "PROHIBITED",
      contaminationOverlayV1: CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION,
    },
    overlayChain: [
      RETRIEVAL_SPEC_CORRECTION_OVERLAY_V1_3_1_VERSION,
      UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION,
      CONTAMINATION_CORRECTION_OVERLAY_V1_VERSION,
    ],
    summary: {
      auditedCaseCount: caseAudits.length,
      confirmedCorrectedSpec: caseAudits.filter((c) => c.confirmedCorrectedSpec).length,
      residualContamination: caseAudits.filter((c) => c.caseClassification === "RESIDUAL_CONTAMINATION").length,
      ambiguousRequiresReview: caseAudits.filter((c) => c.caseClassification === "AMBIGUOUS_REQUIRES_REVIEW").length,
      contaminationTemplateHits: allTemplateHits.length,
      contaminationByTemplateFamily: templateFamilyCounts,
    },
    caseAudits,
    allContaminationTemplateHits: allTemplateHits,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(AUDIT_PATH, JSON.stringify(auditArtifact, null, 2));

  console.log(`Oracle audit: ${AUDIT_PATH}`);
  console.log(`Cases: ${caseAudits.length}`);
  console.log(`Confirmed: ${auditArtifact.summary.confirmedCorrectedSpec}`);
  console.log(`Residual contamination: ${auditArtifact.summary.residualContamination}`);
  console.log(`Template hits: ${JSON.stringify(templateFamilyCounts)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
