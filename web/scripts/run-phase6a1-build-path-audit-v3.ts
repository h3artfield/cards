#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — BuildPath v3 catalog + audit from frozen independent truth.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BUILD_PATH_TYPES_V3_VERSION } from "../src/lib/deck-synthesis/build-path-types-v3";
import {
  auditCaseBuildPathV3,
  BUILD_PATH_AUDIT_V3_VERSION,
  summarizeBuildPathAuditV3,
} from "./lib/phase6a1-build-path-audit-v3";
import {
  BUILD_PATH_DERIVATION_V3_VERSION,
  deriveAllBuildPathBundlesV3,
} from "./lib/phase6a1-build-path-derivation-v3";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import { getImplementedStrategyCatalog } from "./lib/phase6a1-implemented-strategy-catalog-v1";
import { FROZEN_TRUTH_SHA256 } from "./lib/phase6a1-independent-truth-loader-v1";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const CATALOG_PATH = resolve(OUT_DIR, "phase6a1-build-path-catalog-v3.json");
const AUDIT_PATH = resolve(OUT_DIR, "phase6a1-build-path-audit-v3.json");

function main() {
  const mechanismEntries = getImplementedMechanismCatalog();
  const strategyEntries = getImplementedStrategyCatalog();
  const bundles = deriveAllBuildPathBundlesV3(mechanismEntries, strategyEntries);

  const mechByCase = new Map(mechanismEntries.map((m) => [m.caseId, m]));
  const stratByCase = new Map(strategyEntries.map((s) => [s.caseId, s]));

  const caseAudits = bundles.map((b) =>
    auditCaseBuildPathV3(b, mechByCase.get(b.caseId)!, stratByCase.get(b.caseId)!),
  );

  const population = summarizeBuildPathAuditV3(caseAudits);
  const generatedAt = new Date().toISOString();

  const totalCoreIntents = bundles.reduce(
    (n, b) => n + b.buildPaths.reduce((m, p) => m + p.requiredCandidateIntents.length, 0),
    0,
  );

  const catalog = {
    version: BUILD_PATH_TYPES_V3_VERSION,
    derivationVersion: BUILD_PATH_DERIVATION_V3_VERSION,
    generatedAt,
    pipeline:
      "FROZEN CommanderMechanismFacts → FROZEN correctedThreePathStrategy → BuildPathProposal v3 → PathCandidateIntent v3",
    sourceTruth: {
      mechanismFacts: "phase6a1-commander-mechanism-facts-v4-implemented",
      mechanismFactsSha256: FROZEN_TRUTH_SHA256.mechanismTruth,
      strategyAdjudication: "phase6a1-strategy-adjudication-v1-implemented",
      strategyAdjudicationSha256: FROZEN_TRUTH_SHA256.strategyAdjudication,
    },
    population: {
      expectedCases: 28,
      bundlesGenerated: bundles.length,
      totalBuildPathProposals: bundles.length * 3,
      totalPathCandidateIntents: totalCoreIntents,
    },
    bundles,
  };

  const audit = {
    version: BUILD_PATH_AUDIT_V3_VERSION,
    generatedAt,
    authorization: {
      buildPathV3: "GENERATED — PENDING REVIEW",
      pathConditionedGateB: "WAIT",
      liveRetrieval: "WAIT",
      newBlindCorpus: "WAIT",
      optimizer: "WAIT",
      professor: "WAIT",
      parserV4: "DEVELOPMENTAL / NON-AUTHORITATIVE — continues separately",
      lowPathSeparationMetric: "NOT_PRIMARY — causal identity is primary",
    },
    population,
    highlightedCases: {
      hybridKinnanRouting: caseAudits.find((c) => c.caseId === "hybrid-kinnan")?.routingDetails,
      blindv5_16_zellix: caseAudits.find((c) => c.caseId === "blindv5-16-commander-background"),
      partnerThrasiosTymna: caseAudits.find((c) => c.caseId === "partner-thrasios-tymna")?.partnerBackgroundMemberAttribution,
      shaunRebeccaUnresolved: caseAudits.find((c) => c.caseId === "blindv5-26-activated-engine")?.unresolvedPathsPreserved,
      cyclonusTentative: caseAudits.find((c) => c.caseId === "blindv5-42-resource-conversion")?.unresolvedPathsPreserved,
    },
    cases: caseAudits,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));

  console.log(JSON.stringify(population, null, 2));
  console.log(`\nWrote ${CATALOG_PATH}`);
  console.log(`Wrote ${AUDIT_PATH}`);
}

main();
