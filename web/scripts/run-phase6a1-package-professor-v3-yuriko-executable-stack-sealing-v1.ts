#!/usr/bin/env npx tsx
/** Package Yuriko executable-stack reseal bundle v1 — manifest included in ZIP. */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PROFESSOR_V3_YURIKO_PROSPECTIVE_STACK_RESEAL_DECISION_V1 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v10";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_ZIP = resolve(MILESTONES, "phase6a1-professor-v3-yuriko-executable-stack-sealing-v1.zip");
const OUT_MANIFEST = resolve(MILESTONES, "phase6a1-professor-v3-yuriko-executable-stack-sealing-v1-manifest.json");
const MANIFEST_BUNDLE_PATH = "milestones/deck-synthesis/phase6a1-professor-v3-yuriko-executable-stack-sealing-v1-manifest.json";

const BUNDLE_FILES: Array<{ bundlePath: string; sourcePath: string }> = [
  { bundlePath: "scripts/lib/phase6a1-professor-v3-yuriko-prospective-smoke-execution-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-yuriko-prospective-smoke-execution-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-yuriko-model-request-boundary-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-yuriko-model-request-boundary-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-yuriko-orchestration-success-fixture-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-yuriko-orchestration-success-fixture-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-yuriko-pre-model-audit-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-yuriko-pre-model-audit-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v10.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v10.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v9.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-material-pins-v9.ts") },
  { bundlePath: "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v9.ts", sourcePath: resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-failure-seal-v9.ts") },
  { bundlePath: "scripts/run-phase6a1-execute-smoke-professor-v3-yuriko-prospective-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-execute-smoke-professor-v3-yuriko-prospective-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-yuriko-executable-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-seal-professor-v3-smoke-execution-identity-yuriko-executable-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-test-professor-v3-yuriko-executable-stack-sealing-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-test-professor-v3-yuriko-executable-stack-sealing-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-report-professor-v3-yuriko-executable-stack-sealing-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-report-professor-v3-yuriko-executable-stack-sealing-v1.ts") },
  { bundlePath: "scripts/run-phase6a1-package-professor-v3-yuriko-executable-stack-sealing-v1.ts", sourcePath: resolve(WEB, "scripts/run-phase6a1-package-professor-v3-yuriko-executable-stack-sealing-v1.ts") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-identity-v9-yuriko-executable-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-identity-v9-yuriko-executable-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-yuriko-prospective-mechanism-truth-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-yuriko-prospective-mechanism-truth-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-yuriko-executable-stack-sealing-audit-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-yuriko-executable-stack-sealing-audit-v1.json") },
  { bundlePath: "milestones/deck-synthesis/phase6a1-professor-v3-yuriko-executable-stack-sealing-report-v1.json", sourcePath: resolve(MILESTONES, "phase6a1-professor-v3-yuriko-executable-stack-sealing-report-v1.json") },
];

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

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
  const staging = resolve(MILESTONES, ".review-bundle-professor-v3-yuriko-executable-stack-sealing-v1-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const files = stageBundleFiles(staging);
  const pinsPath = resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1.json");
  const pins = JSON.parse(readFileSync(pinsPath, "utf8")) as {
    dependencyManifestSha256: string;
    fileCount: number;
    files: Array<{ label: string; path: string; sha256: string }>;
  };
  const liveRootPath = resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts");

  const manifestDraft = {
    version: "phase6a1-professor-v3-yuriko-executable-stack-sealing-v1-manifest",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
    bindingRepairV1: "PASS_SEALED",
    yurikoProspectiveModelSmoke: "NOT_YET_AUTHORIZED",
    openAiCallsInThisBlock: 0,
    fileCount: files.length + 1,
    files,
    externalAuthorizationRoot: {
      relativePath: "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts",
      sha256: sha256File(liveRootPath),
      note: "Excluded from dependency closure; runner imports this external root only.",
    },
    dependencyClosure: {
      manifestSha256: pins.dependencyManifestSha256,
      fileCount: pins.fileCount,
      files: pins.files,
    },
  };
  writeFileSync(join(staging, MANIFEST_BUNDLE_PATH), JSON.stringify(manifestDraft, null, 2));
  const manifestInStaging = {
    path: MANIFEST_BUNDLE_PATH,
    sha256: sha256File(join(staging, MANIFEST_BUNDLE_PATH)),
    byteSize: statSync(join(staging, MANIFEST_BUNDLE_PATH)).size,
  };

  const zipBytes = writeZip(staging, OUT_ZIP);
  const manifest = {
    ...manifestDraft,
    fileCount: files.length + 1,
    files: [...files, manifestInStaging],
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(zipBytes), byteSize: zipBytes.length },
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  cpSync(OUT_MANIFEST, join(staging, MANIFEST_BUNDLE_PATH));
  const finalZipBytes = writeZip(staging, OUT_ZIP);
  const finalManifest = {
    ...manifest,
    zip: { artifact: basename(OUT_ZIP), sha256: sha256Bytes(finalZipBytes), byteSize: finalZipBytes.length },
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(finalManifest, null, 2));

  rmSync(staging, { recursive: true, force: true });
  console.log(JSON.stringify(finalManifest, null, 2));
}

main();
