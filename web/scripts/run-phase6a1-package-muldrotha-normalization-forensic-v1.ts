#!/usr/bin/env npx tsx
/** Package Muldrotha normalization forensic review bundle. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-plan-muldrotha-normalization-forensic-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-plan-muldrotha-normalization-forensic-v1-manifest.json");

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-muldrotha-normalization-forensic-v1.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-muldrotha-normalization-forensic-v1.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v3.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v3.json"),
  },
  {
    bundlePath:
      "milestones/deck-synthesis/phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stdout-v1.txt",
    sourcePath: resolve(
      MILESTONES,
      "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stdout-v1.txt",
    ),
  },
  {
    bundlePath:
      "milestones/deck-synthesis/phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stderr-v1.txt",
    sourcePath: resolve(
      MILESTONES,
      "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stderr-v1.txt",
    ),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-agent-v2.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v2.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-normalizer-v2.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-normalizer-v2.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-prompt-v2.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-prompt-v2.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-context-builder-v2.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-builder-v2.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-serialization-pilot-v8-config-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-run-serialization-pilot-v8.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-run-serialization-pilot-v8.ts"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-model-pin-v2.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-model-pin-v2.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json",
    sourcePath: resolve(MILESTONES, "phase6a1-spent-pilot-commander-mechanism-truth-supplement-v1.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-spent-pilot-semantic-opportunity-supplement-v1.json",
    sourcePath: resolve(MILESTONES, "phase6a1-spent-pilot-semantic-opportunity-supplement-v1.json"),
  },
  {
    bundlePath: "src/lib/deck-synthesis/strategy-package-validator-v2.ts",
    sourcePath: resolve(WEB, "src/lib/deck-synthesis/strategy-package-validator-v2.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-report-muldrotha-normalization-forensic-v1.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-report-muldrotha-normalization-forensic-v1.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-package-muldrotha-normalization-forensic-v1.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-package-muldrotha-normalization-forensic-v1.ts"),
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

  const staging = resolve(MILESTONES, ".muldrotha-normalization-forensic-v1-staging");
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
    version: "phase6a1-professor-plan-muldrotha-normalization-forensic-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_NORMALIZATION_INVESTIGATION_AUTHORIZED_NO_MODEL_RERUN",
    purpose:
      "Offline forensic bundle for pilot-dev36-08 Muldrotha NORMALIZATION_FAILURE. Root cause: empty frozen semantic opportunity universe vs non-empty semanticOpportunityIds normalizer invariant.",
    rootCauseClassification: "NORMALIZATION_INVARIANT_IMPOSSIBILITY_EMPTY_FROZEN_SEMANTIC_OPPORTUNITY_UNIVERSE",
    rawModelResponsesPersisted: false,
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
