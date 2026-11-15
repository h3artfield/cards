#!/usr/bin/env npx tsx
/** Package gate-v2 write-once orchestration evidence repair delta. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-serialization-pilot-orchestration-gate-evidence-repair-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-serialization-pilot-orchestration-gate-evidence-repair-v1-manifest.json");

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  {
    bundlePath: "scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-report-serialization-pilot-pre-execution-hashes-v2.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-report-serialization-pilot-pre-execution-hashes-v2.ts"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v2.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v2.json"),
  },
  {
    bundlePath: "scripts/run-phase6a1-package-serialization-pilot-orchestration-gate-evidence-repair-v1.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-package-serialization-pilot-orchestration-gate-evidence-repair-v1.ts"),
  },
];

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function main() {
  for (const file of BUNDLE_FILES) {
    if (!existsSync(file.sourcePath)) {
      throw new Error(`Missing bundle source: ${file.sourcePath}`);
    }
  }

  const staging = resolve(MILESTONES, ".orchestration-gate-evidence-repair-v1-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const files = BUNDLE_FILES.map((file) => {
    const dest = join(staging, file.bundlePath);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(file.sourcePath, dest);
    return {
      path: file.bundlePath,
      sha256: sha256File(dest),
      byteSize: statSync(dest).size,
    };
  });

  rmSync(OUT_ZIP, { force: true });
  const zipResult = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${OUT_ZIP.replace(/'/g, "''")}' -Force`,
    ],
    { encoding: "utf8" },
  );
  if (zipResult.status !== 0) {
    throw new Error(`Compress-Archive failed: ${zipResult.stderr || zipResult.stdout}`);
  }

  const zipBytes = readFileSync(OUT_ZIP);
  const manifest = {
    version: "phase6a1-serialization-pilot-orchestration-gate-evidence-repair-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: "SERIALIZATION_PILOT_ORCHESTRATION_REPAIR_BLOCK_V1_GATE_EVIDENCE_TARGET",
    purpose:
      "Gate-v2 write-once orchestration repair: preserve historical failed gate-v1; next execution writes exclusive gate-v2 evidence.",
    preservedHistoricalArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v1.json",
    successorExecutionGateArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json",
    fileCount: files.length,
    files,
    zip: {
      artifact: basename(OUT_ZIP),
      sha256: sha256Bytes(zipBytes),
      byteSize: zipBytes.length,
    },
  };

  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(manifest, null, 2));
}

main();
