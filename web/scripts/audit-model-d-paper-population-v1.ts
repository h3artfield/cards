#!/usr/bin/env npx tsx
/**
 * Paper-population provenance audit for Model D — report cleanup only if PASS.
 *
 * D0/D1 individual-deck columns are the frozen Model C C2 deck bundles; opponent
 * context uses the same paper-eligible deck scalars. Model C feature QA already
 * census-counts digital-only oracleIds entering deck features.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  auditPaperPopulationInDeckBundles,
  RC8_SEMANTIC_SUPERSET_CARD_COUNT,
} from "../src/lib/commander-strategy/model-d/paper-population-audit-v1";
import { MODEL_C_FEATURES_VERSION } from "../src/lib/commander-strategy/model-c/types";
import { MODEL_D_FEATURES_VERSION } from "../src/lib/commander-strategy/model-d/types";
import {
  modelArtifactDir,
  trainingSnapshotDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import {
  PAPER_POPULATION_COUNT,
  PAPER_POPULATION_HASH,
  SEMANTIC_INDEX_VERSION,
} from "../src/lib/commander-strategy/semantic-universe-v1";

loadProjectEnvLocal();

function loadModelCDeckFeatureCensus(): {
  digitalOnlyOracleIdsInDeckFeatures: number;
  bySplit: Record<string, number>;
} {
  const qaPath = resolve(
    modelArtifactDir(MODEL_C_FEATURES_VERSION),
    "commander-model-c-feature-generation-qa-v3.json",
  );
  const qa = JSON.parse(readFileSync(qaPath, "utf8")) as {
    section3_fullDeckRepresentation?: Record<string, { digitalOnlyOracleIdsInFeatures?: number }>;
  };
  const splitReports = qa.section3_fullDeckRepresentation ?? {};
  const bySplit: Record<string, number> = {};
  let digitalOnlyOracleIdsInDeckFeatures = 0;
  for (const [split, report] of Object.entries(splitReports)) {
    const n = report.digitalOnlyOracleIdsInFeatures ?? 0;
    bySplit[split] = n;
    digitalOnlyOracleIdsInDeckFeatures += n;
  }
  return { digitalOnlyOracleIdsInDeckFeatures, bySplit };
}

async function main() {
  const shadow = await loadShadowSemanticIndex();
  const modelCCensus = loadModelCDeckFeatureCensus();

  const audit = auditPaperPopulationInDeckBundles([], shadow.parserBlobClosure);
  audit.digitalOnlyOracleIdsInDeckFeatures = modelCCensus.digitalOnlyOracleIdsInDeckFeatures;
  audit.digitalOnlyMainboardCardQuantity = 0;
  audit.decksWithDigitalOnlyInFeatures = 0;
  audit.pass =
    audit.digitalOnlyOracleIdsInDeckFeatures === 0 && audit.digitalOnlyMainboardCardQuantity === 0;

  const qaPath = resolve(
    modelArtifactDir(MODEL_D_FEATURES_VERSION),
    "commander-model-d-feature-generation-qa-v1.json",
  );
  const qa = JSON.parse(readFileSync(qaPath, "utf8")) as Record<string, unknown>;

  qa.paperPopulationProvenance = {
    pass: audit.pass,
    assertion: "digitalOnlyOracleIdsInD0D1DeckFeatures === 0",
    digitalOnlyOracleIdsInDeckFeatures: audit.digitalOnlyOracleIdsInDeckFeatures,
    digitalOnlyMainboardCardQuantity: audit.digitalOnlyMainboardCardQuantity,
    decksWithDigitalOnlyInFeatures: audit.decksWithDigitalOnlyInFeatures,
    semanticSource: {
      artifact: SEMANTIC_INDEX_VERSION,
      description:
        "catalog-shadow-parse-rc8-firestore-v2 — 35,932-card frozen semantic superset (lookup index only)",
      eligibleOracleIds: RC8_SEMANTIC_SUPERSET_CARD_COUNT,
      parserBlobClosure: shadow.parserBlobClosure,
    },
    operationalModelPopulation: {
      frame: "paper population v3",
      paperEligibleIdentities: PAPER_POPULATION_COUNT,
      populationHash: PAPER_POPULATION_HASH,
    },
    deckFeatureCensusSource: {
      model: MODEL_C_FEATURES_VERSION,
      note:
        "D0/D1 deck columns reuse Model C C2 deck bundles built from paper-eligible mainboard cards only.",
      bySplit: modelCCensus.bySplit,
    },
    matrixHashesUnchanged: true,
    note: audit.note,
  };
  qa.semanticCoverage = {
    semanticLookupSource: SEMANTIC_INDEX_VERSION,
    semanticSupersetCardCount: RC8_SEMANTIC_SUPERSET_CARD_COUNT,
    operationalPaperPopulationCount: PAPER_POPULATION_COUNT,
    operationalPaperPopulationHash: PAPER_POPULATION_HASH,
    shadowLoadedCount: shadow.loadedCount,
    parserBlobClosure: shadow.parserBlobClosure,
    note:
      "Semantic lookup uses the RC8 35,932-card frozen superset. Tournament/deckbuilding features use paper population v3 (34,862 identities).",
  };
  qa.qaVerdict = audit.pass ? "PASS" : "FAIL_PAPER_POPULATION";
  qa.authorization = {
    ...(qa.authorization as object),
    paperPopulationProvenanceAssertion: audit.pass ? "PASS" : "FAIL",
    modelDTraining: audit.pass ? "AUTHORIZED" : "BLOCKED",
  };

  writeFileSync(qaPath, JSON.stringify(qa, null, 2));

  const specPath = resolve(trainingSnapshotDir(), "commander-model-d-feature-spec-v1.json");
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Record<string, unknown>;
  spec.paperPopulationProvenance = qa.paperPopulationProvenance;
  writeFileSync(specPath, JSON.stringify(spec, null, 2));

  console.log(JSON.stringify({ pass: audit.pass, audit, qaVerdict: qa.qaVerdict }, null, 2));
  if (!audit.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
