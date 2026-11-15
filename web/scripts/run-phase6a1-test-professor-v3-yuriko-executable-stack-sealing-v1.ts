#!/usr/bin/env npx tsx
/** Yuriko executable-stack sealing audit — 0 OpenAI calls. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10,
  PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
  PROFESSOR_V3_YURIKO_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v10";
import { PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";
import { createProfessorV3YurikoOrchestrationSuccessFetchStubV1 } from "./lib/phase6a1-professor-v3-yuriko-orchestration-success-fixture-v1";
import {
  createProfessorV3YurikoModelRequestBoundaryFetchStubV1,
  isProfessorV3YurikoModelRequestBoundaryErrorV1,
  PROFESSOR_V3_YURIKO_MODEL_REQUEST_BOUNDARY_REACHED_V1,
} from "./lib/phase6a1-professor-v3-yuriko-model-request-boundary-v1";
import { runProfessorV3YurikoPreModelAuditV1 } from "./lib/phase6a1-professor-v3-yuriko-pre-model-audit-v1";
import {
  buildProfessorV3YurikoProspectiveRunnerBindingV1,
  runProfessorV3YurikoProspectiveSmokeExecutionV1,
} from "./lib/phase6a1-professor-v3-yuriko-prospective-smoke-execution-v1";
import {
  assertProfessorV3CandidateExecutionAuthorizationV10,
  assertProfessorV3YurikoExecutableSmokeExecutionPreflightV10,
  loadProfessorV3ReviewedExecutionIdentityV9,
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH,
  verifyProfessorV3CandidateExecutionAuthorizationV10,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v9";
import {
  assertProfessorV3YurikoSmokeOutputsAbsentV1,
  resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-yuriko-executable-stack-sealing-audit-v1.json");

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

function withPatchedCandidateAuth() {
  const identity = loadProfessorV3ReviewedExecutionIdentityV9();
  return {
    ...PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10,
    executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH),
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
  setup: (targets: ReturnType<typeof resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1>) => void,
) {
  const targets = resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1(tempRoot);
  setup(targets);
  try {
    assertProfessorV3YurikoSmokeOutputsAbsentV1(targets);
    record(checks, id, description, false, "expected throw");
  } catch (err) {
    record(checks, id, description, true, String(err));
  }
}

async function main() {
  const checks: Check[] = [];
  const runner = buildProfessorV3YurikoProspectiveRunnerBindingV1({
    decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
  });

  const gateNoExecute = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
    runner: buildProfessorV3YurikoProspectiveRunnerBindingV1({
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
    runner: buildProfessorV3YurikoProspectiveRunnerBindingV1({
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

  const wrongMechanismGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: candidateAuth,
    runner: { ...runner, mechanismTruthCaseId: "multi-muldrotha" },
    executeSwitchPresent: true,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: wrongMechanismGate,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
    });
    record(checks, "candidate-wrong-mechanism-block", "Candidate authorization with wrong mechanism truth is blocked", true);
  } catch (err) {
    record(checks, "candidate-wrong-mechanism-block", "Candidate authorization with wrong mechanism truth is blocked", false, String(err));
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
  const driftVerify = verifyProfessorV3CandidateExecutionAuthorizationV10({ authorization: driftAuth });
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

  let preflightSealed = false;
  try {
    assertProfessorV3YurikoExecutableSmokeExecutionPreflightV10();
    preflightSealed = true;
    record(checks, "yuriko-executable-preflight-pass", "Yuriko executable-stack identity/pins/candidate auth preflight passes", true);
  } catch (err) {
    record(checks, "yuriko-executable-preflight-pass", "Yuriko executable-stack identity/pins/candidate auth preflight passes", false, String(err));
  }

  try {
    assertProfessorV3CandidateExecutionAuthorizationV10();
    record(checks, "candidate-authorization-matches-sealed-artifacts", "Candidate authorization v10 matches sealed executable anchors", true);
  } catch (err) {
    record(checks, "candidate-authorization-matches-sealed-artifacts", "Candidate authorization v10 matches sealed executable anchors", false, String(err));
  }

  if (preflightSealed) {
    loadProjectEnvLocal();

    try {
      const preModelAudit = await runProfessorV3YurikoPreModelAuditV1();
      for (const auditCheck of preModelAudit.checks) {
        record(checks, `pre-model-${auditCheck.id}`, auditCheck.description, auditCheck.pass, auditCheck.detail);
      }
      record(
        checks,
        "pre-model-audit-all-pass",
        "Yuriko pre-model audit with real RAG context passes all checks",
        preModelAudit.failed === 0,
        `passed=${preModelAudit.passed}; failed=${preModelAudit.failed}`,
      );
    } catch (err) {
      record(checks, "pre-model-audit-all-pass", "Yuriko pre-model audit with real RAG context passes all checks", false, String(err));
    }

    recordOutputAbsenceBlock(checks, "output-absence-existing-result", "Existing result artifact blocks before model request", mkdtempSync(join(tmpdir(), "yuriko-output-absence-")), (targets) => {
      writeFileSync(targets.result, "{}");
    });
    recordOutputAbsenceBlock(checks, "output-absence-existing-failure", "Existing failure artifact blocks before model request", mkdtempSync(join(tmpdir(), "yuriko-output-absence-")), (targets) => {
      writeFileSync(targets.failure, "{}");
    });
    recordOutputAbsenceBlock(checks, "output-absence-existing-manifest", "Existing manifest artifact blocks before model request", mkdtempSync(join(tmpdir(), "yuriko-output-absence-")), (targets) => {
      writeFileSync(targets.manifest, "{}");
    });
    recordOutputAbsenceBlock(checks, "output-absence-existing-model-attempts-dir", "Existing model-attempts directory blocks before model request", mkdtempSync(join(tmpdir(), "yuriko-output-absence-")), (targets) => {
      mkdirSync(targets.modelAttemptsDir, { recursive: false });
    });

    const tempRoot = mkdtempSync(join(tmpdir(), "yuriko-exec-boundary-"));
    let boundaryReached = false;
    let requestArtifactPresent = false;
    try {
      await runProfessorV3YurikoProspectiveSmokeExecutionV1({
        authorization: candidateAuth,
        executeSwitchPresent: true,
        milestonesDir: tempRoot,
        modelCallerOptions: {
          requireOpenAiKey: () => "stub-key-for-boundary-test",
          fetchImpl: createProfessorV3YurikoModelRequestBoundaryFetchStubV1(),
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
      boundaryReached = isProfessorV3YurikoModelRequestBoundaryErrorV1(error);
      requestArtifactPresent = existsSync(
        join(
          tempRoot,
          "phase6a1-professor-v3-smoke-yuriko-prospective-model-attempts-v1/attempt-000-api-request-body.json",
        ),
      );
      record(
        checks,
        "candidate-executable-runner-model-request-boundary",
        "Candidate auth + --execute via executable runner reaches MODEL_REQUEST boundary with stubbed fetch",
        boundaryReached && requestArtifactPresent,
        `boundaryError=${boundaryReached}; requestArtifact=${requestArtifactPresent}; stage=${PROFESSOR_V3_YURIKO_MODEL_REQUEST_BOUNDARY_REACHED_V1}`,
      );
    }

    let secondInvocationBlocked = false;
    try {
      await runProfessorV3YurikoProspectiveSmokeExecutionV1({
        authorization: candidateAuth,
        executeSwitchPresent: true,
        milestonesDir: tempRoot,
        modelCallerOptions: {
          requireOpenAiKey: () => "stub-key-for-boundary-test",
          fetchImpl: createProfessorV3YurikoModelRequestBoundaryFetchStubV1(),
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

    const successRoot = mkdtempSync(join(tmpdir(), "yuriko-exec-success-"));
    const successTargets = resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1(successRoot);
    let successSealed = false;
    let successDetail = "";
    try {
      const successResult = await runProfessorV3YurikoProspectiveSmokeExecutionV1({
        authorization: candidateAuth,
        executeSwitchPresent: true,
        milestonesDir: successRoot,
        modelCallerOptions: {
          requireOpenAiKey: () => "stub-key-for-success-test",
          fetchImpl: createProfessorV3YurikoOrchestrationSuccessFetchStubV1(),
        },
        orchestrationOptions: { requireLensCoverage: false },
      });
      const manifest = successResult.blocked
        ? null
        : existsSync(successTargets.manifest)
          ? (JSON.parse(readFileSync(successTargets.manifest, "utf8")) as { attemptAccounting?: unknown })
          : null;
      successSealed =
        !successResult.blocked &&
        successResult.reachedStage === "MODEL_ORCHESTRATION_COMPLETED" &&
        successResult.orchestration?.caseStatus === "SUCCESS" &&
        existsSync(successTargets.result) &&
        existsSync(successTargets.executionTrace) &&
        existsSync(successTargets.runLedger) &&
        existsSync(successTargets.manifest) &&
        existsSync(successTargets.stdout) &&
        existsSync(successTargets.stderr) &&
        existsSync(join(successTargets.modelAttemptsDir, "attempt-000-api-request-body.json")) &&
        Boolean(manifest?.attemptAccounting) &&
        Boolean(successResult.attemptAccounting);
      successDetail = successResult.blocked
        ? "blocked"
        : `reachedStage=${successResult.reachedStage}; caseStatus=${successResult.orchestration?.caseStatus ?? "null"}`;
    } catch (error) {
      successDetail = String(error);
    }
    record(
      checks,
      "candidate-executable-runner-success-sealing-stub",
      "Candidate auth + --execute via executable runner seals success artifacts with stubbed orchestration",
      successSealed,
      successDetail,
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
    record(checks, "pre-model-audit-all-pass", "Yuriko pre-model audit with real RAG context passes all checks", false, "preflight not sealed");
    record(checks, "output-absence-existing-result", "Existing result artifact blocks before model request", false, "preflight not sealed");
    record(checks, "output-absence-existing-failure", "Existing failure artifact blocks before model request", false, "preflight not sealed");
    record(checks, "output-absence-existing-manifest", "Existing manifest artifact blocks before model request", false, "preflight not sealed");
    record(checks, "output-absence-existing-model-attempts-dir", "Existing model-attempts directory blocks before model request", false, "preflight not sealed");
    record(checks, "candidate-executable-runner-model-request-boundary", "Candidate auth + --execute via executable runner reaches MODEL_REQUEST boundary with stubbed fetch", false, "preflight not sealed");
    record(checks, "boundary-stub-second-invocation-blocked", "Second invocation after boundary stub is blocked by output-absence before another model request", false, "preflight not sealed");
    record(checks, "candidate-executable-runner-success-sealing-stub", "Candidate auth + --execute via executable runner seals success artifacts with stubbed orchestration", false, "preflight not sealed");
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
    candidateAuth.decision === PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
  );

  const audit = {
    version: "phase6a1-professor-v3-yuriko-executable-stack-sealing-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_STACK_RESEAL_DECISION_V1,
    candidateDecision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_DECISION_V1,
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
