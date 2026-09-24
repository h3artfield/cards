#!/usr/bin/env npx tsx
/** Seal reviewed Professor v3 successor smoke v3 execution identity + pins v6. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V6_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V6_PATH,
  assertProfessorV3SmokeExecutionIdentityV6,
  computeProfessorV3SmokeMaterialPinsV6,
  sealProfessorV3SmokeExecutionPinsV6,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v6";
import { computeDependencyManifestSha256 } from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const RUNNER_PATH = resolve(REPO, "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v3.ts");
const DECISION = "PROFESSOR_V3_INCOMPLETE_RESPONSE_AND_OUTPUT_BUDGET_REPAIR_V1_AUTHORIZED_NO_MODEL";

function main() {
  const executeRunnerSha256 = sha256File(RUNNER_PATH);
  const files = computeProfessorV3SmokeMaterialPinsV6();
  const dependencyManifestSha256 = computeDependencyManifestSha256(files);
  const sealed = sealProfessorV3SmokeExecutionPinsV6({ decision: DECISION });
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V6_PATH, JSON.stringify(sealed, null, 2));
  const executionPinsArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V6_PATH);

  const identity = {
    version: "phase6a1-professor-v3-smoke-execution-identity-v6-successor-v3",
    decision: DECISION,
    stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v6-successor-v3",
    executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-muldrotha-successor-v3.ts",
    executeRunnerSha256,
    executionPinsArtifactRelativePath:
      "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v6-successor-v3.json",
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  };
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V6_PATH, JSON.stringify(identity, null, 2));
  assertProfessorV3SmokeExecutionIdentityV6({ identity });

  console.log(
    JSON.stringify(
      {
        reviewedExecutionIdentity: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V6_PATH,
          sha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V6_PATH),
        },
        executionPinsArtifact: { path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V6_PATH, sha256: executionPinsArtifactSha256 },
        executeRunner: { path: RUNNER_PATH, sha256: executeRunnerSha256 },
        dependencyManifestSha256,
        authorizationV7Patch: {
          executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V6_PATH),
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
