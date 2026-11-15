#!/usr/bin/env npx tsx
/** Seal Korvold executable-stack identity + pins v8 and patch candidate authorization v9 anchors. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V9,
  PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v9";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V8_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V8_PATH,
  assertProfessorV3SmokeExecutionIdentityV8,
  computeProfessorV3SmokeMaterialPinsV8,
  sealProfessorV3SmokeExecutionPinsV8,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v8";
import { computeDependencyManifestSha256 } from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const RUNNER_PATH = resolve(REPO, "web/scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts");
const AUTH_V9_PATH = resolve(REPO, "web/scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v9.ts");

function patchCandidateAuthorizationV9(patch: Record<string, string>) {
  let text = readFileSync(AUTH_V9_PATH, "utf8");
  const start = text.indexOf("export const PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V9 = {");
  const endMarker = "} as const satisfies ProfessorV3CandidateExecutionAuthorizationV9;";
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("Missing candidate authorization v9 block");
  let block = text.slice(start, end + endMarker.length);
  for (const [key, value] of Object.entries(patch)) {
    block = block.replace(new RegExp(`(${key}: ")[0-9a-f]{64}(")`, "g"), `$1${value}$2`);
  }
  text = text.slice(0, start) + block + text.slice(end + endMarker.length);
  writeFileSync(AUTH_V9_PATH, text);
}

function main() {
  const executeRunnerSha256 = sha256File(RUNNER_PATH);
  const files = computeProfessorV3SmokeMaterialPinsV8();
  const dependencyManifestSha256 = computeDependencyManifestSha256(files);
  const sealed = sealProfessorV3SmokeExecutionPinsV8({ decision: PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_DECISION_V1 });
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V8_PATH, JSON.stringify(sealed, null, 2));
  const executionPinsArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V8_PATH);

  const identity = {
    version: "phase6a1-professor-v3-smoke-execution-identity-v8-korvold-executable-v1",
    decision: PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_DECISION_V1,
    stackIdentity: "professor-v3-korvold-smoke-execution-tree-v1-prospective",
    prospectiveCaseId: "professor-v3-smoke-korvold-prospective-v1",
    mechanismTruthCaseId: "multi-korvold",
    executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-korvold-prospective-v1.ts",
    executeRunnerSha256,
    executionPinsArtifactRelativePath:
      "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v8-korvold-executable-v1.json",
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  };
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V8_PATH, JSON.stringify(identity, null, 2));
  const executionIdentityArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V8_PATH);
  assertProfessorV3SmokeExecutionIdentityV8({ identity });

  patchCandidateAuthorizationV9({
    executionIdentityArtifactSha256,
    executeRunnerSha256,
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  });

  console.log(
    JSON.stringify(
      {
        reviewedExecutionIdentity: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V8_PATH,
          sha256: executionIdentityArtifactSha256,
        },
        executionPinsArtifact: { path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V8_PATH, sha256: executionPinsArtifactSha256 },
        executeRunner: { path: RUNNER_PATH, sha256: executeRunnerSha256 },
        dependencyManifestSha256,
        candidateAuthorizationV9: PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V9,
        materialFileCount: files.length,
      },
      null,
      2,
    ),
  );
}

main();
