#!/usr/bin/env npx tsx
/** Implementation-visible semantic closure benchmark seal v8. Does NOT invoke external authority. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { authorDev36FixtureCatalogV8 } from "./run-phase6a1-closure-semantic-fixture-catalog-author-v8";
import { authorSemanticSnapshotsV8 } from "./run-phase6a1-closure-semantic-snapshot-author-v8";
import { authorIndependentAdjudicationV8 } from "./run-phase6a1-closure-independent-adjudication-author-v8";
import { runFullLeakageSuiteV8 } from "./run-phase6a1-closure-semantic-benchmark-leakage-test-v8";

loadEnvLocal();
const OUT = resolve("data/milestones/deck-synthesis");
const GENERATED_AT = new Date().toISOString();
const DESIGN_V3_PATH = resolve(OUT, "phase6a1-professor-plan-functional-role-closure-design-v3.json");
const STATUS_PRECEDENCE_PATH = resolve(OUT, "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json");
const RUNTIME_SCHEMA_PATH = resolve(OUT, "phase6a1-semantic-closure-runtime-input-schema-v8.json");
const HOLDOUT_V8_MANIFEST = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v8-sealed-manifest-v8.json");
const HOLDOUT_V8_SNAPSHOT_MANIFEST = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v8-semantic-closure-input-v8/manifest.json");
const AUDIT_V7_SRC = "C:/Users/h3art/Downloads/phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, JSON.stringify(value, null, 2));
  return sha256File(path);
}

function requireHoldoutV8PublishPack(): void {
  if (!existsSync(HOLDOUT_V8_MANIFEST) || !existsSync(HOLDOUT_V8_SNAPSHOT_MANIFEST)) {
    throw new Error("Holdout prospective v8 publish pack missing. External authority holder must publish holdout v8 before implementation seal.");
  }
}

async function main() {
  if (!readFileSync(DESIGN_V3_PATH, "utf8").includes("DESIGN_V3")) throw new Error("Design v3 missing");
  if (!existsSync(STATUS_PRECEDENCE_PATH)) throw new Error("Status precedence sidecar missing");
  if (!existsSync(RUNTIME_SCHEMA_PATH)) throw new Error("Runtime schema sidecar missing");
  const designSha = sha256File(DESIGN_V3_PATH);
  const statusPrecedenceSha = sha256File(STATUS_PRECEDENCE_PATH);
  const runtimeSchemaSha = sha256File(RUNTIME_SCHEMA_PATH);
  requireHoldoutV8PublishPack();

  writeJson(resolve(OUT, "phase6a1-professor-plan-v2-benchmark-disposition-v8.json"), {
    version: "phase6a1-professor-plan-v2-benchmark-disposition-v8",
    recordedAt: GENERATED_AT,
    auditReference: "phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json",
    designV3CoreMatrix: "PASS_PRESERVE_WITH_NORMATIVE_STATUS_PRECEDENCE_AND_RUNTIME_SCHEMA_V8",
    holdoutProspectiveV7: {
      status: "NOT_ACCEPTED_AS_PROSPECTIVE_GATE",
      doNotOpenBlindedAdjudication: true,
      reason: "14/24 commander overlap with DEV36/Amendment v8/compromised v2-v3; two generic semantic templates; incomplete role coverage.",
    },
    holdoutProspectiveV7BlindedAdjudication: "KEEP_SEALED_DO_NOT_OPEN",
    holdoutProspectiveV8: {
      status: "PROSPECTIVE_PUBLISH_PACK",
      membershipPolicy: "FRESH_EXCLUDING_ALL_EXPOSED_DEV36_AMENDMENT_V8_HOLDOUT_V2_THROUGH_V7",
      authorityLocation: "benchmark-authority/phase6a1-holdout-prospective-v8/private/ (gitignored)",
      implementationMustNotInvokeAuthority: true,
    },
    dev36SemanticV8: { status: "DEVELOPMENT_TEMPLATE_FIXTURE", notGeneralizationEvidence: true },
    amendmentV8: "KEEP_FROZEN_FINAL",
    goldComparisonV1: "KEEP_SEALED_FINAL",
    corpusIngest: "KEEP_BLOCKED",
    productionClosureImplementation: "NOT_AUTHORIZED",
  });

  const dev36Cases = JSON.parse(readFileSync(resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json"), "utf8")).cases;
  await authorDev36FixtureCatalogV8(dev36Cases);
  const devSnapshots = authorSemanticSnapshotsV8();
  const devAdjSha = await authorIndependentAdjudicationV8(
    devSnapshots.snapshotDir,
    resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v8.json"),
    devSnapshots.manifestSha256,
    "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v8",
  );

  const leakage = await runFullLeakageSuiteV8();
  if (!leakage.pass) throw new Error(`Leakage v8 failed: ${JSON.stringify(leakage.results, null, 2)}`);

  const fixtureCatalogManifestSha = sha256File(resolve(OUT, "phase6a1-professor-plan-semantic-fixture-catalog-v8/dev36-v8-manifest.json"));

  writeJson(resolve(OUT, "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v8.json"), {
    version: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v8",
    sealedAt: GENERATED_AT,
    designArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    designSha256: designSha,
    runtimeSchemaSidecar: "phase6a1-semantic-closure-runtime-input-schema-v8.json",
    runtimeSchemaSidecarSha256: runtimeSchemaSha,
    statusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
    statusPrecedenceSidecarSha256: statusPrecedenceSha,
    benchmarkPopulation: "phase6a1-professor-plan-dev36-population-v2.json",
    upstreamFixtureCatalogManifest: "phase6a1-professor-plan-semantic-fixture-catalog-v8/dev36-v8-manifest.json",
    upstreamFixtureCatalogManifestSha256: fixtureCatalogManifestSha,
    semanticClosureInputManifest: "phase6a1-professor-plan-dev36-semantic-closure-input-v8/manifest.json",
    semanticClosureInputManifestSha256: devSnapshots.manifestSha256,
    semanticClosureAdjudication: "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v8.json",
    semanticClosureAdjudicationSha256: devAdjSha,
    adjudicationPolicy: "DEV_TEMPLATE_STRUCTURAL_INFERENCE_V8_NOT_PRODUCTION_CLOSURE",
    leakageTestReport: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v8.json",
    caseCount: 36,
    disposition: "DEVELOPMENT_TEMPLATE_FIXTURE_NOT_GENERALIZATION_EVIDENCE",
    instruction: "WAIT before production closure implementation",
  });

  const holdoutManifest = JSON.parse(readFileSync(HOLDOUT_V8_MANIFEST, "utf8"));

  writeJson(resolve(OUT, "phase6a1-professor-plan-post-gold-development-track-v8.json"), {
    version: "phase6a1-professor-plan-post-gold-development-track-v8",
    updatedAt: GENERATED_AT,
    supersedes: "phase6a1-professor-plan-post-gold-development-track-v7",
    auditDisposition: "BENCHMARK_BLOCK_V7_ADDRESSED_BY_V8_REPAIR",
    semanticBenchmarkV8: {
      dev36: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v8.json",
      holdoutProspective: "phase6a1-professor-plan-holdout-prospective-v8-sealed-manifest-v8.json",
      runtimeSchemaSidecar: "phase6a1-semantic-closure-runtime-input-schema-v8.json",
      canonicalCatalogSlice: "phase6a1-benchmark-canonical-catalog-slice-v2.json",
    },
    gateDisposition: { amendmentV8: "FROZEN_FINAL", goldComparisonV1: "SEALED_FINAL", corpusIngest: "BLOCKED", closureImplementation: "WAIT" },
  });

  try {
    writeFileSync(
      resolve(OUT, "phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json"),
      readFileSync(AUDIT_V7_SRC),
    );
  } catch { /* optional local path */ }

  console.log(JSON.stringify({
    decision: "SEALED_WAIT",
    designV3Sha256: designSha,
    runtimeSchemaSidecarSha256: runtimeSchemaSha,
    statusPrecedenceSidecarSha256: statusPrecedenceSha,
    dev36SnapshotManifestSha256: devSnapshots.manifestSha256,
    dev36AdjudicationV8Sha256: devAdjSha,
    holdoutProspectiveV8SnapshotManifestSha256: holdoutManifest.semanticClosureInputManifestSha256,
    holdoutProspectiveV8BlindedAdjudicationSha256: holdoutManifest.blindedAdjudicationSha256,
    holdoutProspectiveV7: "NOT_ACCEPTED_KEEP_BLINDED_SEALED",
    leakageReportPath: leakage.reportPath,
    leakagePass: leakage.pass,
    instruction: "REPORT AND WAIT — no production closure implementation",
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
