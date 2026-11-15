#!/usr/bin/env npx tsx
/** Build architecture review bundle archv4.zip — excludes authority-private roster generator source. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "web/data/milestones/deck-synthesis");
const ZIP_PATH = resolve(OUT, "archv4.zip");
const STAGING = resolve(OUT, ".audit-bundle-archv4-staging");
const MANIFEST_NAME = "phase6a1-professor-plan-audit-bundle-archv4-manifest.json";
const BYTE_PIN_NAME = "phase6a1-professor-plan-audit-bundle-archv4-byte-pin.json";
const GENERATED_AT = "2026-08-14T22:45:00.000Z";

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
    "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v4.json",
    "phase6a1-professor-plan-prospective-commander-selection-policy-v3.json",
    "phase6a1-professor-plan-prospective-commander-roster-v2-spent-sidecar.json",
    "phase6a1-professor-plan-prospective-commander-selection-policy-v2-spent-sidecar.json",
    "phase6a1-exposed-benchmark-identities-manifest-v1.json",
    "phase6a1-professor-plan-synthetic-architecture-pivot-lineage-v1.json",
    "phase6a1-professor-plan-authority-adjudication-disagreement-protocol-v2.json",
    "phase6a1-professor-plan-serialization-pilot-spec-v3.json",
    "phase6a1-professor-plan-professor-stack-freeze-captured-v2-spec-v1.json",
    "phase6a1-professor-plan-operational-readiness-sealed-v2-spec-v1.json",
    "phase6a1-professor-plan-v2-benchmark-disposition-v12-architecture.json",
    "phase6a1-professor-plan-post-gold-development-track-v12-architecture.json",
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v4.json",
    "phase6a1-professor-plan-implementation-visibility-amendment-v2.json",
    "phase6a1-professor-plan-functional-role-closure-harmony-bridge-sufficiency-v1.json",
    "phase6a1-professor-plan-evaluation-a-scoring-rubric-v1.json",
    "phase6a1-professor-plan-professor-stack-freeze-manifest-v1.json",
    "phase6a1-professor-plan-professor-stack-freeze-captured-v1.json",
    "phase6a1-professor-plan-operational-readiness-seal-v1.json",
    "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json",
    "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
    "phase6a1-semantic-closure-runtime-input-schema-v8.json",
    "phase6a1-professor-plan-benchmark-architecture-v3-independent-reaudit-gpt56sol-v1.json",
    "phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json",
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v3.json",
  ]) {
    stageFromOut(f, staged);
  }

  for (const rel of [
    "web/scripts/run-phase6a1-seal-benchmark-architecture-v4.ts",
    "web/scripts/run-phase6a1-build-audit-bundle-architecture-v4.ts",
  ]) {
    stageFromRepo(rel, rel.replace(/\\/g, "/"), staged);
  }
  stageFromRepo(".gitignore", ".gitignore", staged);

  const manifestPath = resolve(OUT, MANIFEST_NAME);
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-audit-bundle-archv4-manifest",
        generatedAt: GENERATED_AT,
        artifact: "archv4.zip",
        zipEntryCount: staged.length + 1,
        purpose: "Independent review of architecture amendment v4",
        supersedes: "archv3.zip",
        excludesAuthorityPrivateGenerator: true,
        excludesDeterministicRosterSeed: true,
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
  const sealedManifestSha256 = sha256File(resolve(OUT, "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v4.json"));
  const bytePinPath = resolve(OUT, BYTE_PIN_NAME);
  writeFileSync(
    bytePinPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-audit-bundle-archv4-byte-pin",
        generatedAt: GENERATED_AT,
        artifact: "archv4.zip",
        byteSha256,
        manifestArtifact: MANIFEST_NAME,
        manifestSha256,
        sealedManifestV4Sha256: sealedManifestSha256,
        manifestIncludedInZip: true,
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
