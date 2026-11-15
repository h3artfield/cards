#!/usr/bin/env npx tsx
/** Seal reviewed Professor v3 smoke execution identity JSON + pins v3. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH,
  assertProfessorV3SmokeExecutionIdentityV3,
  computeDependencyManifestSha256,
  computeProfessorV3SmokeMaterialPins,
  sealProfessorV3SmokeExecutionPinsV3,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const RUNNER_PATH = resolve(REPO, "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts");

function main() {
  const executeRunnerSha256 = sha256File(RUNNER_PATH);
  const files = computeProfessorV3SmokeMaterialPins();
  const dependencyManifestSha256 = computeDependencyManifestSha256(files);
  const sealed = sealProfessorV3SmokeExecutionPinsV3();
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH, JSON.stringify(sealed, null, 2));
  const executionPinsArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH);

  const identity = {
    version: "phase6a1-professor-v3-smoke-execution-identity-v3",
    decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V4_INITIAL_RAG_AND_FAILURE_SEAL_CLOSURE_REQUIRED",
    stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v3",
    executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts",
    executeRunnerSha256,
    executionPinsArtifactRelativePath: "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v3.json",
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  };
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH, JSON.stringify(identity, null, 2));

  assertProfessorV3SmokeExecutionIdentityV3({ identity });

  console.log(
    JSON.stringify(
      {
        reviewedExecutionIdentity: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH,
          sha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH),
        },
        executionPinsArtifact: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH,
          sha256: executionPinsArtifactSha256,
        },
        executeRunner: {
          path: RUNNER_PATH,
          sha256: executeRunnerSha256,
        },
        dependencyManifestSha256,
        fileCount: sealed.fileCount,
        stackIdentity: sealed.stackIdentity,
        pinnedLabels: sealed.files.map((f) => f.label),
      },
      null,
      2,
    ),
  );
}

main();
