#!/usr/bin/env npx tsx
/**
 * Implementation-visible semantic closure benchmark seal v5.
 * Does NOT invoke external authority. Consumes pre-published holdout v5 artifacts only.
 * Preserves design v3. Marks holdout prospective v4 COMPROMISED (blinded adj unopened).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { authorDev36FixtureCatalogV4 } from "./run-phase6a1-closure-semantic-fixture-catalog-author-v4";
import { authorDev36SemanticSnapshotsV4 } from "./run-phase6a1-closure-semantic-snapshot-author-v4";
import { authorIndependentAdjudicationV5 } from "./run-phase6a1-closure-independent-adjudication-author-v5";
import { runFullLeakageSuiteV5 } from "./run-phase6a1-closure-semantic-benchmark-leakage-test-v5";

const OUT = resolve("data/milestones/deck-synthesis");
const GENERATED_AT = new Date().toISOString();
const DESIGN_V3_PATH = resolve(OUT, "phase6a1-professor-plan-functional-role-closure-design-v3.json");
const HOLDOUT_V5_MANIFEST = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v5-sealed-manifest-v5.json");
const HOLDOUT_V5_SNAPSHOT_MANIFEST = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v5-semantic-closure-input-v5/manifest.json");
const AUDIT_V4_SRC = "C:/Users/h3art/Downloads/phase6a1-professor-plan-functional-role-closure-v4-preimplementation-reaudit-gpt56sol-v1.json";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, JSON.stringify(value, null, 2));
  return sha256File(path);
}

function requireHoldoutV5PublishPack(): void {
  if (!existsSync(HOLDOUT_V5_MANIFEST) || !existsSync(HOLDOUT_V5_SNAPSHOT_MANIFEST)) {
    throw new Error(
      "Holdout prospective v5 publish pack missing. External authority holder must publish holdout v5 population, snapshots, and sealed manifest before running implementation seal.",
    );
  }
}

function main() {
  if (!readFileSync(DESIGN_V3_PATH, "utf8").includes("DESIGN_V3")) throw new Error("Design v3 missing");
  const designSha = sha256File(DESIGN_V3_PATH);

  requireHoldoutV5PublishPack();

  writeJson(resolve(OUT, "phase6a1-professor-plan-v2-benchmark-disposition-v5.json"), {
    version: "phase6a1-professor-plan-v2-benchmark-disposition-v5",
    recordedAt: GENERATED_AT,
    auditReference: "phase6a1-professor-plan-functional-role-closure-v4-preimplementation-reaudit-gpt56sol-v1.json",
    dev36V2: { status: "SYNTHETIC_UNIT_FIXTURE", notSemanticEvidence: true },
    holdout24V2: { status: "COMPROMISED_BEFORE_USE", doNotOpenBlindedAdjudication: true },
    holdout24V3: { status: "COMPROMISED_BEFORE_USE", doNotOpenBlindedAdjudication: true },
    holdoutProspectiveV4: {
      status: "COMPROMISED_BEFORE_USE",
      doNotOpenBlindedAdjudication: true,
      doNotUseAsSemanticHoldout: true,
      reason: "Source-mismatched commander strategies; implementation seal invoked in-repo authority path.",
    },
    holdoutProspectiveV4BlindedAdjudication: "KEEP_SEALED_DO_NOT_OPEN",
    dev36SemanticV4: { status: "DEVELOPMENT_TEMPLATE_FIXTURE", notGeneralizationEvidence: true },
    holdoutProspectiveV5: {
      status: "PROSPECTIVE_PUBLISH_PACK",
      authorityLocation: "EXTERNAL_TO_WEB_IMPLEMENTATION_TREE",
      implementationReceives: ["population", "runtime snapshots", "sealed manifest with blinded adjudication SHA only"],
      implementationMustNotInvokeAuthority: true,
    },
  });

  const dev36Cases = JSON.parse(readFileSync(resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json"), "utf8")).cases;
  authorDev36FixtureCatalogV4(dev36Cases);
  const devSnapshots = authorDev36SemanticSnapshotsV4();
  const devAdjSha = authorIndependentAdjudicationV5(
    devSnapshots.snapshotDir,
    resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v5.json"),
    devSnapshots.manifestSha256,
    "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v5",
  );

  const leakage = runFullLeakageSuiteV5();
  if (!leakage.pass) throw new Error(`Leakage v5 failed: ${JSON.stringify(leakage.results, null, 2)}`);

  const fixtureCatalogManifestSha = sha256File(resolve(OUT, "phase6a1-professor-plan-semantic-fixture-catalog-v4/dev36-v4-manifest.json"));

  writeJson(resolve(OUT, "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v5.json"), {
    version: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v5",
    sealedAt: GENERATED_AT,
    designArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    designSha256: designSha,
    benchmarkPopulation: "phase6a1-professor-plan-dev36-population-v2.json",
    upstreamFixtureCatalogManifest: "phase6a1-professor-plan-semantic-fixture-catalog-v4/dev36-v4-manifest.json",
    upstreamFixtureCatalogManifestSha256: fixtureCatalogManifestSha,
    semanticClosureInputManifest: "phase6a1-professor-plan-dev36-semantic-closure-input-v4/manifest.json",
    semanticClosureInputManifestSha256: devSnapshots.manifestSha256,
    semanticClosureAdjudication: "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v5.json",
    semanticClosureAdjudicationSha256: devAdjSha,
    adjudicationPolicy: "DEV_TEMPLATE_STRUCTURAL_INFERENCE_V5_NOT_PRODUCTION_CLOSURE",
    leakageTestReport: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v5.json",
    caseCount: 36,
    disposition: "DEVELOPMENT_TEMPLATE_FIXTURE_NOT_GENERALIZATION_EVIDENCE",
    instruction: "WAIT before production closure implementation",
  });

  const holdoutManifest = JSON.parse(readFileSync(HOLDOUT_V5_MANIFEST, "utf8"));

  writeJson(resolve(OUT, "phase6a1-professor-plan-post-gold-development-track-v5.json"), {
    version: "phase6a1-professor-plan-post-gold-development-track-v5",
    updatedAt: GENERATED_AT,
    supersedes: "phase6a1-professor-plan-post-gold-development-track-v4",
    auditDisposition: "BENCHMARK_BLOCK_V4_ADDRESSED_BY_V5_REPAIR",
    authorScripts: {
      fixtureCatalog: "web/scripts/run-phase6a1-closure-semantic-fixture-catalog-author-v4.ts",
      semanticSnapshot: "web/scripts/run-phase6a1-closure-semantic-snapshot-author-v4.ts",
      independentAdjudication: "web/scripts/run-phase6a1-closure-independent-adjudication-author-v5.ts",
      leakageTest: "web/scripts/run-phase6a1-closure-semantic-benchmark-leakage-test-v5.ts",
      sealOrchestrator: "web/scripts/run-phase6a1-closure-semantic-benchmark-seal-v5.ts",
    },
    externalAuthority: {
      location: "EXTERNAL_TO_WEB_IMPLEMENTATION_TREE",
      note: "Holdout scenario/adjudication authoring runs outside web/. Implementation seal consumes publish pack only.",
    },
    supportingLibraries: {
      designMatrix: "web/scripts/lib/phase6a1-closure-design-v3-matrix.ts",
      semanticFixtureTemplates: "web/scripts/lib/phase6a1-semantic-fixture-templates-v4.ts",
      devTemplateInference: "web/scripts/lib/phase6a1-closure-semantic-inference-dev-template-v5.ts",
      commanderOracleFacts: "web/scripts/lib/phase6a1-closure-commander-oracle-facts-v4.ts",
      fixtureBuilder: "web/scripts/lib/phase6a1-semantic-fixture-builder-v4.ts",
      normalize: "web/scripts/lib/phase6a1-closure-semantic-normalize-v4.ts",
      textNeutralize: "web/scripts/lib/phase6a1-semantic-text-neutralize-v5.ts",
    },
    inferenceSeparation: {
      devTemplate: "phase6a1-closure-semantic-inference-dev-template-v5.ts — DEV fixture adjudication only, NOT production closure",
      holdoutAuthority: "External authority-private structural adjudication — NOT in implementation bundle",
      productionClosure: "NOT_IMPLEMENTED",
    },
    v4Preservation: {
      holdoutProspectiveV4: "COMPROMISED_BEFORE_USE_DO_NOT_OPEN_BLINDED_ADJUDICATION",
    },
    semanticBenchmarkV5: {
      dev36: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v5.json",
      holdoutProspective: "phase6a1-professor-plan-holdout-prospective-v5-sealed-manifest-v5.json",
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      corpusIngest: "BLOCKED",
      closureImplementation: "WAIT",
    },
  });

  try {
    writeFileSync(resolve(OUT, "phase6a1-professor-plan-functional-role-closure-v4-preimplementation-reaudit-gpt56sol-v1.json"), readFileSync(AUDIT_V4_SRC));
  } catch { /* optional */ }

  console.log(JSON.stringify({
    decision: "SEALED_WAIT",
    designV3Sha256: designSha,
    dev36SnapshotManifestSha256: devSnapshots.manifestSha256,
    dev36AdjudicationV5Sha256: devAdjSha,
    holdoutProspectiveV5SnapshotManifestSha256: holdoutManifest.semanticClosureInputManifestSha256,
    holdoutProspectiveV5BlindedAdjudicationSha256: holdoutManifest.blindedAdjudicationSha256,
    holdoutProspectiveV4: "COMPROMISED_BEFORE_USE",
    leakageReportPath: leakage.reportPath,
    leakagePass: leakage.pass,
    instruction: "REPORT AND WAIT — no production closure implementation",
  }, null, 2));
}

main();
