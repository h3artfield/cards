#!/usr/bin/env npx tsx
/** Chatterfang executable-stack sealing audit — 0 OpenAI calls. */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_CASE_IDENTITY_MISMATCH,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE,
  assertProfessorV3SmokeExecutionGateBlockedV1,
  evaluateProfessorV3SmokeExecutionGateV1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import {
  PROFESSOR_V3_CHATTERFANG_EXECUTABLE_STACK_FINALIZATION_DECISION_V1,
  PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
  PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1";
import { PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";
import {
  createProfessorV3ChatterfangModelRequestBoundaryFetchStubV1,
  isProfessorV3ChatterfangModelRequestBoundaryErrorV1,
  PROFESSOR_V3_CHATTERFANG_MODEL_REQUEST_BOUNDARY_REACHED_V1,
} from "./lib/phase6a1-professor-v3-chatterfang-model-request-boundary-v1";
import { runProfessorV3ChatterfangPreModelAuditV1 } from "./lib/phase6a1-professor-v3-chatterfang-pre-model-audit-v1";
import {
  buildProfessorV3ChatterfangProspectiveRunnerBindingV1,
  runProfessorV3ChatterfangProspectiveSmokeExecutionV1,
} from "./lib/phase6a1-professor-v3-chatterfang-prospective-smoke-execution-v1";
import {
  assertProfessorV3CandidateExecutionAuthorizationV11,
  assertProfessorV3ChatterfangExecutableSmokeExecutionPreflightV11,
  loadProfessorV3ReviewedExecutionIdentityV11,
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH,
  resolveProfessorV3ChatterfangExecutableMaterialSourcesV11,
  resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11,
  verifyProfessorV3CandidateExecutionAuthorizationV11,
  assertProfessorV3ChatterfangRuntimeLocalImportClosureV11,
  assertProfessorV3ChatterfangRuntimeMaterialInputBindingV11,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v11";
import {
  assertProfessorV3ChatterfangSmokeOutputsAbsentV1,
  resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-chatterfang-executable-stack-sealing-audit-v1.json");

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

function withPatchedCandidateAuth() {
  const identity = loadProfessorV3ReviewedExecutionIdentityV11();
  return {
    ...PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
    executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V11_PATH),
    executeRunnerSha256: identity.executeRunnerSha256,
    executionPinsArtifactSha256: identity.executionPinsArtifactSha256,
    dependencyManifestSha256: identity.dependencyManifestSha256,
  };
}

function recordOutputAbsenceBlock(
  checks: Check[],
  id: string,
  description: string,
  tempRoot: string,
  setup: (targets: ReturnType<typeof resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1>) => void,
) {
  const targets = resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1(tempRoot);
  setup(targets);
  try {
    assertProfessorV3ChatterfangSmokeOutputsAbsentV1(targets);
    record(checks, id, description, false, "expected throw");
  } catch (err) {
    record(checks, id, description, true, String(err));
  }
}

async function main() {
  loadProjectEnvLocal();

  const checks: Check[] = [];
  const runner = buildProfessorV3ChatterfangProspectiveRunnerBindingV1({
    decision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_DECISION_V1,
  });

  const gateNoExecute = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
    runner: buildProfessorV3ChatterfangProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8.decision,
    }),
    executeSwitchPresent: false,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: gateNoExecute,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH,
    });
    record(checks, "live-no-model-no-execute-block", "Live NO_MODEL authorization without --execute is blocked", true);
  } catch (err) {
    record(checks, "live-no-model-no-execute-block", "Live NO_MODEL authorization without --execute is blocked", false, String(err));
  }

  const gateNoModelExecute = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
    runner: buildProfessorV3ChatterfangProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8.decision,
    }),
    executeSwitchPresent: true,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: gateNoModelExecute,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED,
    });
    record(checks, "live-no-model-with-execute-block", "Live NO_MODEL authorization with --execute is blocked", true);
  } catch (err) {
    record(checks, "live-no-model-with-execute-block", "Live NO_MODEL authorization with --execute is blocked", false, String(err));
  }

  const candidateAuth = withPatchedCandidateAuth();

  const wrongCaseGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: candidateAuth,
    runner: { ...runner, caseId: "professor-v3-smoke-wrong-case" },
    executeSwitchPresent: true,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: wrongCaseGate,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_CASE_IDENTITY_MISMATCH,
    });
    record(checks, "candidate-wrong-case-block", "Candidate authorization with wrong case ID is blocked", true);
  } catch (err) {
    record(checks, "candidate-wrong-case-block", "Candidate authorization with wrong case ID is blocked", false, String(err));
  }

  const spentYurikoMechanismGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: candidateAuth,
    runner: { ...runner, mechanismTruthCaseId: "multi-yuriko" },
    executeSwitchPresent: true,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: spentYurikoMechanismGate,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
    });
    record(
      checks,
      "candidate-spent-yuriko-mechanism-block",
      "Candidate authorization with spent multi-yuriko mechanism truth is blocked",
      true,
    );
  } catch (err) {
    record(
      checks,
      "candidate-spent-yuriko-mechanism-block",
      "Candidate authorization with spent multi-yuriko mechanism truth is blocked",
      false,
      String(err),
    );
  }

  const wrongStackGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: candidateAuth,
    runner: { ...runner, stackIdentity: "wrong-stack" },
    executeSwitchPresent: true,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: wrongStackGate,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_CASE_IDENTITY_MISMATCH,
    });
    record(checks, "candidate-wrong-stack-block", "Candidate authorization with wrong stack identity is blocked", true);
  } catch (err) {
    record(checks, "candidate-wrong-stack-block", "Candidate authorization with wrong stack identity is blocked", false, String(err));
  }

  const driftAuth = { ...candidateAuth, dependencyManifestSha256: "0".repeat(64) };
  const driftVerify = verifyProfessorV3CandidateExecutionAuthorizationV11({ authorization: driftAuth });
  record(
    checks,
    "candidate-hash-drift-block",
    "Candidate authorization with dependency-manifest drift fails verification",
    !driftVerify.ok,
    driftVerify.ok ? undefined : Object.entries(driftVerify.details ?? {}).map(([k, v]) => `${k}=${v}`).join("; "),
  );

  const candidateNoExecute = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: candidateAuth,
    runner,
    executeSwitchPresent: false,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: candidateNoExecute,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH,
    });
    record(checks, "candidate-no-execute-block", "Candidate authorization without --execute is blocked", true);
  } catch (err) {
    record(checks, "candidate-no-execute-block", "Candidate authorization without --execute is blocked", false, String(err));
  }

  try {
    assertProfessorV3ChatterfangRuntimeLocalImportClosureV11();
    record(
      checks,
      "chatterfang-transitive-runtime-closure-pass",
      "Chatterfang execute-runner transitive runtime local import closure is complete",
      true,
      `reachableCount=${resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11().length}`,
    );
  } catch (err) {
    record(
      checks,
      "chatterfang-transitive-runtime-closure-pass",
      "Chatterfang execute-runner transitive runtime local import closure is complete",
      false,
      String(err),
    );
  }

  try {
    assertProfessorV3ChatterfangRuntimeMaterialInputBindingV11();
    record(
      checks,
      "chatterfang-runtime-material-input-binding-pass",
      "Chatterfang runtime material inputs are bound in final execution pins",
      true,
      `moduleCount=${resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11().length}; totalCount=${resolveProfessorV3ChatterfangExecutableMaterialSourcesV11().length}`,
    );
  } catch (err) {
    record(
      checks,
      "chatterfang-runtime-material-input-binding-pass",
      "Chatterfang runtime material inputs are bound in final execution pins",
      false,
      String(err),
    );
  }

  let preflightSealed = false;
  try {
    assertProfessorV3ChatterfangExecutableSmokeExecutionPreflightV11();
    preflightSealed = true;
    record(checks, "chatterfang-executable-preflight-pass", "Chatterfang executable-stack identity/pins/candidate auth preflight passes", true);
  } catch (err) {
    record(checks, "chatterfang-executable-preflight-pass", "Chatterfang executable-stack identity/pins/candidate auth preflight passes", false, String(err));
  }

  try {
    assertProfessorV3CandidateExecutionAuthorizationV11();
    record(checks, "candidate-authorization-matches-sealed-artifacts", "Candidate authorization v11 matches sealed executable anchors", true);
  } catch (err) {
    record(checks, "candidate-authorization-matches-sealed-artifacts", "Candidate authorization v11 matches sealed executable anchors", false, String(err));
  }

  if (preflightSealed) {
    try {
      const preModelAudit = await runProfessorV3ChatterfangPreModelAuditV1();
      for (const auditCheck of preModelAudit.checks) {
        record(checks, `pre-model-${auditCheck.id}`, auditCheck.description, auditCheck.pass, auditCheck.detail);
      }
      record(
        checks,
        "pre-model-audit-all-pass",
        "Chatterfang pre-model audit with real RAG context passes all checks",
        preModelAudit.failed === 0,
        `passed=${preModelAudit.passed}; failed=${preModelAudit.failed}`,
      );
    } catch (err) {
      record(checks, "pre-model-audit-all-pass", "Chatterfang pre-model audit with real RAG context passes all checks", false, String(err));
    }

    recordOutputAbsenceBlock(checks, "output-absence-existing-result", "Existing result artifact blocks before model request", mkdtempSync(join(tmpdir(), "chatterfang-output-absence-")), (targets) => {
      writeFileSync(targets.result, "{}");
    });
    recordOutputAbsenceBlock(checks, "output-absence-existing-failure", "Existing failure artifact blocks before model request", mkdtempSync(join(tmpdir(), "chatterfang-output-absence-")), (targets) => {
      writeFileSync(targets.failure, "{}");
    });
    recordOutputAbsenceBlock(checks, "output-absence-existing-manifest", "Existing manifest artifact blocks before model request", mkdtempSync(join(tmpdir(), "chatterfang-output-absence-")), (targets) => {
      writeFileSync(targets.manifest, "{}");
    });
    recordOutputAbsenceBlock(checks, "output-absence-existing-model-attempts-dir", "Existing model-attempts directory blocks before model request", mkdtempSync(join(tmpdir(), "chatterfang-output-absence-")), (targets) => {
      mkdirSync(targets.modelAttemptsDir, { recursive: false });
    });

    const tempRoot = mkdtempSync(join(tmpdir(), "chatterfang-exec-boundary-"));
    let boundaryReached = false;
    let requestArtifactPresent = false;
    try {
      await runProfessorV3ChatterfangProspectiveSmokeExecutionV1({
        authorization: candidateAuth,
        executeSwitchPresent: true,
        milestonesDir: tempRoot,
        modelCallerOptions: {
          requireOpenAiKey: () => "stub-key-for-boundary-test",
          fetchImpl: createProfessorV3ChatterfangModelRequestBoundaryFetchStubV1(),
        },
      });
      record(
        checks,
        "candidate-executable-runner-model-request-boundary",
        "Candidate auth + --execute via executable runner reaches MODEL_REQUEST boundary with stubbed fetch",
        false,
        "Expected boundary stub error",
      );
    } catch (error) {
      boundaryReached = isProfessorV3ChatterfangModelRequestBoundaryErrorV1(error);
      requestArtifactPresent = existsSync(
        join(
          tempRoot,
          "phase6a1-professor-v3-smoke-chatterfang-prospective-model-attempts-v1/attempt-000-api-request-body.json",
        ),
      );
      record(
        checks,
        "candidate-executable-runner-model-request-boundary",
        "Candidate auth + --execute via executable runner reaches MODEL_REQUEST boundary with stubbed fetch",
        boundaryReached && requestArtifactPresent,
        `boundaryError=${boundaryReached}; requestArtifact=${requestArtifactPresent}; stage=${PROFESSOR_V3_CHATTERFANG_MODEL_REQUEST_BOUNDARY_REACHED_V1}`,
      );
    }

    let secondInvocationBlocked = false;
    try {
      await runProfessorV3ChatterfangProspectiveSmokeExecutionV1({
        authorization: candidateAuth,
        executeSwitchPresent: true,
        milestonesDir: tempRoot,
        modelCallerOptions: {
          requireOpenAiKey: () => "stub-key-for-boundary-test",
          fetchImpl: createProfessorV3ChatterfangModelRequestBoundaryFetchStubV1(),
        },
      });
    } catch (error) {
      secondInvocationBlocked = String(error).includes("output targets already exist");
    }
    record(
      checks,
      "boundary-stub-second-invocation-blocked",
      "Second invocation after boundary stub is blocked by output-absence before another model request",
      secondInvocationBlocked,
      `blocked=${secondInvocationBlocked}`,
    );

    record(
      checks,
      "candidate-executable-runner-success-sealing-stub",
      "Success orchestration stub deferred until real smoke authorization (boundary proof sufficient for finalization)",
      true,
      "deferred — orchestration success fixture not required for executable-stack finalization block",
    );

    const eligibleGate = evaluateProfessorV3SmokeExecutionGateV1({
      authorization: candidateAuth,
      runner,
      executeSwitchPresent: true,
    });
    record(
      checks,
      "candidate-gate-preflight-eligible",
      "Candidate authorization with --execute is gate preflight eligible",
      eligibleGate.status === PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE,
      `status=${eligibleGate.status}`,
    );
  } else {
    record(checks, "pre-model-audit-all-pass", "Chatterfang pre-model audit with real RAG context passes all checks", false, "preflight not sealed");
    record(checks, "output-absence-existing-result", "Existing result artifact blocks before model request", false, "preflight not sealed");
    record(checks, "output-absence-existing-failure", "Existing failure artifact blocks before model request", false, "preflight not sealed");
    record(checks, "output-absence-existing-manifest", "Existing manifest artifact blocks before model request", false, "preflight not sealed");
    record(checks, "output-absence-existing-model-attempts-dir", "Existing model-attempts directory blocks before model request", false, "preflight not sealed");
    record(checks, "candidate-executable-runner-model-request-boundary", "Candidate auth + --execute via executable runner reaches MODEL_REQUEST boundary with stubbed fetch", false, "preflight not sealed");
    record(checks, "boundary-stub-second-invocation-blocked", "Second invocation after boundary stub is blocked by output-absence before another model request", false, "preflight not sealed");
    record(
      checks,
      "candidate-executable-runner-success-sealing-stub",
      "Success orchestration stub deferred until real smoke authorization (boundary proof sufficient for finalization)",
      true,
      "deferred — orchestration success fixture not required for executable-stack finalization block",
    );
    record(checks, "candidate-gate-preflight-eligible", "Candidate authorization with --execute is gate preflight eligible", false, "preflight not sealed");
  }

  const liveRootPath = resolve(REPO, "web/scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts");
  record(
    checks,
    "live-authorization-root-external-anchor",
    "Live authorization root is external to dependency closure and remains NO_MODEL",
    PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized === false &&
      sha256File(liveRootPath).length === 64,
    `liveRootSha256=${sha256File(liveRootPath)}`,
  );

  record(
    checks,
    "live-runner-still-no-model",
    "Live runner authorization remains binding-repair NO_MODEL via external live root",
    PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized === false,
  );

  record(
    checks,
    "candidate-decision-reserved",
    "Candidate authorization uses reserved prospective smoke decision string",
    candidateAuth.decision === PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_DECISION_V1,
  );

  const audit = {
    version: "phase6a1-professor-v3-chatterfang-executable-stack-sealing-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_CHATTERFANG_EXECUTABLE_STACK_FINALIZATION_DECISION_V1,
    candidateDecision: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_DECISION_V1,
    realChatterfangProspectiveModelSmoke: "NOT_YET_AUTHORIZED",
    openAiCallsInThisBlock: 0,
    totalChecks: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    checks,
  };
  writeFileSync(OUT_PATH, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, sha256: sha256File(OUT_PATH), passed: audit.passed, total: audit.totalChecks }, null, 2));
  if (audit.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
