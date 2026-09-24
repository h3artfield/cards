#!/usr/bin/env npx tsx
/**
 * Implementation-visible semantic closure benchmark seal v7.
 * Does NOT invoke external authority. Consumes pre-published holdout v7 artifacts only.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { authorDev36FixtureCatalogV6 } from "./run-phase6a1-closure-semantic-fixture-catalog-author-v6";
import { authorSemanticSnapshotsV6 } from "./run-phase6a1-closure-semantic-snapshot-author-v6";
import { authorIndependentAdjudicationV7 } from "./run-phase6a1-closure-independent-adjudication-author-v7";
import { runFullLeakageSuiteV7 } from "./run-phase6a1-closure-semantic-benchmark-leakage-test-v7";

loadEnvLocal();
const OUT = resolve("data/milestones/deck-synthesis");
const GENERATED_AT = new Date().toISOString();
const DESIGN_V3_PATH = resolve(OUT, "phase6a1-professor-plan-functional-role-closure-design-v3.json");
const STATUS_PRECEDENCE_PATH = resolve(
  OUT,
  "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
);
const HOLDOUT_V7_MANIFEST = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v7-sealed-manifest-v7.json");
const HOLDOUT_V7_SNAPSHOT_MANIFEST = resolve(
  OUT,
  "phase6a1-professor-plan-holdout-prospective-v7-semantic-closure-input-v7/manifest.json",
);
const AUDIT_V6_SRC = "C:/Users/h3art/Downloads/phase6a1-professor-plan-functional-role-closure-v6-preimplementation-reaudit-gpt56sol-v1.json";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, JSON.stringify(value, null, 2));
  return sha256File(path);
}

function requireHoldoutV7PublishPack(): void {
  if (!existsSync(HOLDOUT_V7_MANIFEST) || !existsSync(HOLDOUT_V7_SNAPSHOT_MANIFEST)) {
    throw new Error(
      "Holdout prospective v7 publish pack missing. External authority holder must publish holdout v7 before implementation seal.",
    );
  }
}

async function main() {
  if (!readFileSync(DESIGN_V3_PATH, "utf8").includes("DESIGN_V3")) throw new Error("Design v3 missing");
  if (!existsSync(STATUS_PRECEDENCE_PATH)) throw new Error("Status precedence sidecar missing");
  const designSha = sha256File(DESIGN_V3_PATH);
  const statusPrecedenceSha = sha256File(STATUS_PRECEDENCE_PATH);
  requireHoldoutV7PublishPack();

  writeJson(resolve(OUT, "phase6a1-professor-plan-v2-benchmark-disposition-v7.json"), {
    version: "phase6a1-professor-plan-v2-benchmark-disposition-v7",
    recordedAt: GENERATED_AT,
    auditReference: "phase6a1-professor-plan-functional-role-closure-v6-preimplementation-reaudit-gpt56sol-v1.json",
    designV3CoreMatrix: "PASS_PRESERVE_WITH_NORMATIVE_STATUS_PRECEDENCE_SIDECAR",
    dev36V2: { status: "SYNTHETIC_UNIT_FIXTURE", notSemanticEvidence: true },
    holdout24V2: { status: "COMPROMISED_BEFORE_USE", doNotOpenBlindedAdjudication: true },
    holdout24V3: { status: "COMPROMISED_BEFORE_USE", doNotOpenBlindedAdjudication: true },
    holdoutProspectiveV4: { status: "COMPROMISED_BEFORE_USE", doNotOpenBlindedAdjudication: true },
    holdoutProspectiveV5: {
      status: "COMPROMISED_BEFORE_USE",
      doNotOpenBlindedAdjudication: true,
      doNotUseAsSemanticHoldout: true,
    },
    holdoutProspectiveV6: {
      status: "NOT_ACCEPTED_AS_PROSPECTIVE_GATE",
      doNotOpenBlindedAdjudication: true,
      doNotUseAsSemanticHoldout: true,
      reason: "Reused 23/24 compromised v4/v5 commander identities; precedence bug in DEV adjudication; incomplete v6v6 audit bundle.",
    },
    holdoutProspectiveV6BlindedAdjudication: "KEEP_SEALED_DO_NOT_OPEN",
    dev36SemanticV6: { status: "DEVELOPMENT_TEMPLATE_FIXTURE", notGeneralizationEvidence: true },
    holdoutProspectiveV7: {
      status: "PROSPECTIVE_PUBLISH_PACK",
      membershipPolicy: "FRESH_EXCLUDING_ALL_COMPROMISED_HOLDOUT_V4_V5_V6_COMMANDER_IDENTITIES",
      authorityLocation: "benchmark-authority/phase6a1-holdout-prospective-v7/private/ (gitignored)",
      implementationReceives: ["population", "runtime snapshots", "sealed manifest with blinded adjudication SHA only"],
      implementationMustNotInvokeAuthority: true,
    },
    amendmentV8: "KEEP_FROZEN_FINAL",
    goldComparisonV1: "KEEP_SEALED_FINAL",
    corpusIngest: "KEEP_BLOCKED",
    productionClosureImplementation: "NOT_AUTHORIZED",
  });

  const dev36Cases = JSON.parse(readFileSync(resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json"), "utf8")).cases;
  await authorDev36FixtureCatalogV6(dev36Cases);
  const devSnapshots = authorSemanticSnapshotsV6();
  const devAdjSha = await authorIndependentAdjudicationV7(
    devSnapshots.snapshotDir,
    resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v7.json"),
    devSnapshots.manifestSha256,
    "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v7",
  );

  const leakage = await runFullLeakageSuiteV7();
  if (!leakage.pass) throw new Error(`Leakage v7 failed: ${JSON.stringify(leakage.results, null, 2)}`);

  const fixtureCatalogManifestSha = sha256File(
    resolve(OUT, "phase6a1-professor-plan-semantic-fixture-catalog-v6/dev36-v6-manifest.json"),
  );

  writeJson(resolve(OUT, "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v7.json"), {
    version: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v7",
    sealedAt: GENERATED_AT,
    designArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    designSha256: designSha,
    statusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
    statusPrecedenceSidecarSha256: statusPrecedenceSha,
    benchmarkPopulation: "phase6a1-professor-plan-dev36-population-v2.json",
    upstreamFixtureCatalogManifest: "phase6a1-professor-plan-semantic-fixture-catalog-v6/dev36-v6-manifest.json",
    upstreamFixtureCatalogManifestSha256: fixtureCatalogManifestSha,
    semanticClosureInputManifest: "phase6a1-professor-plan-dev36-semantic-closure-input-v6/manifest.json",
    semanticClosureInputManifestSha256: devSnapshots.manifestSha256,
    semanticClosureAdjudication: "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v7.json",
    semanticClosureAdjudicationSha256: devAdjSha,
    adjudicationPolicy: "DEV_TEMPLATE_STRUCTURAL_INFERENCE_V7_NOT_PRODUCTION_CLOSURE",
    leakageTestReport: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v7.json",
    caseCount: 36,
    disposition: "DEVELOPMENT_TEMPLATE_FIXTURE_NOT_GENERALIZATION_EVIDENCE",
    instruction: "WAIT before production closure implementation",
  });

  const holdoutManifest = JSON.parse(readFileSync(HOLDOUT_V7_MANIFEST, "utf8"));

  writeJson(resolve(OUT, "phase6a1-professor-plan-post-gold-development-track-v7.json"), {
    version: "phase6a1-professor-plan-post-gold-development-track-v7",
    updatedAt: GENERATED_AT,
    supersedes: "phase6a1-professor-plan-post-gold-development-track-v6",
    auditDisposition: "BENCHMARK_BLOCK_V6_ADDRESSED_BY_V7_REPAIR",
    authorScripts: {
      fixtureCatalog: "web/scripts/run-phase6a1-closure-semantic-fixture-catalog-author-v6.ts",
      semanticSnapshot: "web/scripts/run-phase6a1-closure-semantic-snapshot-author-v6.ts",
      independentAdjudication: "web/scripts/run-phase6a1-closure-independent-adjudication-author-v7.ts",
      leakageTest: "web/scripts/run-phase6a1-closure-semantic-benchmark-leakage-test-v7.ts",
      sealOrchestrator: "web/scripts/run-phase6a1-closure-semantic-benchmark-seal-v7.ts",
      canonicalCatalogSlice: "web/scripts/run-phase6a1-build-benchmark-canonical-catalog-slice-v1.ts",
      statusPrecedenceTest: "web/scripts/test-phase6a1-closure-status-precedence-v1.ts",
    },
    externalAuthority: {
      location: "benchmark-authority/phase6a1-holdout-prospective-v7/ (private adjudication gitignored)",
      gitignored: true,
      accessBoundaryEvidence: "phase6a1-benchmark-authority-access-boundary-evidence-v1.json",
      note: "Holdout adjudication decisions and blinded adjudication never enter implementation bundle.",
    },
    supportingLibraries: {
      designMatrix: "web/scripts/lib/phase6a1-closure-design-v3-matrix.ts",
      canonicalCommanderFacts: "web/scripts/lib/phase6a1-closure-commander-canonical-facts-v6.ts",
      devTemplateInference: "web/scripts/lib/phase6a1-closure-semantic-inference-dev-template-v6.ts",
      benchmarkGates: "web/scripts/lib/phase6a1-closure-benchmark-gates-v6.ts",
      fixtureBuilder: "web/scripts/lib/phase6a1-semantic-fixture-builder-v6.ts",
      normalize: "web/scripts/lib/phase6a1-closure-semantic-normalize-v6.ts",
      textNeutralize: "web/scripts/lib/phase6a1-semantic-text-neutralize-v5.ts",
      goldenCatalogLoader: "web/scripts/lib/load-golden-catalog-index.ts",
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      corpusIngest: "BLOCKED",
      closureImplementation: "WAIT",
    },
    semanticBenchmarkV7: {
      dev36: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v7.json",
      holdoutProspective: "phase6a1-professor-plan-holdout-prospective-v7-sealed-manifest-v7.json",
      canonicalCatalogSlice: "phase6a1-benchmark-canonical-catalog-slice-v1.json",
      statusPrecedenceSidecar: "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
    },
  });

  try {
    writeFileSync(
      resolve(OUT, "phase6a1-professor-plan-functional-role-closure-v6-preimplementation-reaudit-gpt56sol-v1.json"),
      readFileSync(AUDIT_V6_SRC),
    );
  } catch {
    /* optional local path */
  }

  console.log(
    JSON.stringify(
      {
        decision: "SEALED_WAIT",
        designV3Sha256: designSha,
        statusPrecedenceSidecarSha256: statusPrecedenceSha,
        dev36SnapshotManifestSha256: devSnapshots.manifestSha256,
        dev36AdjudicationV7Sha256: devAdjSha,
        holdoutProspectiveV7SnapshotManifestSha256: holdoutManifest.semanticClosureInputManifestSha256,
        holdoutProspectiveV7BlindedAdjudicationSha256: holdoutManifest.blindedAdjudicationSha256,
        holdoutProspectiveV6: "NOT_ACCEPTED_AS_PROSPECTIVE_GATE_KEEP_BLINDED_SEALED",
        leakageReportPath: leakage.reportPath,
        leakagePass: leakage.pass,
        instruction: "REPORT AND WAIT — no production closure implementation",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
