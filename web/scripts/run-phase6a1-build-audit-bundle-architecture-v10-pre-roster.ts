#!/usr/bin/env npx tsx
/** Build pre-roster architecture review bundle archv10-pre-roster.zip */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const ZIP_PATH = resolve(OUT, "archv10-pre-roster.zip");
const STAGING = resolve(OUT, ".audit-bundle-archv10-pre-roster-staging");
const MANIFEST_NAME = "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-manifest.json";
const BYTE_PIN_NAME = "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-byte-pin.json";
const GENERATED_AT = "2026-08-15T03:00:00.000Z";

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
    "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v10.json",
    "phase6a1-professor-plan-commander-eligibility-state-commitment-spec-v1.json",
    "phase6a1-professor-plan-commander-eligibility-state-verification-spec-v1.json",
    "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v3.json",
    "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v3.json",
    "phase6a1-professor-plan-v2-benchmark-disposition-v18-architecture.json",
    "phase6a1-professor-plan-post-gold-development-track-v18-architecture.json",
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json",
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v9.json",
    "phase6a1-professor-plan-benchmark-architecture-v9-independent-reaudit-gpt56sol-v1.json",
    "phase6a1-professor-plan-benchmark-architecture-v8-independent-reaudit-gpt56sol-v1.json",
    "phase6a1-professor-plan-serialization-pilot-spec-v8.json",
    "phase6a1-professor-plan-full-catalog-data-state-commitment-v2.json",
    "phase6a1-professor-plan-deck-resolution-data-state-pin-v2.json",
    "phase6a1-professor-plan-deck-resolution-transitive-source-manifest-v2.json",
    "phase6a1-professor-plan-catalog-data-state-verification-spec-v2.json",
    "phase6a1-professor-plan-authority-roster-generator-source-audit-spec-v2.json",
    "phase6a1-professor-plan-benchmark-commander-eligibility-contract-pin-v1.json",
  ]) {
    stageFromOut(f, staged);
  }

  for (const rel of [
    "web/scripts/lib/catalog-commander-eligibility-state-root-v1.ts",
    "web/scripts/run-phase6a1-compute-commander-eligibility-state-commitment-v1.ts",
    "web/scripts/run-phase6a1-verify-commander-eligibility-state-v1.ts",
    "web/scripts/lib/load-deck-resolution-catalog.ts",
    "web/scripts/lib/load-golden-catalog-index.ts",
    "web/src/lib/deck-builder/commander-classification.ts",
    "web/src/lib/deck-synthesis/benchmark-commander-eligibility-v1.ts",
    "web/scripts/run-phase6a1-seal-benchmark-architecture-v10-pre-roster.ts",
    "web/scripts/run-phase6a1-build-audit-bundle-architecture-v10-pre-roster.ts",
  ]) {
    stageFromRepo(rel, rel.replace(/\\/g, "/"), staged);
  }

  const manifestPath = resolve(OUT, MANIFEST_NAME);
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-manifest",
        generatedAt: GENERATED_AT,
        artifact: "archv10-pre-roster.zip",
        zipEntryCount: staged.length + 1,
        purpose: "Pre-roster protocol amendment v10 — eligibility-state commitment + generator audit spec v3",
        supersedes: "archv9.zip for pre-roster authorization only; does not reopen v9 pilot gate",
        pilotGatePreserved: "PROTOCOL_V9_PILOT_GATE_PASS",
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
  const sealedManifestSha256 = sha256File(
    resolve(OUT, "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v10-pre-roster.json"),
  );
  const bytePinPath = resolve(OUT, BYTE_PIN_NAME);
  writeFileSync(
    bytePinPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-audit-bundle-archv10-pre-roster-byte-pin",
        generatedAt: GENERATED_AT,
        artifact: "archv10-pre-roster.zip",
        byteSha256,
        manifestArtifact: MANIFEST_NAME,
        manifestSha256,
        sealedManifestV10PreRosterSha256: sealedManifestSha256,
        manifestIncludedInZip: true,
        uploadTogether: ["archv10-pre-roster.zip", BYTE_PIN_NAME],
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
