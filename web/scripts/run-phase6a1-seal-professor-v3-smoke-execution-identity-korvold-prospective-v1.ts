#!/usr/bin/env npx tsx
/** Seal reviewed Professor v3 Korvold prospective execution identity + pins v7. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH,
  assertProfessorV3SmokeExecutionIdentityV7,
  computeProfessorV3SmokeMaterialPinsV7,
  sealProfessorV3SmokeExecutionPinsV7,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v7";
import { PROFESSOR_V3_BINDING_REPAIR_DECISION_V1 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import { computeDependencyManifestSha256 } from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const RUNNER_PATH = resolve(REPO, "web/scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts");

function main() {
  const executeRunnerSha256 = sha256File(RUNNER_PATH);
  const files = computeProfessorV3SmokeMaterialPinsV7();
  const dependencyManifestSha256 = computeDependencyManifestSha256(files);
  const sealed = sealProfessorV3SmokeExecutionPinsV7({ decision: PROFESSOR_V3_BINDING_REPAIR_DECISION_V1 });
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH, JSON.stringify(sealed, null, 2));
  const executionPinsArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH);

  const identity = {
    version: "phase6a1-professor-v3-smoke-execution-identity-v7-korvold-prospective-v1",
    decision: PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
    stackIdentity: "professor-v3-korvold-smoke-execution-tree-v1-prospective",
    prospectiveCaseId: "professor-v3-smoke-korvold-prospective-v1",
    mechanismTruthCaseId: "multi-korvold",
    executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts",
    executeRunnerSha256,
    executionPinsArtifactRelativePath:
      "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v7-korvold-prospective-v1.json",
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  };
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH, JSON.stringify(identity, null, 2));
  assertProfessorV3SmokeExecutionIdentityV7({ identity });

  console.log(
    JSON.stringify(
      {
        reviewedExecutionIdentity: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH,
          sha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH),
        },
        executionPinsArtifact: { path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH, sha256: executionPinsArtifactSha256 },
        executeRunner: { path: RUNNER_PATH, sha256: executeRunnerSha256 },
        dependencyManifestSha256,
        authorizationV8Patch: {
          executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH),
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
