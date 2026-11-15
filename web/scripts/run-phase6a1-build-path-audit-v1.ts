#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — BuildPath audit (28 cases × 3 paths).
 * Does NOT run Gate B reconciliation or generate blind corpus.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCalibrationCaseIds } from "./lib/phase6a-calibration-v2-gold";
import {
  BUILD_PATH_GENERATOR_V1_VERSION,
  countPathCandidateIntents,
  generateAllBuildPathBundles,
} from "./lib/phase6a1-build-path-generator-v1";
import { getAllCandidateIntentProfiles } from "./lib/phase6a1-candidate-intent-adjudication-v1";
import { BUILD_PATH_TYPES_V1_VERSION } from "../src/lib/deck-synthesis/build-path-types-v1";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const CATALOG_PATH = resolve(OUT_DIR, "phase6a1-build-path-catalog-v1.json");
const AUDIT_PATH = resolve(OUT_DIR, "phase6a1-build-path-audit-v1.json");

function main() {
  const reviewCaseIds = getCalibrationCaseIds();
  const bundles = generateAllBuildPathBundles(reviewCaseIds);
  const generatedAt = new Date().toISOString();

  const pathIntentCounts = bundles.map((b) => ({
    caseId: b.caseId,
    commanders: b.commanders,
    commandZoneConfiguration: b.commandZoneConfiguration,
    pathIntentCount: countPathCandidateIntents(b),
    corePerPath: b.buildPaths.map((p) => p.requiredCandidateIntents.length),
    separationWarnings: b.buildPaths[0]?.pathSeparationWarnings ?? [],
  }));

  const formerNoCore = ["multi-kenrith", "stax-augustin", "blindv5-26-activated-engine", "blindv5-42-resource-conversion"];
  const formerNoCoreStatus = formerNoCore.map((caseId) => {
    const bundle = bundles.find((b) => b.caseId === caseId);
    return {
      caseId,
      threePathsGenerated: Boolean(bundle && bundle.buildPaths.length === 3),
      totalPathIntents: bundle ? countPathCandidateIntents(bundle) : 0,
      coreIntentsPerPath: bundle?.buildPaths.map((p) => p.requiredCandidateIntents.length) ?? [],
    };
  });

  const lowSeparationCases = pathIntentCounts.filter((c) => c.separationWarnings.length > 0).map((c) => c.caseId);

  const totalPathIntents = bundles.reduce((n, b) => n + countPathCandidateIntents(b), 0);
  const totalCorePathIntents = bundles.reduce(
    (n, b) => n + b.buildPaths.reduce((m, p) => m + p.requiredCandidateIntents.length, 0),
    0,
  );

  const catalog = {
    version: BUILD_PATH_TYPES_V1_VERSION,
    generatorVersion: BUILD_PATH_GENERATOR_V1_VERSION,
    generatedAt,
    pipeline: "Oracle → CommanderMechanism → BuildPathProposal → PathCandidateIntent → Retrieval → DeckBuildGraph",
    populationCaseCount: bundles.length,
    pathsPerCommandZone: 3,
    bundles,
  };

  const audit = {
    version: "phase6a1-build-path-audit-v1",
    generatedAt,
    pipeline: {
      superseded: "Oracle → CommanderMechanism → global CandidateIntent → Retrieval",
      current: "Oracle → CommanderMechanism → BuildPathProposal → PathCandidateIntent → Retrieval → DeckBuildGraph",
    },
    population: {
      expectedCases: reviewCaseIds.length,
      bundlesGenerated: bundles.length,
      pathsPerCase: 3,
      totalBuildPathProposals: bundles.length * 3,
      totalPathCandidateIntents: totalPathIntents,
      totalCorePathCandidateIntents: totalCorePathIntents,
      foundationProfiles: getAllCandidateIntentProfiles().length,
      formerGlobalCoreIntents: 41,
    },
    formerNoCoreCases: formerNoCoreStatus,
    pathSeparation: {
      lowSeparationCaseCount: lowSeparationCases.length,
      lowSeparationCases,
    },
    perCase: pathIntentCounts,
    gateStatus: {
      globalGateBRepair: "PAUSE — do not propagate 41 global CORE intents",
      pathGateB: "WAIT — reconcile after BuildPath catalog accepted",
      candidateCorpus: "WAIT",
      candidateAdjudication: "WAIT",
    },
    authorization: {
      foundationCandidateIntent: "ACCEPTED AS FOUNDATION",
      global41CoreIntents: "DEVELOPMENTAL / DO NOT BLIND-EVALUATE",
      buildPathProposalLayer: "GENERATED — PENDING REVIEW",
      threePathClasses: "FROZEN PRODUCT REQUIREMENT",
      pathCandidateIntent: "GENERATED — PENDING REVIEW",
      deckbuildRoute: "AUTHORIZED — UI SHELL",
      deckBuildGraph: "AUTHORIZED — FIXTURE",
      newBlindCorpus: "WAIT",
      professor: "WAIT",
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));

  console.log(JSON.stringify(audit, null, 2));
  console.log(`\nWrote ${CATALOG_PATH}`);
  console.log(`Wrote ${AUDIT_PATH}`);
}

main();
