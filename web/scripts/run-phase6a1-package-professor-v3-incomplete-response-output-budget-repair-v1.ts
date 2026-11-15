#!/usr/bin/env npx tsx
/** Package Professor v3 incomplete-response output-budget repair bundle v1. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-incomplete-response-output-budget-repair-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-incomplete-response-output-budget-repair-v1-manifest.json");
const DECISION = "PROFESSOR_V3_INCOMPLETE_RESPONSE_AND_OUTPUT_BUDGET_REPAIR_V1_AUTHORIZED_NO_MODEL";

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  { bundlePath: "scripts/lib/phase6a1-professor-v3-model-response-boundary-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-response-boundary-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-plan-output-schema-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-plan-output-schema-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-model-caller-v4.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v4.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-attempt-accounting-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-attempt-accounting-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v7.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v7.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v5.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v5.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v7.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v7.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v6.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v6.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-incomplete-response-fixture-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-incomplete-response-fixture-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-agent-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-model-attempt-artifacts-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-attempt-artifacts-v3.ts") },
  { bundlePath: "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v3.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v3.ts") },
  { bundlePath: "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-successor-v3.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-successor-v3.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-incomplete-response-output-budget-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-incomplete-response-output-budget-repair-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-report-professor-v3-incomplete-response-output-budget-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-incomplete-response-output-budget-repair-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-package-professor-v3-incomplete-response-output-budget-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-incomplete-response-output-budget-repair-v1.ts") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v6-successor-v3.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-identity-v6-successor-v3.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v6-successor-v3.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-pins-v6-successor-v3.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-incomplete-response-output-budget-repair-audit-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-incomplete-response-output-budget-repair-audit-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-incomplete-response-output-budget-repair-report-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-incomplete-response-output-budget-repair-report-v1.json") },
];

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function main() {
  for (const file of BUNDLE_FILES) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-incomplete-response-output-budget-repair-v1-staging");
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
    version: "phase6a1-professor-v3-incomplete-response-output-budget-repair-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: DECISION,
    priorDecision: "PROFESSOR_V3_SUCCESSOR_SCHEMA_REPAIR_V1_PASS_ONE_MULDROTHA_SUCCESSOR_V2_SMOKE_AUTHORIZED_WITH_EXTERNAL_ANCHORS",
    spentSuccessorSmokeV1Preserved: true,
    spentSuccessorSmokeV2Preserved: true,
    openAiCallsInThisBlock: 0,
    fileCount: files.length,
    files,
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(zipBytes), byteSize: zipBytes.length },
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(manifest, null, 2));
}

main();
