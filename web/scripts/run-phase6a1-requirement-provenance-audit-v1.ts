#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Requirement provenance audit for all review case × requirement pairs.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
import { getOverlayForCaseV131 } from "./lib/phase6a1-spec-correction-overlay-v1.3.1";
import { getFullyEffectiveSpec } from "./lib/phase6a1-contamination-correction-overlay-v1";
import { UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION } from "./lib/phase6a1-upstream-spec-gap-overlay-v1";
import {
  auditAllRequirementPairs,
  REQUIREMENT_PROVENANCE_V1_VERSION,
  summarizeProvenance,
  type RequirementProvenanceRecord,
} from "./lib/phase6a1-requirement-provenance-v1";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const AUDIT_PATH = resolve(OUT_DIR, "phase6a1-requirement-provenance-audit-v1.json");
const SUPERSEDED_V1_PATH = resolve(OUT_DIR, "phase6a1-current-surface-delta-blinded-v1.json");

const EVAL_SETS = [
  { setId: "dev_benchmark_v1", cases: ARCHETYPE_DISCOVERY_BENCHMARK_V1 },
  { setId: "blind_holdout_v5", cases: ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 },
];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  const allRecords: RequirementProvenanceRecord[] = [];
  const zeroLinkedResolved: Array<Record<string, unknown>> = [];

  for (const spec of EVAL_SETS) {
    for (const c of spec.cases) {
      if (!reviewCaseIds.has(c.id)) continue;
      const resolution = resolveBenchmarkCommanderOracleIds(catalog, c.commanders);
      if (!resolution.resolved) continue;

      const discovery = discoverArchetypes(
        { commanderOracleIds: resolution.oracleIds, bracket: c.bracket },
        { catalog, shadowIndex, globalCatalogIndex: globalIndex },
      );
      const primary = discovery.buildDirections.find((d) => d.rank === 1);
      if (!primary?.phase6RetrievalReady) continue;

    const oracleTexts = resolution.oracleIds.map((id) => ({
      name: catalog.byOracleId.get(id)?.canonicalName ?? id,
      oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
    }));

    const effective = getFullyEffectiveSpec(
      c.id,
      primary.retrievalSpecification,
      primary.mechanicalDescription,
      getOverlayForCaseV131(c.id),
      oracleTexts,
    );

      const records = auditAllRequirementPairs({
        caseId: c.id,
        frozenSpec: primary.retrievalSpecification,
        fullyEffectiveSpec: effective.spec,
      });
      allRecords.push(...records);

      for (const r of records) {
        if (r.linkedFieldsMissingFromEffectiveSpec.length === r.linkedSpecFields.length && r.linkedSpecFields.length > 0) {
          zeroLinkedResolved.push({
            caseId: r.caseId,
            requirementId: r.requirementId,
            classification: r.classification,
            evaluateOnProductSurface: r.evaluateOnProductSurface,
            overlayApplied: r.overlayApplied ?? (effective.upstreamGapApplied ? UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION : null),
            resolution: r.classification === "OBSOLETE_REMOVED_REQUIREMENT"
              ? "REMOVED_FROM_PRODUCT_SURFACE"
              : r.classification === "UPSTREAM_SPEC_GAP"
                ? "PRODUCT_SURFACE_USES_TYPED_EFFECTIVE_SPEC_REQUIREMENTS"
                : r.classification,
          });
        }
      }
    }
  }

  const byClass = summarizeProvenance(allRecords);
  const obsolete = allRecords.filter((r) => r.classification === "OBSOLETE_REMOVED_REQUIREMENT");
  const upstreamGaps = allRecords.filter((r) => r.classification === "UPSTREAM_SPEC_GAP");
  const externalSentinels = allRecords.filter((r) => r.classification === "EXTERNAL_GOLD_SENTINEL");
  const activeProduct = allRecords.filter((r) => r.evaluateOnProductSurface);

  const audit = {
    version: REQUIREMENT_PROVENANCE_V1_VERSION,
    generatedAt: new Date().toISOString(),
    authorization: {
      requirementProvenanceAudit: "AUTHORIZED / COMPLETE",
      superseded714BlindedArtifact: "SUPERSEDED_PRE_ADJUDICATION",
      independentLabeling714: "DO NOT START",
      regenerateProductCurrentSurface: "AUTHORIZED / REQUIRED",
      phase6A2: "WAIT",
      retrieverTuning: "WAIT",
      phase6AFreeze: "WAIT",
    },
    supersededArtifacts: {
      "phase6a1-current-surface-delta-blinded-v1.json": {
        status: "SUPERSEDED_PRE_ADJUDICATION",
        reason: "Requirement-provenance / effective-spec mismatch — gold requirements entered product Top-20 without active linked fields.",
        structuralBlinding: "PASS",
        semanticEvaluationInput: "FAIL",
        independentLabeling: "DO NOT START",
      },
    },
    overlayChain: {
      p11Overlay: "phase6-retrieval-spec-correction-overlay-v1.3.1",
      upstreamGapOverlay: UPSTREAM_SPEC_GAP_OVERLAY_V1_VERSION,
      upstreamGapCases: ["single-graveyard-meren", "single-mill-bruvac", "blindv5-29-static-restriction"],
    },
    summary: {
      totalCaseRequirementPairs: allRecords.length,
      byClassification: byClass,
      productSurfaceRequirementPairs: activeProduct.length,
      externalSentinelRequirementPairs: externalSentinels.length + upstreamGaps.filter((r) => r.evaluateOnSentinelSurface).length,
      obsoleteRemovedPairs: obsolete.length,
      zeroLinkedFieldGroupsResolved: zeroLinkedResolved,
    },
    obsoleteRemovedRequirements: obsolete,
    upstreamSpecGapRequirements: upstreamGaps,
    externalGoldSentinelRequirements: externalSentinels,
    activeProductRequirements: activeProduct,
    allRecords,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));

  console.log(`Provenance audit: ${AUDIT_PATH}`);
  console.log(`Total pairs: ${allRecords.length}`);
  console.log(`By class: ${JSON.stringify(byClass)}`);
  console.log(`Product surface pairs: ${activeProduct.length}`);
  console.log(`Obsolete removed: ${obsolete.map((r) => `${r.caseId}/${r.requirementId}`).join(", ") || "none"}`);
  if (existsSync(SUPERSEDED_V1_PATH)) {
    console.log(`Note: ${SUPERSEDED_V1_PATH} remains on disk but is SUPERSEDED_PRE_ADJUDICATION.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
