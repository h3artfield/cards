#!/usr/bin/env npx tsx
/** Build architecture review bundle archv1.zip for independent review before pipeline population. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const WEB = resolve("scripts/..");
const OUT = resolve(WEB, "data/milestones/deck-synthesis");
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ZIP_PATH = resolve(OUT, "archv1.zip");
const STAGING = resolve(OUT, ".audit-bundle-archv1-staging");

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
    "phase6a1-professor-plan-functional-role-closure-architecture-clarification-v1.json",
    "phase6a1-professor-plan-prospective-pipeline-freeze-spec-v1.json",
    "phase6a1-professor-plan-v2-benchmark-disposition-v9-architecture.json",
    "phase6a1-professor-plan-post-gold-development-track-v9-architecture.json",
    "phase6a1-professor-plan-benchmark-architecture-sealed-manifest-v1.json",
    "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    "phase6a1-professor-plan-functional-role-closure-design-v3-status-precedence-v1.json",
    "phase6a1-semantic-closure-runtime-input-schema-v8.json",
    "phase6a1-benchmark-authority-access-boundary-evidence-v2.json",
    "phase6a1-professor-plan-v2-benchmark-disposition-v8.json",
    "phase6a1-professor-plan-functional-role-closure-v7-preimplementation-reaudit-gpt56sol-v1.json",
  ]) {
    stageFromOut(f, staged);
  }

  for (const rel of ["web/scripts/run-phase6a1-seal-benchmark-architecture-v1.ts"]) {
    stageFromRepo(rel, rel.replace(/\\/g, "/"), staged);
  }
  stageFromRepo(".gitignore", ".gitignore", staged);

  rmSync(ZIP_PATH, { force: true });
  const tar = spawnSync("tar", ["-a", "-c", "-f", ZIP_PATH, "-C", STAGING, "."], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr || tar.stdout}`);
  rmSync(STAGING, { recursive: true, force: true });

  const byteSha256 = sha256File(ZIP_PATH);
  const manifestPath = resolve(OUT, "phase6a1-professor-plan-audit-bundle-archv1-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-audit-bundle-archv1-manifest",
        generatedAt: new Date().toISOString(),
        artifact: "archv1.zip",
        byteSha256,
        zipEntryCount: staged.length,
        purpose: "Independent review of architecture clarification before holdout-prospective-pipeline-v1 Professor runs",
        excludesAuthorityPrivate: true,
        excludesBlindedAdjudication: true,
        excludesSyntheticV9Holdout: true,
        entries: staged.map((e) => ({ zipPath: e.zipPath, sha256: sha256File(e.absPath) })),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ zipPath: ZIP_PATH, byteSha256, entryCount: staged.length, manifestPath }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
