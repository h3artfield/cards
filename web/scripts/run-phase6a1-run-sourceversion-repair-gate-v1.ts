#!/usr/bin/env npx tsx
/**
 * SOURCEVERSION_METADATA_REPAIR_AUTHORIZED_293_ONLY gate:
 * 1) repair 293 docs (host, Firestore write)
 * 2) post-repair read-only verification (pinned container)
 * 3) catalog verifier v2 (pinned container)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  MILESTONES,
  REPO,
  WEB,
  buildFilteredEnvFile,
  buildImplementationExecutionTree,
  cleanupStagingRoot,
  runInPinnedImplementationContainer,
  sha256File,
} from "./lib/phase6a1-pinned-implementation-container-v1";

const REPAIR_SCRIPT = resolve(WEB, "scripts/run-phase6a1-repair-catalog-sourceversion-metadata-v1.ts");
const POST_REPAIR_SCRIPT = "scripts/run-phase6a1-verify-catalog-sourceversion-post-repair-v1.ts";
const VERIFIER_SCRIPT = "scripts/run-phase6a1-verify-pinned-catalog-data-state-v2.ts";

const REPAIR_MANIFEST = "phase6a1-professor-plan-catalog-sourceversion-repair-manifest-v1.json";
const POST_REPAIR_ARTIFACT = "phase6a1-professor-plan-catalog-sourceversion-post-repair-verification-v1.json";
const VERIFIER_ARTIFACT = "phase6a1-professor-plan-catalog-data-state-verification-v2.json";
const GATE_ARTIFACT = "phase6a1-professor-plan-catalog-sourceversion-repair-gate-v1.json";

function runGit(args: string[]): string {
  const result = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return (result.stdout ?? "").trim();
}

function runHostTsx(scriptAbsPath: string): { exitCode: number | null; stdout: string; stderr: string } {
  const result = spawnSync("npx", ["tsx", scriptAbsPath], {
    cwd: WEB,
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    exitCode: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function copyArtifactOut(name: string, artifactOutDir: string): void {
  const src = resolve(artifactOutDir, name);
  const dest = resolve(MILESTONES, name);
  if (existsSync(src) && !existsSync(dest)) copyFileSync(src, dest);
}

async function main() {
  const artifactOutDir = resolve(MILESTONES, ".pinned-container-artifact-out");
  mkdirSync(artifactOutDir, { recursive: true });

  const steps: Array<Record<string, unknown>> = [];

  if (!existsSync(resolve(MILESTONES, REPAIR_MANIFEST))) {
    const repair = runHostTsx(REPAIR_SCRIPT);
    steps.push({ step: "repair", exitCode: repair.exitCode, stderrTail: repair.stderr.slice(-2000) });
    if (repair.exitCode !== 0) {
      writeGate(steps, "REPAIR_FAIL_CLOSED", null, null);
      process.exit(1);
    }
  } else {
    steps.push({ step: "repair", status: "ALREADY_PRESENT", sha256: sha256File(resolve(MILESTONES, REPAIR_MANIFEST)) });
  }

  const staging = buildImplementationExecutionTree();
  const envFilePath = buildFilteredEnvFile(["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_KEY"], false);

  if (!existsSync(resolve(MILESTONES, POST_REPAIR_ARTIFACT))) {
    const postRepair = runInPinnedImplementationContainer({
      stagingTreeRoot: staging.stagingTreeRoot,
      artifactOutDir,
      envFilePath,
      scriptRelFromWeb: POST_REPAIR_SCRIPT,
      treeManifestSha256: staging.treeManifestSha256,
      treeFileCount: staging.treeFileCount,
    });
    copyArtifactOut(POST_REPAIR_ARTIFACT, artifactOutDir);
    steps.push({
      step: "postRepairVerification",
      exitCode: postRepair.exitCode,
      stderrTail: postRepair.stderr.slice(-2000),
      boundary: postRepair.boundary,
    });
    if (postRepair.exitCode !== 0) {
      cleanupStagingRoot(staging.stagingRoot);
      writeGate(steps, "POST_REPAIR_VERIFICATION_FAIL_CLOSED", null, postRepair.boundary);
      process.exit(1);
    }
  } else {
    steps.push({
      step: "postRepairVerification",
      status: "ALREADY_PRESENT",
      sha256: sha256File(resolve(MILESTONES, POST_REPAIR_ARTIFACT)),
    });
  }

  let verifierBoundary: Record<string, unknown> | null = null;
  if (!existsSync(resolve(MILESTONES, VERIFIER_ARTIFACT))) {
    const verifier = runInPinnedImplementationContainer({
      stagingTreeRoot: staging.stagingTreeRoot,
      artifactOutDir,
      envFilePath,
      scriptRelFromWeb: VERIFIER_SCRIPT,
      treeManifestSha256: staging.treeManifestSha256,
      treeFileCount: staging.treeFileCount,
    });
    copyArtifactOut(VERIFIER_ARTIFACT, artifactOutDir);
    verifierBoundary = verifier.boundary as unknown as Record<string, unknown>;
    steps.push({
      step: "catalogVerifierV2",
      exitCode: verifier.exitCode,
      stderrTail: verifier.stderr.slice(-2000),
      boundary: verifier.boundary,
    });
    cleanupStagingRoot(staging.stagingRoot);
    if (verifier.exitCode !== 0) {
      writeGate(steps, "CATALOG_VERIFIER_V2_FAIL_CLOSED", null, verifierBoundary);
      process.exit(1);
    }
  } else {
    cleanupStagingRoot(staging.stagingRoot);
    steps.push({
      step: "catalogVerifierV2",
      status: "ALREADY_PRESENT",
      sha256: sha256File(resolve(MILESTONES, VERIFIER_ARTIFACT)),
    });
  }

  writeGate(steps, "CATALOG_VERIFIER_V2_PASS_AUTHORIZED_PILOT_NEXT", sha256File(resolve(MILESTONES, VERIFIER_ARTIFACT)), verifierBoundary);
}

function writeGate(
  steps: Array<Record<string, unknown>>,
  decision: string,
  verifierSha256: string | null,
  boundary: Record<string, unknown> | null,
): void {
  const gatePath = resolve(MILESTONES, GATE_ARTIFACT);
  if (existsSync(gatePath)) {
    console.log(readFileSync(gatePath, "utf8"));
    return;
  }
  const gate = {
    version: "phase6a1-professor-plan-catalog-sourceversion-repair-gate-v1",
    generatedAt: new Date().toISOString(),
    authorization: "SOURCEVERSION_METADATA_REPAIR_AUTHORIZED_293_ONLY",
    decision,
    repositoryIdentity: {
      gitHead: runGit(["rev-parse", "HEAD"]),
      gitBranch: runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
    },
    artifacts: {
      repairManifest: existsSync(resolve(MILESTONES, REPAIR_MANIFEST))
        ? { artifact: REPAIR_MANIFEST, sha256: sha256File(resolve(MILESTONES, REPAIR_MANIFEST)) }
        : null,
      postRepairVerification: existsSync(resolve(MILESTONES, POST_REPAIR_ARTIFACT))
        ? { artifact: POST_REPAIR_ARTIFACT, sha256: sha256File(resolve(MILESTONES, POST_REPAIR_ARTIFACT)) }
        : null,
      catalogVerifierV2: existsSync(resolve(MILESTONES, VERIFIER_ARTIFACT))
        ? { artifact: VERIFIER_ARTIFACT, sha256: sha256File(resolve(MILESTONES, VERIFIER_ARTIFACT)) }
        : null,
    },
    steps,
    boundary,
    instruction: decision.includes("PASS") ? "AUTHORIZED_SERIALIZATION_PILOT_IN_SAME_BOUNDARY" : "REPORT_AND_WAIT",
  };
  writeFileSync(gatePath, JSON.stringify(gate, null, 2));
  console.log(JSON.stringify(gate, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
