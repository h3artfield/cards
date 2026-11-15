#!/usr/bin/env npx tsx
/** Seal reviewed Professor v3 successor smoke v2 execution identity + pins v5. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V5_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V5_PATH,
  assertProfessorV3SmokeExecutionIdentityV5,
  computeProfessorV3SmokeMaterialPinsV5,
  sealProfessorV3SmokeExecutionPinsV5,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v5";
import { computeDependencyManifestSha256 } from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const RUNNER_PATH = resolve(REPO, "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v2.ts");
const DECISION = "PROFESSOR_V3_SUCCESSOR_SMOKE_V1_SPENT_FAIL_API_SCHEMA_TYPE_ANNOTATION_REPAIR_REQUIRED_NO_MODEL";

function main() {
  const executeRunnerSha256 = sha256File(RUNNER_PATH);
  const files = computeProfessorV3SmokeMaterialPinsV5();
  const dependencyManifestSha256 = computeDependencyManifestSha256(files);
  const sealed = sealProfessorV3SmokeExecutionPinsV5({ decision: DECISION });
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V5_PATH, JSON.stringify(sealed, null, 2));
  const executionPinsArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V5_PATH);

  const identity = {
    version: "phase6a1-professor-v3-smoke-execution-identity-v5-successor-v2",
    decision: DECISION,
    stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v5-successor-v2",
    executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v2.ts",
    executeRunnerSha256,
    executionPinsArtifactRelativePath:
      "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v5-successor-v2.json",
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  };
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V5_PATH, JSON.stringify(identity, null, 2));
  assertProfessorV3SmokeExecutionIdentityV5({ identity });

  console.log(
    JSON.stringify(
      {
        reviewedExecutionIdentity: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V5_PATH,
          sha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V5_PATH),
        },
        executionPinsArtifact: { path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V5_PATH, sha256: executionPinsArtifactSha256 },
        executeRunner: { path: RUNNER_PATH, sha256: executeRunnerSha256 },
        dependencyManifestSha256,
        authorizationV6Patch: {
          executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V5_PATH),
          executeRunnerSha256,
          executionPinsArtifactSha256,
          dependencyManifestSha256,
        },
      },
      null,
      2,
    ),
  );
}

main();
