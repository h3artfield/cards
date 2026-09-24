#!/usr/bin/env npx tsx
/** Package Chatterfang prospective stack reseal review bundle v1. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_STACK_RESEAL_DECISION_V1 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-prospective-stack-reseal-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-prospective-stack-reseal-v1-manifest.json");
const MANIFEST_BUNDLE_PATH = "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-prospective-stack-reseal-v1-manifest.json";

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  { bundlePath: "src/lib/deck-synthesis/grounding-derivation-graph-v1.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/grounding-derivation-graph-v1.ts") },
  { bundlePath: "src/lib/deck-synthesis/typed-assertion-grounding-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/typed-assertion-grounding-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/strategy-package-validator-v3.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/strategy-package-validator-v3.ts") },
  { bundlePath: "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts", sourcePath: resolve(WEB, "src/lib/deck-synthesis/professor-v3-run-ledger-v1.ts") },
  { bundlePath: "src/lib/deck-intelligence/mtg-knowledge-service.ts", sourcePath: resolve(WEB, "src/lib/deck-intelligence/mtg-knowledge-service.ts") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-generic-grounding-derivation-repair-audit-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-generic-grounding-derivation-repair-audit-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-chatterfang-prospective-stack-reseal-audit-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-prospective-stack-reseal-audit-v1.json") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-agent-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-agent-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-plan-context-builder-v3.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-attempt-accounting-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-attempt-accounting-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-chatterfang-pre-model-audit-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-chatterfang-pre-model-audit-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v11.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v11.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-chatterfang-prospective-stack-reseal-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-chatterfang-prospective-stack-reseal-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-execute-smoke-professor-v3-chatterfang-prospective-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-chatterfang-prospective-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts") },
];

function stageBundleFiles(staging: string) {
  return BUNDLE_FILES.map((file) => {
    const dest = join(staging, file.bundlePath);
    mkdirSync(join(dest, ".."), { recursive: true });
    cpSync(file.sourcePath, dest);
    return { path: file.bundlePath, sha256: sha256File(dest), byteSize: statSync(dest).size };
  });
}

function writeZip(staging: string, zipPath: string) {
  rmSync(zipPath, { force: true });
  const zipResult = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`],
    { encoding: "utf8" },
  );
  if (zipResult.status !== 0) throw new Error(`Compress-Archive failed: ${zipResult.stderr || zipResult.stdout}`);
  return readFileSync(zipPath);
}

function main() {
  for (const file of BUNDLE_FILES) {
    if (!existsSync(file.sourcePath)) throw new Error(`Missing bundle source: ${file.sourcePath}`);
  }
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-chatterfang-prospective-stack-reseal-v1-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const files = stageBundleFiles(staging);
  const liveRootPath = resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts");
  const manifestDraft = {
    version: "phase6a1-professor-v3-chatterfang-prospective-stack-reseal-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
    chatterfangProspectiveModelSmoke: "NOT_YET_AUTHORIZED",
    openAiCallsInThisBlock: 0,
    fileCount: files.length + 1,
    files,
    externalAuthorizationRoot: {
      relativePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts",
      sha256: sha256File(liveRootPath),
      note: "Live root remains NO_MODEL until real Chatterfang smoke is independently authorized.",
    },
  };
  writeFileSync(join(staging, MANIFEST_BUNDLE_PATH), JSON.stringify(manifestDraft, null, 2));
  const zipBytes = writeZip(staging, OUT_ZIP);
  const zipManifest = {
    ...manifestDraft,
    zip: {
      path: basename(OUT_ZIP),
      sha256: createHash("sha256").update(zipBytes).digest("hex"),
      byteSize: zipBytes.length,
    },
  };
  writeFileSync(OUT_MANIFEST, `${JSON.stringify(zipManifest, null, 2)}\n`, "utf8");
  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify({ zip: OUT_ZIP, manifest: OUT_MANIFEST, pass: true }, null, 2));
}

main();
