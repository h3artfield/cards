#!/usr/bin/env npx tsx
/** Build architecture review bundle archv9.zip — excludes authority-private roster generator source. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const ZIP_PATH = resolve(OUT, "archv9.zip");
const STAGING = resolve(OUT, ".audit-bundle-archv9-staging");
const MANIFEST_NAME = "phase6a1-professor-plan-audit-bundle-archv9-manifest.json";
const BYTE_PIN_NAME = "phase6a1-professor-plan-audit-bundle-archv9-byte-pin.json";
const GENERATED_AT = "2026-08-15T02:00:00.000Z";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function stageFile(absPath: string, zipPath: string, staged: Array<{ zipPath: string; absPath: string }>): void {
  const dest = join(STAGING, zipPath);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(absPath, dest);
  staged.push({ zipPath, absPath });
}

function stageFromOut(relFromOut: string, staged: Array<{ zipPath: string; absPath: string }>): void {
  const abs = resolve(OUT, relFromOut);
  if (!existsSync(abs)) throw new Error(`Missing file: ${abs}`);
  stageFile(abs, relFromOut.replace(/\\/g, "/"), staged);
}

function stageFromRepo(relFromRepo: string, zipPath: string, staged: Array<{ zipPath: string; absPath: string }>): void {
  const abs = resolve(REPO, relFromRepo);
  if (!existsSync(abs)) throw new Error(`Missing repo file: ${abs}`);
  stageFile(abs, zipPath, staged);
}

async function main() {
  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(STAGING, { recursive: true });
  const staged: Array<{ zipPath: string; absPath: string }> = [];

  for (const f of [
    "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v9.json",
    "phase6a1-professor-plan-full-catalog-data-state-commitment-v1.json",
    "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    "phase6a1-professor-plan-deck-resolution-data-state-pin-v1.json",
    "phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
    "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v1.json",
    "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v2.json",
    "phase6a1-professor-plan-catalog-data-state-verification-spec-v1.json",
    "phase6a1-professor-plan-catalog-data-state-verification-spec-v2.json",
    "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v2.json",
    "phase6a1-professor-plan-serialization-pilot-harmony-evidence-v3.json",
    "phase6a1-professor-plan-serialization-pilot-spec-v7.json",
    "phase6a1-professor-plan-serialization-pilot-spec-v8.json",
    "phase6a1-professor-plan-selection-policy-v3-freshness-manifest-v2-override-v1.json",
    "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
    "phase6a1-exposed-benchmark-identities-manifest-v2.json",
    "phase6a1-professor-plan-roster-commitment-sealed-wait-spec-v2.json",
    "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2.json",
    "phase6a1-professor-plan-authority-gold-clearance-policy-v2.json",
    "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v4.json",
    "phase6a1-professor-plan-authority-adjudication-rubric-v4.json",
    "phase6a1-professor-plan-evaluation-a-scoring-rubric-v3.json",
    "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
    "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
    "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v2.json",
    "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
    "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v2.json",
    "phase6a1-professor-plan-v2-benchmark-disposition-v17-architecture.json",
    "phase6a1-professor-plan-post-gold-development-track-v17-architecture.json",
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v8.json",
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json",
    "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json",
    "phase6a1-professor-plan-benchmark-architecture-v7-independent-reaudit-gpt56sol-v1.json",
    "phase6a1-professor-plan-benchmark-architecture-v8-independent-reaudit-gpt56sol-v1.json",
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v7.json",
  ]) {
    stageFromOut(f, staged);
  }

  for (const rel of [
    "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-v1.ts",
    "web/scripts/run-phase6a1-verify-pinned-catalog-data-state-v2.ts",
    "web/scripts/lib/catalog-sorted-newline-root-v1.ts",
    "web/scripts/lib/load-deck-resolution-catalog.ts",
    "web/scripts/lib/load-golden-catalog-index.ts",
    "web/scripts/lib/deck-resolution-supplement-v1.ts",
    "web/scripts/lib/catalog-population-classifier-v1.ts",
    "web/src/lib/deck-synthesis/benchmark-commander-eligibility-v1.ts",
    "web/src/lib/deck-synthesis/benchmark-commander-resolver-v1.ts",
    "web/src/lib/deck-builder/commander-classification.ts",
    "web/src/lib/deck-builder/golden-catalog/normalize-name.ts",
    "web/src/lib/deck-builder/golden-catalog/parse-type-line.ts",
    "web/src/lib/commander-strategy/resolve-catalog-card-by-name.ts",
    "web/scripts/lib/catalog-resolver.ts",
    "web/src/lib/deck-builder/catalog-resolver.ts",
    "web/src/lib/catalog-coverage/adjudication-config.ts",
    "web/data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2-manifest.json",
    "web/data/milestones/catalog-shadow/catalog-paper-eligibility-identities-v1.jsonl",
    "web/data/milestones/catalog-shadow/catalog-deck-resolution-supplement-v1.json",
  ]) {
    stageFromRepo(rel, rel.replace(/\\/g, "/"), staged);
  }

  for (const rel of [
    "web/scripts/run-phase6a1-seal-benchmark-architecture-v9.ts",
    "web/scripts/run-phase6a1-build-audit-bundle-architecture-v9.ts",
  ]) {
    stageFromRepo(rel, rel.replace(/\\/g, "/"), staged);
  }
  stageFromRepo(".gitignore", ".gitignore", staged);

  const manifestPath = resolve(OUT, MANIFEST_NAME);
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-audit-bundle-archv9-manifest",
        generatedAt: GENERATED_AT,
        artifact: "archv9.zip",
        zipEntryCount: staged.length + 1,
        purpose: "Independent review of architecture amendment v9",
        supersedes: "archv8.zip",
        excludesAuthorityPrivateGenerator: true,
        includesCatalogVerifierScriptV2: true,
        includesDeckResolutionTransitiveSources: true,
        frozenAmendmentV8Archive: {
          artifact: "phase6a1-professor-plan-experiment-v3-amended-v8.zip",
          byteSha256: "9297688b07b85095672fedfb91f63669d71fc5e5d66ba319c10a654b0169cba1",
        },
        entries: staged.map((e) => ({ zipPath: e.zipPath, sha256: sha256File(e.absPath) })),
      },
      null,
      2,
    ),
  );
  stageFile(manifestPath, MANIFEST_NAME, staged);

  rmSync(ZIP_PATH, { force: true });
  const tar = spawnSync("tar", ["-a", "-c", "-f", ZIP_PATH, "-C", STAGING, "."], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr || tar.stdout}`);
  rmSync(STAGING, { recursive: true, force: true });

  const byteSha256 = sha256File(ZIP_PATH);
  const manifestSha256 = sha256File(manifestPath);
  const sealedManifestSha256 = sha256File(resolve(OUT, "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json"));
  const bytePinPath = resolve(OUT, BYTE_PIN_NAME);
  writeFileSync(
    bytePinPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-audit-bundle-archv9-byte-pin",
        generatedAt: GENERATED_AT,
        artifact: "archv9.zip",
        byteSha256,
        manifestArtifact: MANIFEST_NAME,
        manifestSha256,
        sealedManifestV9Sha256: sealedManifestSha256,
        manifestIncludedInZip: true,
        uploadTogether: ["archv9.zip", BYTE_PIN_NAME],
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ zipPath: ZIP_PATH, byteSha256, bytePinPath, entryCount: staged.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
