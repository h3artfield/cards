#!/usr/bin/env npx tsx
/** Package Professor v3 spent-failure repair bundle v1. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-spent-failure-repair-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-spent-failure-repair-v1-manifest.json");

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  { bundlePath: "scripts/lib/phase6a1-professor-v3-plan-output-schema-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-plan-output-schema-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-rag-environment-identity-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-rag-environment-identity-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-contract-roundtrip-fixture-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-contract-roundtrip-fixture-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-prompt-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-prompt-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-model-caller-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-agent-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/professor-planning-contracts-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/professor-planning-contracts-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-spent-failure-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-spent-failure-repair-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-diagnose-professor-v3-muldrotha-rag-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-diagnose-professor-v3-muldrotha-rag-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-report-professor-v3-spent-failure-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-spent-failure-repair-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-package-professor-v3-spent-failure-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-spent-failure-repair-v1.ts") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-spent-failure-repair-audit-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-spent-failure-repair-audit-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-muldrotha-rag-diagnostic-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-muldrotha-rag-diagnostic-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-spent-failure-repair-report-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-spent-failure-repair-report-v1.json") },
];

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function main() {
  for (const file of BUNDLE_FILES) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-spent-failure-repair-v1-staging");
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
    version: "phase6a1-professor-v3-spent-failure-repair-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_SMOKE_V1_SPENT_FAIL_CONTRACT_SCHEMA_AND_RAG_ENVIRONMENT_REPAIR_REQUIRED_NO_MODEL",
    priorDecision: "PROFESSOR_V3_SMOKE_READINESS_V4_PASS_ONE_MULDROTHA_SMOKE_AUTHORIZED_WITH_EXTERNAL_SHA_PREFLIGHT",
    spentSmokePreserved: true,
    fileCount: files.length,
    files,
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(zipBytes), byteSize: zipBytes.length },
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(manifest, null, 2));
}

main();
