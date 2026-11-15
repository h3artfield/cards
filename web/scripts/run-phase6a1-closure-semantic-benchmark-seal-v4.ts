#!/usr/bin/env npx tsx
/**
 * Seal semantic closure benchmark v4:
 * - Preserves design v3 core rules (unchanged artifact)
 * - DEV36 semantic v4: opaque package IDs, oracle-grounded facts, development template
 * - HOLDOUT24-V3: COMPROMISED_BEFORE_USE (preserved, not opened)
 * - HOLDOUT prospective v4: authority-sealed; implementation receives snapshots/manifest only
 * Does NOT implement closure runtime.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { authorDev36FixtureCatalogV4 } from "./run-phase6a1-closure-semantic-fixture-catalog-author-v4";
import { authorDev36SemanticSnapshotsV4 } from "./run-phase6a1-closure-semantic-snapshot-author-v4";
import { authorIndependentAdjudicationV4 } from "./run-phase6a1-closure-independent-adjudication-author-v4";
import { runLeakageTestsV4, writeLeakageReportV4 } from "./run-phase6a1-closure-semantic-benchmark-leakage-test-v4";

const OUT = resolve("data/milestones/deck-synthesis");
const GENERATED_AT = new Date().toISOString();
const DESIGN_V3_PATH = resolve(OUT, "phase6a1-professor-plan-functional-role-closure-design-v3.json");
const AUTHORITY_SEAL = resolve(
  OUT,
  "_benchmark-authority-not-for-implementation/phase6a1-holdout-prospective-v4/run-holdout-prospective-v4-authority-seal.ts",
);
const AUDIT_V3_REAUDIT_SRC =
  "C:/Users/h3art/Downloads/phase6a1-professor-plan-functional-role-closure-v3-preimplementation-reaudit-gpt56sol-v1.json";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, JSON.stringify(value, null, 2));
  return sha256File(path);
}

function main() {
  if (!readFileSync(DESIGN_V3_PATH, "utf8").includes("DESIGN_V3")) {
    throw new Error("Design v3 artifact missing or invalid — must preserve unchanged");
  }
  const designSha = sha256File(DESIGN_V3_PATH);

  writeJson(resolve(OUT, "phase6a1-professor-plan-v2-benchmark-disposition-v4.json"), {
    version: "phase6a1-professor-plan-v2-benchmark-disposition-v4",
    recordedAt: GENERATED_AT,
    auditReference: "phase6a1-professor-plan-functional-role-closure-v3-preimplementation-reaudit-gpt56sol-v1.json",
    dev36V2: {
      status: "SYNTHETIC_UNIT_FIXTURE",
      purpose: ["schema parsing", "validator gating", "role-gap serialization", "status handling", "INVALID package exclusion", "deterministic output formatting"],
      notSemanticEvidence: true,
    },
    holdout24V2: {
      status: "COMPROMISED_BEFORE_USE",
      doNotOpenBlindedAdjudication: true,
      doNotUseAsSemanticHoldout: true,
    },
    holdout24V3: {
      status: "COMPROMISED_BEFORE_USE",
      doNotOpenBlindedAdjudication: true,
      doNotUseAsSemanticHoldout: true,
      reason: "24/24 runtime snapshots are normalized semantic duplicates of DEV36 templates; scenario assignment visible in v3 seal script.",
    },
    dev36SemanticV3: {
      status: "DEVELOPMENT_TEMPLATE_FIXTURE",
      notGeneralizationEvidence: true,
    },
    dev36SemanticV4: {
      status: "DEVELOPMENT_TEMPLATE_FIXTURE",
      notGeneralizationEvidence: true,
      repairs: ["opaque package IDs", "source-faithful oracle facts", "neutralized role vocabulary in theses"],
    },
    holdoutProspectiveV4: {
      status: "PROSPECTIVE_SEALED",
      authorityPath: "_benchmark-authority-not-for-implementation/phase6a1-holdout-prospective-v4/",
      implementationReceives: ["population", "runtime snapshots", "sealed manifest with blinded adjudication SHA only"],
      implementationMustNotReceive: ["scenario assignment", "fixture catalog", "blinded adjudication JSON", "gap/closed labels"],
    },
  });

  const dev36Cases = JSON.parse(readFileSync(resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json"), "utf8")).cases;
  authorDev36FixtureCatalogV4(dev36Cases);
  const devSnapshots = authorDev36SemanticSnapshotsV4();
  const devAdjSha = authorIndependentAdjudicationV4(
    devSnapshots.snapshotDir,
    resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v4.json"),
    devSnapshots.manifestSha256,
    "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v4",
  );

  const authorityRun = spawnSync("npx", ["tsx", AUTHORITY_SEAL], { cwd: resolve("."), encoding: "utf8", shell: true });
  if (authorityRun.status !== 0) {
    throw new Error(`Holdout authority seal failed:\n${authorityRun.stdout}\n${authorityRun.stderr}`);
  }

  const devDir = resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-input-v4");
  const hoDir = resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v4-semantic-closure-input-v4");
  const leakage = {
    dev36V4: runLeakageTestsV4(devDir, { label: "dev36-v4" }),
    holdoutProspectiveV4: runLeakageTestsV4(hoDir, { compareAgainstDir: devDir, label: "holdout-prospective-v4" }),
    implementationVisibleSources: (() => {
      const src = readFileSync(resolve("scripts/run-phase6a1-closure-semantic-benchmark-seal-v4.ts"), "utf8");
      const body = src
        .split("\n")
        .filter((line) => !line.includes("findings.push") && !line.includes(".test("))
        .join("\n");
      const findings: string[] = [];
      if (/const\s+HOLDOUT[\w-]*SCENARIOS\s*[:=]/.test(body)) findings.push("v4 seal script declares holdout scenario array");
      if (/authorFixtureCatalog\(\s*holdoutCases/.test(body)) findings.push("v4 seal script authors holdout fixtures inline");
      return { pass: findings.length === 0, findings };
    })(),
  };
  if (!leakage.dev36V4.pass || !leakage.holdoutProspectiveV4.pass || !leakage.implementationVisibleSources.pass) {
    throw new Error(`Leakage test failed: ${JSON.stringify(leakage, null, 2)}`);
  }
  const leakageReportPath = writeLeakageReportV4(leakage);

  writeJson(resolve(OUT, "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v4.json"), {
    version: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v4",
    sealedAt: GENERATED_AT,
    designArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    designSha256: designSha,
    benchmarkPopulation: "phase6a1-professor-plan-dev36-population-v2.json",
    semanticClosureInputManifest: "phase6a1-professor-plan-dev36-semantic-closure-input-v4/manifest.json",
    semanticClosureInputManifestSha256: devSnapshots.manifestSha256,
    semanticClosureAdjudication: "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v4.json",
    semanticClosureAdjudicationSha256: devAdjSha,
    leakageTestReport: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v4.json",
    supportingLibraries: [
      "web/scripts/lib/phase6a1-closure-design-v3-matrix.ts",
      "web/scripts/lib/phase6a1-semantic-fixture-templates-v4.ts",
      "web/scripts/lib/phase6a1-closure-semantic-inference-v3.ts",
      "web/scripts/lib/phase6a1-closure-commander-oracle-facts-v4.ts",
      "web/scripts/lib/phase6a1-semantic-fixture-builder-v4.ts",
      "web/scripts/lib/phase6a1-closure-semantic-normalize-v4.ts",
    ],
    caseCount: 36,
    disposition: "DEVELOPMENT_TEMPLATE_FIXTURE_NOT_GENERALIZATION_EVIDENCE",
    instruction: "Semantic DEV36 v4. Snapshots authored independently of adjudication. WAIT before implementation.",
  });

  writeJson(resolve(OUT, "phase6a1-professor-plan-post-gold-development-track-v4.json"), {
    version: "phase6a1-professor-plan-post-gold-development-track-v4",
    updatedAt: GENERATED_AT,
    supersedes: "phase6a1-professor-plan-post-gold-development-track-v3",
    auditDisposition: "DESIGN_BLOCK_V3_ADDRESSED_BY_V4_BENCHMARK_REPAIR",
    authorScripts: {
      fixtureCatalog: "web/scripts/run-phase6a1-closure-semantic-fixture-catalog-author-v4.ts",
      semanticSnapshot: "web/scripts/run-phase6a1-closure-semantic-snapshot-author-v4.ts",
      independentAdjudication: "web/scripts/run-phase6a1-closure-independent-adjudication-author-v4.ts",
      leakageTest: "web/scripts/run-phase6a1-closure-semantic-benchmark-leakage-test-v4.ts",
      sealOrchestrator: "web/scripts/run-phase6a1-closure-semantic-benchmark-seal-v4.ts",
      holdoutAuthoritySeal:
        "web/data/milestones/deck-synthesis/_benchmark-authority-not-for-implementation/phase6a1-holdout-prospective-v4/run-holdout-prospective-v4-authority-seal.ts",
    },
    supportingLibraries: {
      designMatrix: "web/scripts/lib/phase6a1-closure-design-v3-matrix.ts",
      semanticFixtureTemplates: "web/scripts/lib/phase6a1-semantic-fixture-templates-v4.ts",
      semanticInference: "web/scripts/lib/phase6a1-closure-semantic-inference-v3.ts",
      commanderOracleFacts: "web/scripts/lib/phase6a1-closure-commander-oracle-facts-v4.ts",
      fixtureBuilder: "web/scripts/lib/phase6a1-semantic-fixture-builder-v4.ts",
      normalize: "web/scripts/lib/phase6a1-closure-semantic-normalize-v4.ts",
    },
    v2Preservation: { dev36V2: "SYNTHETIC_UNIT_FIXTURE", holdout24V2: "COMPROMISED_BEFORE_USE" },
    v3Preservation: {
      designV3CoreRules: "PASS_PRESERVE",
      dev36SemanticV3: "DEVELOPMENT_TEMPLATE_FIXTURE",
      holdout24V3: "COMPROMISED_BEFORE_USE_DO_NOT_OPEN_BLINDED_ADJUDICATION",
    },
    semanticBenchmarkV4: {
      dev36: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v4.json",
      holdoutProspective: "phase6a1-professor-plan-holdout-prospective-v4-sealed-manifest-v4.json",
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      corpusIngest: "BLOCKED",
      closureImplementation: "WAIT",
    },
  });

  try {
    writeFileSync(
      resolve(OUT, "phase6a1-professor-plan-functional-role-closure-v3-preimplementation-reaudit-gpt56sol-v1.json"),
      readFileSync(AUDIT_V3_REAUDIT_SRC),
    );
  } catch {
    /* optional if already copied */
  }

  const holdoutManifest = JSON.parse(
    readFileSync(resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v4-sealed-manifest-v4.json"), "utf8"),
  );

  console.log(
    JSON.stringify(
      {
        decision: "SEALED_WAIT",
        designV3Sha256: designSha,
        dev36SnapshotManifestSha256: devSnapshots.manifestSha256,
        dev36AdjudicationSha256: devAdjSha,
        holdoutProspectiveV4PopulationSha256: holdoutManifest.benchmarkPopulationSha256,
        holdoutProspectiveV4SnapshotManifestSha256: holdoutManifest.semanticClosureInputManifestSha256,
        holdoutProspectiveV4BlindedAdjudicationSha256: holdoutManifest.blindedAdjudicationSha256,
        holdout24V3: "COMPROMISED_BEFORE_USE",
        leakageReportPath,
        leakagePass: true,
        instruction: "REPORT AND WAIT — do not implement closure runtime",
      },
      null,
      2,
    ),
  );
}

main();
