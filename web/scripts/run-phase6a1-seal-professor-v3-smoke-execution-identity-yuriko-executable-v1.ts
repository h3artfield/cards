#!/usr/bin/env npx tsx
/** Seal Yuriko executable-stack identity + pins v9 and patch candidate authorization v10 anchors. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10,
  PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
  PROFESSOR_V3_YURIKO_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v10";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH,
  assertProfessorV3SmokeExecutionIdentityV9,
  computeProfessorV3SmokeMaterialPinsV9,
  sealProfessorV3SmokeExecutionPinsV9,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v9";
import { computeDependencyManifestSha256 } from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const RUNNER_PATH = resolve(REPO, "web/scripts/run-phase6a1-execute-smoke-professor-v3-yuriko-prospective-v1.ts");
const AUTH_V10_PATH = resolve(REPO, "web/scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-v10.ts");
const LIVE_ROOT_PATH = resolve(REPO, "web/scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts");

function patchCandidateAuthorizationV10(patch: Record<string, string>) {
  let text = readFileSync(AUTH_V10_PATH, "utf8");
  const start = text.indexOf("export const PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10 = {");
  const endMarker = "} as const satisfies ProfessorV3CandidateExecutionAuthorizationV10;";
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("Missing candidate authorization v10 block");
  let block = text.slice(start, end + endMarker.length);
  for (const [key, value] of Object.entries(patch)) {
    block = block.replace(new RegExp(`(${key}: ")[0-9a-f]{64}(")`, "g"), `$1${value}$2`);
  }
  text = text.slice(0, start) + block + text.slice(end + endMarker.length);
  writeFileSync(AUTH_V10_PATH, text);
}

function main() {
  const executeRunnerSha256 = sha256File(RUNNER_PATH);
  const files = computeProfessorV3SmokeMaterialPinsV9();
  const dependencyManifestSha256 = computeDependencyManifestSha256(files);
  const sealed = sealProfessorV3SmokeExecutionPinsV9({ decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1 });
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH, JSON.stringify(sealed, null, 2));
  const executionPinsArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH);

  const identity = {
    version: "phase6a1-professor-v3-smoke-execution-identity-v9-yuriko-executable-v1",
    decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
    stackIdentity: "professor-v3-yuriko-smoke-execution-tree-v1-prospective",
    prospectiveCaseId: "professor-v3-smoke-yuriko-prospective-v1",
    mechanismTruthCaseId: "multi-yuriko",
    executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-yuriko-prospective-v1.ts",
    executeRunnerSha256,
    executionPinsArtifactRelativePath:
      "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1.json",
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  };
  writeFileSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH, JSON.stringify(identity, null, 2));
  const executionIdentityArtifactSha256 = sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH);
  assertProfessorV3SmokeExecutionIdentityV9({ identity });

  patchCandidateAuthorizationV10({
    executionIdentityArtifactSha256,
    executeRunnerSha256,
    executionPinsArtifactSha256,
    dependencyManifestSha256,
  });

  console.log(
    JSON.stringify(
      {
        resealDecision: PROFESSOR_V3_YURIKO_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
        reviewedExecutionIdentity: {
          path: PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH,
          sha256: executionIdentityArtifactSha256,
        },
        executionPinsArtifact: { path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V9_PATH, sha256: executionPinsArtifactSha256 },
        executeRunner: { path: RUNNER_PATH, sha256: executeRunnerSha256 },
        dependencyManifestSha256,
        liveAuthorizationRoot: { path: LIVE_ROOT_PATH, sha256: sha256File(LIVE_ROOT_PATH) },
        candidateAuthorizationV10: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10,
        materialFileCount: files.length,
      },
      null,
      2,
    ),
  );
}

main();
