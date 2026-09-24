#!/usr/bin/env npx tsx
/** Package small successor delta for pre-execution review v2 targeted repairs. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-serialization-pilot-pre-execution-review-v2-delta.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-serialization-pilot-pre-execution-review-v2-delta-manifest.json");

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-catalog-sourceversion-repair-gate-v1.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-catalog-sourceversion-repair-gate-v1.json"),
  },
  {
    bundlePath: "milestones/deck-synthesis/phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v2.json",
    sourcePath: resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v2.json"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1.ts"),
  },
  {
    bundlePath: "scripts/lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts",
    sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-run-serialization-pilot-v8.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-run-serialization-pilot-v8.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-report-serialization-pilot-pre-execution-hashes-v2.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-report-serialization-pilot-pre-execution-hashes-v2.ts"),
  },
  {
    bundlePath: "scripts/run-phase6a1-package-serialization-pilot-pre-execution-review-v2-delta.ts",
    sourcePath: resolve(WEB, "scripts/run-phase6a1-package-serialization-pilot-pre-execution-review-v2-delta.ts"),
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

  const staging = resolve(MILESTONES, ".review-bundle-v2-delta-staging");
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
    version: "phase6a1-serialization-pilot-pre-execution-review-v2-delta-manifest",
    generatedAt: new Date().toISOString(),
    decision: "SERIALIZATION_PILOT_PRE_EXECUTION_BLOCK_V2_TWO_TARGETED_ITEMS",
    purpose:
      "Successor delta for two targeted pre-execution repairs: catalog PASS pinned-container provenance and runtime-input-v8 schema validation gate.",
    supersedesInReviewBundleV2: {
      staleCatalogGateArtifact: "phase6a1-professor-plan-catalog-verifier-v2-pinned-container-gate-v1.json",
      staleCatalogGateDecision: "CATALOG_VERIFIER_V2_FAIL_CLOSED",
      replacementCatalogPassGateArtifact: "phase6a1-professor-plan-catalog-sourceversion-repair-gate-v1.json",
      replacementCatalogPassGateDecision: "CATALOG_VERIFIER_V2_PASS_AUTHORIZED_PILOT_NEXT",
      replacementVerifierArtifactSha256: "126ca7a4351f85ed8fc6e3ae337e746eed6a8197521aa0e8f3746b1a64013b50",
    },
    productPreservationNote:
      "serializationProvenance.requiredSemanticProjection preserves full Professor/validator semantics for downstream Closure/card selection; simplified lens/package fields must not become the sole source of truth.",
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
