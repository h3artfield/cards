#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Systematic contaminated-template audit across evaluation population.
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
  getFullyEffectiveSpec,
  getOverlayForCaseV131,
  CONTAMINATION_CORRECTION_OVERLAY_V1,
} from "./lib/phase6a1-contamination-correction-overlay-v1";
import { getEffectiveSpecAfterUpstreamGap } from "./lib/phase6a1-upstream-spec-gap-overlay-v1";
import {
  detectContaminationTemplates,
  EFFECTIVE_SPEC_ORACLE_AUDIT_V1_VERSION,
} from "./lib/phase6a1-effective-spec-oracle-audit-v1";

loadProjectEnvLocal();

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const OUT_PATH = resolve(OUT_DIR, "phase6a1-contaminated-template-audit-v1.json");
const ALL_CASES = [...ARCHETYPE_DISCOVERY_BENCHMARK_V1, ...ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5];

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const shadowIndex = await loadShadowSemanticIndex();
  const globalIndex = buildGlobalCatalogSemanticIndex({ catalog, shadowIndex });
  const reviewCaseIds = new Set(getCalibrationCaseIds());

  const preCorrectionHits: Array<Record<string, unknown>> = [];
  const postCorrectionHits: Array<Record<string, unknown>> = [];
  const correctedCaseIds = new Set(CONTAMINATION_CORRECTION_OVERLAY_V1.map((e) => e.caseId));

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

    const oracleTexts = resolution.oracleIds.map((id) => ({
      name: catalog.byOracleId.get(id)?.canonicalName ?? id,
      oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
    }));

    const preEffective = getFullyEffectiveSpec(
      c.id,
      primary.retrievalSpecification,
      primary.mechanicalDescription,
      getOverlayForCaseV131(c.id),
    );

    // Pre-contamination: temporarily evaluate upstream+P11 only for cases with contamination overlay
    const preSpec = correctedCaseIds.has(c.id)
      ? getEffectiveSpecAfterUpstreamGap(
          c.id,
          primary.retrievalSpecification,
          primary.mechanicalDescription,
          getOverlayForCaseV131(c.id),
        )
      : preEffective;

    const preHits = detectContaminationTemplates({
      caseId: c.id,
      effectiveSpec: preSpec.spec,
      effectiveMechanicalDirection: preSpec.effectiveMechanicalDirection,
      oracleTexts,
    });
    for (const hit of preHits) {
      preCorrectionHits.push({ ...hit, commanders: c.commanders });
    }

    const postHits = detectContaminationTemplates({
      caseId: c.id,
      effectiveSpec: preEffective.spec,
      effectiveMechanicalDirection: preEffective.effectiveMechanicalDirection,
      oracleTexts,
    });
    for (const hit of postHits) {
      postCorrectionHits.push({ ...hit, commanders: c.commanders });
    }
  }

  const familySummary = (hits: Array<{ templateId: string }>) => {
    const counts: Record<string, number> = {};
    for (const h of hits) counts[h.templateId] = (counts[h.templateId] ?? 0) + 1;
    return counts;
  };

  const artifact = {
    version: `${EFFECTIVE_SPEC_ORACLE_AUDIT_V1_VERSION}-template-report`,
    generatedAt: new Date().toISOString(),
    note: "Population-wide contamination template families — no card-specific exceptions.",
    preContaminationCorrectionOverlay: {
      hitCount: preCorrectionHits.length,
      byTemplateFamily: familySummary(preCorrectionHits),
      hits: preCorrectionHits,
    },
    postContaminationCorrectionOverlay: {
      hitCount: postCorrectionHits.length,
      byTemplateFamily: familySummary(postCorrectionHits),
      hits: postCorrectionHits,
    },
    contaminationOverlayCases: [...correctedCaseIds],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2));

  console.log(`Template audit: ${OUT_PATH}`);
  console.log(`Pre-correction hits: ${preCorrectionHits.length}`);
  console.log(`Post-correction hits: ${postCorrectionHits.length}`);
  console.log(`Pre families: ${JSON.stringify(familySummary(preCorrectionHits))}`);
  console.log(`Post families: ${JSON.stringify(familySummary(postCorrectionHits))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
