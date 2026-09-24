#!/usr/bin/env npx tsx
/** Package Professor v3 smoke-readiness execution delta v2. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-v2.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-v2-manifest.json");

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  { bundlePath: "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-seal-professor-v3-smoke-execution-pins-v2.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-seal-professor-v3-smoke-execution-pins-v2.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-model-caller-v2.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v2.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-model-attempt-artifacts-v2.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-attempt-artifacts-v2.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v2.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v2.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v2.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v2.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v2.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v2.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-agent-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-model-caller-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-smoke-readiness-v2.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-smoke-readiness-v2.ts") },
  { bundlePath: "scripts/run-phase6a1-report-professor-v3-smoke-readiness-v2.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-smoke-readiness-v2.ts") },
  { bundlePath: "scripts/run-phase6a1-package-professor-v3-smoke-readiness-v2.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-smoke-readiness-v2.ts") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v2.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-pins-v2.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-readiness-audit-v2.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v2.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-readiness-report-v2.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-report-v2.json") },
];

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function main() {
  for (const file of BUNDLE_FILES) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-smoke-readiness-v2-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const files = BUNDLE_FILES.map((file) => {
    const dest = join(staging, file.bundlePath);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(file.sourcePath, dest);
    return { path: file.bundlePath, sha256: sha256File(dest), byteSize: statSync(dest).size };
  });
  rmSync(OUT_ZIP, { force: true });
  const zipResult = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${OUT_ZIP.replace(/'/g, "''")}' -Force`],
    { encoding: "utf8" },
  );
  if (zipResult.status !== 0) throw new Error(`Compress-Archive failed: ${zipResult.stderr || zipResult.stdout}`);
  const zipBytes = readFileSync(OUT_ZIP);
  const manifest = {
    version: "phase6a1-professor-v3-smoke-readiness-v2-manifest",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V2_EXECUTION_SEAL_AND_EXACT_IO_REQUIRED",
    priorDecision: "PROFESSOR_V3_ARCHITECTURE_V5_PASS_SMOKE_EXECUTION_READINESS_BLOCK_V1",
    executeRunner: "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts",
    executeSwitch: "--execute",
    fileCount: files.length,
    files,
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(zipBytes), byteSize: zipBytes.length },
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(manifest, null, 2));
}

main();
