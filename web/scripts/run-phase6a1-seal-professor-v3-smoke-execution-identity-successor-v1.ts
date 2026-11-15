#!/usr/bin/env npx tsx
/** Seal reviewed Professor v3 successor smoke execution identity + pins v4. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V4_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH,
  assertProfessorV3SmokeExecutionIdentityV4,
  computeProfessorV3SmokeMaterialPinsV4,
  sealProfessorV3SmokeExecutionPinsV4,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v4";
import { computeDependencyManifestSha256 } from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const RUNNER_PATH = resolve(REPO, "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v1.ts");
const DECISION =
  "PROFESSOR_V3_SPENT_FAILURE_REPAIR_V1_BLOCK_STRUCTURED_OUTPUT_SCHEMA_API_INCOMPATIBLE_AND_SUCCESSOR_EXECUTION_DELTA_REQUIRED";

function main() {
  const executeRunnerSha256 = sha256File(RUNNER_PATH);
  const files = computeProfessorV3SmokeMaterialPinsV4();
  const dependencyManifestSha256 = computeDependencyManifestSha256(files);
  const sealed = sealProfessorV3SmokeExecutionPinsV4({ decision: DECISION });
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH, JSON.stringify(sealed, null, 2));
  const executionPinsArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH);

  const identity = {
    version: "phase6a1-professor-v3-smoke-execution-identity-v4-successor",
    decision: DECISION,
    stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v4-successor",
    executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v1.ts",
    executeRunnerSha256,
    executionPinsArtifactRelativePath:
      "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v4-successor.json",
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  };
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V4_PATH, JSON.stringify(identity, null, 2));

  assertProfessorV3SmokeExecutionIdentityV4({ identity });

  const authorizationV5Patch = {
    executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V4_PATH),
    executeRunnerSha256,
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  };

  console.log(
    JSON.stringify(
      {
        reviewedExecutionIdentity: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V4_PATH,
          sha256: authorizationV5Patch.executionIdentityArtifactSha256,
        },
        executionPinsArtifact: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH,
          sha256: executionPinsArtifactSha256,
        },
        executeRunner: { path: RUNNER_PATH, sha256: executeRunnerSha256 },
        dependencyManifestSha256,
        fileCount: sealed.fileCount,
        stackIdentity: sealed.stackIdentity,
        authorizationV5Patch,
      },
      null,
      2,
    ),
  );
}

main();
