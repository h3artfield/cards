#!/usr/bin/env npx tsx
/** Run catalog verifier v2 inside ACL v2 pinned Docker boundary; preserve write-once artifact. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  MILESTONES,
  REPO,
  buildFilteredEnvFile,
  buildImplementationExecutionTree,
  cleanupStagingRoot,
  runInPinnedImplementationContainer,
  sha256File,
} from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const VERIFIER_SCRIPT = "scripts/run-phase6a1-verify-pinned-catalog-data-state-v2.ts";
const OUTPUT_NAME = "phase6a1-professor-plan-catalog-data-state-verification-v2.json";
const OUTPUT_HOST = resolve(MILESTONES, OUTPUT_NAME);
const GATE_REPORT = resolve(MILESTONES, "phase6a1-professor-plan-catalog-verifier-v2-pinned-container-gate-v1.json");

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return (result.stdout ?? "").trim();
}

async function main() {
  if (existsSync(OUTPUT_HOST)) {
    console.log(JSON.stringify({ status: "ALREADY_PRESENT", outputPath: OUTPUT_HOST, sha256: sha256File(OUTPUT_HOST) }, null, 2));
    return;
  }

  const staging = buildImplementationExecutionTree();
  const artifactOutDir = resolve(MILESTONES, ".pinned-container-artifact-out");
  mkdirSync(artifactOutDir, { recursive: true });
  const envFilePath = buildFilteredEnvFile(["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_KEY"], false);

  const container = runInPinnedImplementationContainer({
    stagingTreeRoot: staging.stagingTreeRoot,
    artifactOutDir,
    envFilePath,
    scriptRelFromWeb: VERIFIER_SCRIPT,
    treeManifestSha256: staging.treeManifestSha256,
    treeFileCount: staging.treeFileCount,
  });

  cleanupStagingRoot(staging.stagingRoot);

  const containerOutput = resolve(artifactOutDir, OUTPUT_NAME);
  if (container.exitCode === 0 && existsSync(containerOutput) && !existsSync(OUTPUT_HOST)) {
    copyFileSync(containerOutput, OUTPUT_HOST);
  }

  const pass = container.exitCode === 0 && existsSync(OUTPUT_HOST);
  const gate = {
    version: "phase6a1-professor-plan-catalog-verifier-v2-pinned-container-gate-v1",
    generatedAt: new Date().toISOString(),
    decision: pass ? "CATALOG_VERIFIER_V2_PASS_FAIL_CLOSED" : "CATALOG_VERIFIER_V2_FAIL_CLOSED",
    repositoryIdentity: {
      gitHead: runGit(["rev-parse", "HEAD"]),
      gitBranch: runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
    },
    boundary: container.boundary,
    verifierArtifact: OUTPUT_NAME,
    verifierArtifactSha256: existsSync(OUTPUT_HOST) ? sha256File(OUTPUT_HOST) : null,
    containerExitCode: container.exitCode,
    containerStderrTail: container.stderr.slice(-4000),
    instruction: pass ? "AUTHORIZED_TO_RUN_SERIALIZATION_PILOT_IN_SAME_BOUNDARY" : "REPORT_AND_WAIT",
  };

  if (!existsSync(GATE_REPORT)) {
    writeFileSync(GATE_REPORT, JSON.stringify(gate, null, 2));
  }

  console.log(JSON.stringify(gate, null, 2));
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
