#!/usr/bin/env npx tsx
/** Package semantic-opportunity repair review delta v2 — includes material source bytes and diff. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-serialization-pilot-semantic-opportunity-repair-review-v2.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-serialization-pilot-semantic-opportunity-repair-review-v2-manifest.json");

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json",
    sourcePath: resolve(MILESTONES, "phase6a1-spent-pilot-semantic-opportunity-supplement-v2.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-spent-pilot-opportunity-coverage-audit-v2.json",
    sourcePath: resolve(MILESTONES, "phase6a1-spent-pilot-opportunity-coverage-audit-v2.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-spent-pilot-normalizer-satisfiability-audit-v2.json",
    sourcePath: resolve(MILESTONES, "phase6a1-spent-pilot-normalizer-satisfiability-audit-v2.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-context-preflight-audit-v1.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-context-preflight-audit-v1.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-serialization-pilot-material-source-diff-v1.json",
    sourcePath: resolve(MILESTONES, "phase6a1-serialization-pilot-material-source-diff-v1.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v4.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v4.json"),
  },
  {
    bundlePath: "scripts/run-phase6a1-run-serialization-pilot-v8.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-run-serialization-pilot-v8.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-serialization-pilot-v8-config-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-semantic-opportunity-fidelity-audit-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-semantic-opportunity-fidelity-audit-v1.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-context-preflight-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-preflight-v1.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-agent-v2.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v2.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v4-diagnostic-capture-v1.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v4-diagnostic-capture-v1.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-audit-spent-pilot-opportunity-coverage-v2.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-audit-spent-pilot-opportunity-coverage-v2.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-report-serialization-pilot-material-source-diff-v1.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-report-serialization-pilot-material-source-diff-v1.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-report-serialization-pilot-pre-execution-hashes-v4.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-report-serialization-pilot-pre-execution-hashes-v4.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-package-serialization-pilot-semantic-opportunity-repair-review-v2.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-package-serialization-pilot-semantic-opportunity-repair-review-v2.ts"),
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

  const staging = resolve(MILESTONES, ".review-bundle-semantic-opportunity-repair-v2-staging");
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
    version: "phase6a1-serialization-pilot-semantic-opportunity-repair-review-v2-manifest",
    generatedAt: new Date().toISOString(),
    decision: "SEMANTIC_OPPORTUNITY_REPAIR_REVIEW_BLOCK_V1_FOUR_TARGETED_ITEMS",
    purpose:
      "Targeted repair delta v2: source-faithful opportunity semantics, structural fact-family rules, material runner/config bytes with old→new diff, hardened gate-v4 prechecks.",
    supersedesReviewBundle: "phase6a1-serialization-pilot-semantic-opportunity-repair-review-v1.zip",
    fileCount: files.length,
    files,
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(zipBytes), byteSize: zipBytes.length },
  };

  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(manifest, null, 2));
}

main();
