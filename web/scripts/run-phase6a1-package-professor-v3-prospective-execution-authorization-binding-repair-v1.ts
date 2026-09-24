#!/usr/bin/env npx tsx
/** Package Professor v3 prospective execution-authorization binding repair bundle v1. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PROFESSOR_V3_BINDING_REPAIR_DECISION_V1 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(
  MILESTONES,
  "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-v1.zip",
);
const OUT_MANIFEST = resolve(
  MILESTONES,
  "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-v1-manifest.json",
);

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v8.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v8.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v7.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v7.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v6.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-output-targets-v6.ts") },
  { bundlePath: "scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v3.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v3.ts") },
  { bundlePath: "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-korvold-prospective-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-korvold-prospective-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-prospective-execution-authorization-binding-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-prospective-execution-authorization-binding-repair-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-report-professor-v3-prospective-execution-authorization-binding-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-prospective-execution-authorization-binding-repair-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-package-professor-v3-prospective-execution-authorization-binding-repair-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-prospective-execution-authorization-binding-repair-v1.ts") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v7-korvold-prospective-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-identity-v7-korvold-prospective-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v7-korvold-prospective-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-pins-v7-korvold-prospective-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-prospective-execution-authorization-binding-repair-audit-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-audit-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-prospective-execution-authorization-binding-repair-report-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-report-v1.json") },
];

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function main() {
  for (const file of BUNDLE_FILES) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-prospective-execution-authorization-binding-repair-v1-staging");
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
    version: "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
    priorDecision: "PROFESSOR_V3_INCOMPLETE_RESPONSE_OUTPUT_BUDGET_REPAIR_V1_PASS_EXECUTION_AUTHORIZATION_BINDING_REPAIR_REQUIRED_NO_MODEL",
    incompleteResponseRepairV1: "PASS_SEALED",
    muldrothaSuccessorV3: "MUST_NOT_EXECUTE",
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
