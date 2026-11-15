#!/usr/bin/env npx tsx
/** Build self-contained v8v8 audit bundle ZIP with every manifest-hashed artifact including fixture bytes. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();
const WEB = resolve("scripts/..");
const OUT = resolve(WEB, "data/milestones/deck-synthesis");
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ZIP_PATH = resolve(OUT, "v8v8.zip");
const STAGING = resolve(OUT, ".audit-bundle-v8v8-staging");

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function stageFile(absPath: string, zipPath: string, staged: Array<{ zipPath: string; absPath: string }>): void {
  const dest = join(STAGING, zipPath);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(absPath, dest);
  staged.push({ zipPath, absPath });
}

function stageDir(dir: string, zipPrefix: string, staged: Array<{ zipPath: string; absPath: string }>): void {
  if (!existsSync(dir)) throw new Error(`Missing directory: ${dir}`);
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      stageDir(abs, `${zipPrefix}/${name}`, staged);
    } else {
      stageFile(abs, `${zipPrefix}/${name}`.replace(/\\/g, "/"), staged);
    }
  }
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
    "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
    "phase6a1-semantic-closure-runtime-input-schema-v8.json",
    "phase6a1-professor-plan-v2-benchmark-disposition-v8.json",
    "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v8.json",
    "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v8.json",
    "phase6a1-professor-plan-holdout-prospective-v8-sealed-manifest-v8.json",
    "phase6a1-professor-plan-holdout-prospective-v8-population-v8.json",
    "phase6a1-professor-plan-semantic-closure-leakage-test-report-v8.json",
    "phase6a1-professor-plan-post-gold-development-track-v8.json",
    "phase6a1-benchmark-authority-access-boundary-evidence-v2.json",
    "phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json",
    "phase6a1-benchmark-canonical-catalog-slice-v2.json",
    "phase6a1-benchmark-canonical-catalog-slice-v2-manifest.json",
  ]) stageFromOut(f, staged);

  stageDir(resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-input-v8"), "phase6a1-professor-plan-dev36-semantic-closure-input-v8", staged);
  stageDir(resolve(OUT, "phase6a1-professor-plan-holdout-prospective-v8-semantic-closure-input-v8"), "phase6a1-professor-plan-holdout-prospective-v8-semantic-closure-input-v8", staged);
  stageDir(resolve(OUT, "phase6a1-professor-plan-semantic-fixture-catalog-v8"), "phase6a1-professor-plan-semantic-fixture-catalog-v8", staged);

  for (const rel of [
    "web/scripts/run-phase6a1-closure-semantic-benchmark-seal-v8.ts",
    "web/scripts/run-phase6a1-closure-semantic-benchmark-leakage-test-v8.ts",
    "web/scripts/run-phase6a1-closure-independent-adjudication-author-v8.ts",
    "web/scripts/run-phase6a1-closure-semantic-fixture-catalog-author-v8.ts",
    "web/scripts/run-phase6a1-closure-semantic-snapshot-author-v8.ts",
    "web/scripts/run-phase6a1-build-benchmark-canonical-catalog-slice-v1.ts",
    "web/scripts/test-phase6a1-closure-status-precedence-v1.ts",
    "web/scripts/lib/phase6a1-closure-design-v3-matrix.ts",
    "web/scripts/lib/phase6a1-closure-commander-canonical-facts-v6.ts",
    "web/scripts/lib/phase6a1-closure-semantic-inference-dev-template-v6.ts",
    "web/scripts/lib/phase6a1-closure-benchmark-gates-v8.ts",
    "web/scripts/lib/phase6a1-closure-semantic-normalize-v8.ts",
    "web/scripts/lib/phase6a1-oracle-clause-evidence-v8.ts",
    "web/scripts/lib/phase6a1-exposed-benchmark-commanders-v8.ts",
    "web/scripts/lib/phase6a1-semantic-fixture-builder-v8.ts",
    "web/scripts/lib/load-golden-catalog-index.ts",
  ]) stageFromRepo(rel, rel.replace(/\\/g, "/"), staged);
  stageFromRepo(".gitignore", ".gitignore", staged);

  rmSync(ZIP_PATH, { force: true });
  const tar = spawnSync("tar", ["-a", "-c", "-f", ZIP_PATH, "-C", STAGING, "."], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr || tar.stdout}`);
  rmSync(STAGING, { recursive: true, force: true });

  const sha256 = sha256File(ZIP_PATH);
  const manifestPath = resolve(OUT, "phase6a1-professor-plan-audit-bundle-v8v8-manifest.json");
  writeFileSync(manifestPath, JSON.stringify({
    version: "phase6a1-professor-plan-audit-bundle-v8v8-manifest",
    generatedAt: new Date().toISOString(),
    artifact: "v8v8.zip",
    byteSha256: sha256,
    zipEntryCount: staged.length,
    includesRuntimeSnapshots: true,
    includesDevUpstreamFixtureCatalogAndAllFixtureBytes: true,
    includesCanonicalCatalogSlice: true,
    excludesAuthorityPrivate: true,
    entries: staged.map((e) => ({ zipPath: e.zipPath, sha256: sha256File(e.absPath) })),
  }, null, 2));
  console.log(JSON.stringify({ zipPath: ZIP_PATH, byteSha256: sha256, entryCount: staged.length, manifestPath }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
