#!/usr/bin/env npx tsx
/** Professor v3 prospective execution-authorization binding repair audit — no OpenAI. */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_AUTHORIZATION_DECISION_MISMATCH,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE,
  assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1,
  assertProfessorV3SmokeExecutionGateBlockedV1,
  assertProfessorV3SmokeExecutionGatePreflightEligibleV1,
  evaluateProfessorV3SmokeExecutionGateV1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import {
  PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
  PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
  PROFESSOR_V3_LEGACY_MULDROTHA_SUCCESSOR_V7_AUTHORIZATION_ADAPTED_V1,
  PROFESSOR_V3_PROSPECTIVE_SMOKE_EXECUTION_AUTHORIZATION_FIXTURE_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { assertProfessorV3SuccessorRagPreflightBeforeModelV1 } from "./lib/phase6a1-professor-v3-successor-rag-preflight-v1";
import {
  assertProfessorV3SmokeExecutionIdentityV7,
  assertProfessorV3SuccessorProspectiveSmokeExecutionPreflightV8,
  loadProfessorV3ReviewedExecutionIdentityV7,
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH,
  verifyProfessorV3SmokeExecutionAuthorizationV8,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v7";
import {
  assertProfessorV3SmokeOutputsAbsentV6,
  resolveProfessorV3SmokeKorvoldProspectiveOutputTargetsV1,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-audit-v1.json",
);

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

const KORVOLD_RUNNER = {
  decision: PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
  caseId: "professor-v3-smoke-korvold-prospective-v1",
  mechanismTruthCaseId: "multi-korvold",
  stackIdentity: "professor-v3-korvold-smoke-execution-tree-v1-prospective",
} as const;

const MULDROTHA_RUNNER = {
  decision: "PROFESSOR_V3_INCOMPLETE_RESPONSE_AND_OUTPUT_BUDGET_REPAIR_V1_AUTHORIZED_NO_MODEL",
  caseId: "professor-v3-smoke-muldrotha-successor-v3",
  mechanismTruthCaseId: "multi-muldrotha",
  stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v6-successor-v3",
} as const;

async function main() {
  const checks: Check[] = [];

  const gate1 = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
    runner: KORVOLD_RUNNER,
    executeSwitchPresent: false,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: gate1,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH,
    });
    record(checks, "gate-no-model-no-execute-block", "NO_MODEL authorization without --execute is blocked", true);
  } catch (err) {
    record(checks, "gate-no-model-no-execute-block", "NO_MODEL authorization without --execute is blocked", false, String(err));
  }

  const gate2 = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
    runner: KORVOLD_RUNNER,
    executeSwitchPresent: true,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: gate2,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED,
    });
    record(checks, "gate-no-model-with-execute-block", "NO_MODEL authorization with --execute is blocked", true);
  } catch (err) {
    record(checks, "gate-no-model-with-execute-block", "NO_MODEL authorization with --execute is blocked", false, String(err));
  }

  const wrongAuth = {
    ...PROFESSOR_V3_PROSPECTIVE_SMOKE_EXECUTION_AUTHORIZATION_FIXTURE_V1,
    decision: "PROFESSOR_V3_WRONG_PROSPECTIVE_SMOKE_V1_AUTHORIZED_WITH_EXTERNAL_ANCHORS",
  };
  const gate3 = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: wrongAuth,
    runner: KORVOLD_RUNNER,
    executeSwitchPresent: true,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: gate3,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_AUTHORIZATION_DECISION_MISMATCH,
    });
    record(checks, "gate-wrong-auth-with-execute-block", "Wrong model authorization with --execute is blocked", true);
  } catch (err) {
    record(
      checks,
      "gate-wrong-auth-with-execute-block",
      "Wrong model authorization with --execute is blocked",
      false,
      String(err),
    );
  }

  const gate4 = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_PROSPECTIVE_SMOKE_EXECUTION_AUTHORIZATION_FIXTURE_V1,
    runner: KORVOLD_RUNNER,
    executeSwitchPresent: false,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: gate4,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH,
    });
    record(
      checks,
      "gate-correct-prospective-auth-no-flag-block",
      "Correct prospective authorization without --execute is blocked",
      true,
    );
  } catch (err) {
    record(
      checks,
      "gate-correct-prospective-auth-no-flag-block",
      "Correct prospective authorization without --execute is blocked",
      false,
      String(err),
    );
  }

  let semanticNoModelEnforced = false;
  try {
    assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1({
      decision: PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
      modelExecutionAuthorized: true,
    });
  } catch {
    semanticNoModelEnforced = true;
  }
  record(
    checks,
    "authorization-decision-no-model-semantic-enforcement",
    "Authorization verifier rejects NO_MODEL decision with modelExecutionAuthorized=true",
    semanticNoModelEnforced,
  );

  const muldrothaGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: PROFESSOR_V3_LEGACY_MULDROTHA_SUCCESSOR_V7_AUTHORIZATION_ADAPTED_V1,
    runner: MULDROTHA_RUNNER,
    executeSwitchPresent: true,
  });
  try {
    assertProfessorV3SmokeExecutionGateBlockedV1({
      evaluation: muldrothaGate,
      expectedStatus: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
    });
    record(
      checks,
      "muldrotha-successor-v3-spent-subject-blocked-with-execute",
      "Spent Muldrotha successor v3 runner blocks even with --execute",
      true,
    );
  } catch (err) {
    record(
      checks,
      "muldrotha-successor-v3-spent-subject-blocked-with-execute",
      "Spent Muldrotha successor v3 runner blocks even with --execute",
      false,
      String(err),
    );
  }

  let identitySealed = false;
  try {
    assertProfessorV3SuccessorProspectiveSmokeExecutionPreflightV8();
    identitySealed = true;
  } catch (err) {
    record(checks, "korvold-prospective-execution-preflight-pass", "Korvold prospective execution preflight passes", false, String(err));
  }
  if (identitySealed) {
    record(checks, "korvold-prospective-execution-preflight-pass", "Korvold prospective execution preflight passes", true);
  }

  const auth = verifyProfessorV3SmokeExecutionAuthorizationV8();
  record(
    checks,
    "korvold-prospective-authorization-matches-sealed-artifacts",
    "Authorization v8 matches sealed Korvold prospective identity/pins/runner/manifest",
    auth.ok,
    auth.ok ? undefined : Object.entries(auth.details ?? {}).map(([k, v]) => `${k}=${v}`).join("; "),
  );

  if (existsSync(resolve(MILESTONES, "phase6a1-professor-v3-smoke-execution-identity-v7-korvold-prospective-v1.json"))) {
    const identity = loadProfessorV3ReviewedExecutionIdentityV7();
    record(
      checks,
      "korvold-prospective-identity-case-binding",
      "Sealed identity binds Korvold prospective case and mechanism truth",
      identity.prospectiveCaseId === "professor-v3-smoke-korvold-prospective-v1" &&
        identity.mechanismTruthCaseId === "multi-korvold" &&
        identity.decision === PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
    );
  }

  let preflightBoundaryReached = false;
  if (identitySealed) {
    loadProjectEnvLocal();
    const identity = loadProfessorV3ReviewedExecutionIdentityV7();
    const prospectiveAuth = {
      ...PROFESSOR_V3_PROSPECTIVE_SMOKE_EXECUTION_AUTHORIZATION_FIXTURE_V1,
      executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH),
      executeRunnerSha256: identity.executeRunnerSha256,
      executionPinsArtifactSha256: identity.executionPinsArtifactSha256,
      dependencyManifestSha256: identity.dependencyManifestSha256,
    };
    const prospectiveRunner = { ...KORVOLD_RUNNER, decision: prospectiveAuth.decision };
    const gate5 = evaluateProfessorV3SmokeExecutionGateV1({
      authorization: prospectiveAuth,
      runner: prospectiveRunner,
      executeSwitchPresent: true,
    });
    if (gate5.status === PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE) {
      try {
        assertProfessorV3SmokeExecutionGatePreflightEligibleV1(gate5);
        const targets = resolveProfessorV3SmokeKorvoldProspectiveOutputTargetsV1(MILESTONES);
        assertProfessorV3SmokeOutputsAbsentV6(targets);
        assertProfessorV3SmokeExecutionIdentityV7();
        const entry = getPilotMechanismCatalogEntry(KORVOLD_RUNNER.mechanismTruthCaseId);
        if (!entry) throw new Error(`Missing mechanism truth for ${KORVOLD_RUNNER.mechanismTruthCaseId}`);
        const ctx = await buildProfessorPlanningContextV3({
          entry,
          oppCase: null,
          options: { includeMechanicalAffordances: true },
        });
        ctx.caseId = KORVOLD_RUNNER.caseId;
        assertProfessorV3SuccessorRagPreflightBeforeModelV1(ctx);
        preflightBoundaryReached = true;
        record(
          checks,
          "gate-correct-prospective-auth-with-flag-preflight-eligible",
          "Correct prospective authorization with --execute reaches preflight boundary before model",
          preflightBoundaryReached,
          "reachedStage=PREFLIGHT_BOUNDARY_BEFORE_MODEL_ORCHESTRATION",
        );
      } catch (err) {
        record(
          checks,
          "gate-correct-prospective-auth-with-flag-preflight-eligible",
          "Correct prospective authorization with --execute reaches preflight boundary before model",
          false,
          String(err),
        );
      }
    } else {
      record(
        checks,
        "gate-correct-prospective-auth-with-flag-preflight-eligible",
        "Correct prospective authorization with --execute reaches preflight boundary before model",
        false,
        `gateStatus=${gate5.status}`,
      );
    }
  } else {
    record(
      checks,
      "gate-correct-prospective-auth-with-flag-preflight-eligible",
      "Correct prospective authorization with --execute reaches preflight boundary before model",
      false,
      "identity not sealed",
    );
  }

  record(
    checks,
    "binding-repair-decision-is-no-model",
    "Binding repair authorization decision is NO_MODEL",
    PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8.modelExecutionAuthorized === false &&
      PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8.decision.endsWith("_NO_MODEL"),
  );

  const audit = {
    version: "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
    prospectiveSubject: "multi-korvold",
    prospectiveCaseId: "professor-v3-smoke-korvold-prospective-v1",
    openAiCallsInThisBlock: 0,
    totalChecks: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    checks,
  };
  writeFileSync(OUT_PATH, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ artifact: OUT_PATH, passed: audit.passed, total: audit.totalChecks }, null, 2));
  if (audit.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
