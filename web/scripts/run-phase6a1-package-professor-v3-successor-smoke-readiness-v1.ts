#!/usr/bin/env npx tsx
/** Package Professor v3 successor smoke readiness bundle v1. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-successor-smoke-readiness-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-successor-smoke-readiness-v1-manifest.json");

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  { bundlePath: "scripts/lib/phase6a1-professor-v3-plan-output-schema-v2.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-plan-output-schema-v2.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v5.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v5.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v4.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v4.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v5.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v5.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-successor-rag-preflight-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-successor-rag-preflight-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-model-caller-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-model-caller-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-prompt-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-prompt-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prompt-payload-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-agent-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-normalizer-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts") },
  { bundlePath: "scripts/lib/script-env.ts", sourcePath: resolve(WEB, "scripts/lib/script-env.ts") },
  { bundlePath: "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-successor-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-successor-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-successor-smoke-readiness-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-successor-smoke-readiness-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-report-professor-v3-successor-smoke-readiness-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-successor-smoke-readiness-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-package-professor-v3-successor-smoke-readiness-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-successor-smoke-readiness-v1.ts") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v4-successor.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-identity-v4-successor.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v4-successor.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-pins-v4-successor.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-successor-smoke-readiness-audit-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-successor-smoke-readiness-audit-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-successor-smoke-readiness-report-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-successor-smoke-readiness-report-v1.json") },
];

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function main() {
  for (const file of BUNDLE_FILES) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-successor-smoke-readiness-v1-staging");
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
    version: "phase6a1-professor-v3-successor-smoke-readiness-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision:
      "PROFESSOR_V3_SPENT_FAILURE_REPAIR_V1_BLOCK_STRUCTURED_OUTPUT_SCHEMA_API_INCOMPATIBLE_AND_SUCCESSOR_EXECUTION_DELTA_REQUIRED",
    priorDecision: "PROFESSOR_V3_SMOKE_V1_SPENT_FAIL_CONTRACT_SCHEMA_AND_RAG_ENVIRONMENT_REPAIR_REQUIRED_NO_MODEL",
    spentSmokePreserved: true,
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
