#!/usr/bin/env npx tsx
/** Post-Yuriko grounding contract + terminal seal repair audit — 0 OpenAI calls. */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
  PROFESSOR_V3_PROSPECTIVE_SMOKE_EXECUTION_AUTHORIZATION_FIXTURE_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import { PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v10";
import { PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";
import {
  evaluateProfessorV3SmokeExecutionGateV1,
  PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import {
  createProfessorV3ModelCallBudgetGuardV1,
  PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1,
  wrapProfessorV3ModelCallerWithBudgetV1,
} from "./lib/phase6a1-professor-v3-model-call-budget-v1";
import { adjudicateProfessorV3YurikoSpentGroundingFailuresV1 } from "./lib/phase6a1-professor-v3-yuriko-grounding-adjudication-v1";
import { buildProfessorV3YurikoProspectiveRunnerBindingV1 } from "./lib/phase6a1-professor-v3-yuriko-prospective-smoke-execution-v1";
import { sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10 } from "./lib/phase6a1-professor-v3-smoke-terminal-seal-v10";
import { resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1 } from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";

const DECISION = "PROFESSOR_V3_POST_YURIKO_GROUNDING_CONTRACT_AND_TERMINAL_SEAL_REPAIR_V1_AUTHORIZED_NO_MODEL";
const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-post-yuriko-grounding-contract-terminal-seal-repair-audit-v1.json",
);

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

async function main() {
  const checks: Check[] = [];

  record(
    checks,
    "live-root-fail-closed",
    "Live authorization root resolves to NO_MODEL",
    PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized === false,
    `modelExecutionAuthorized=${PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION.modelExecutionAuthorized}`,
  );

  const spentGate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: {
      ...PROFESSOR_V3_PROSPECTIVE_SMOKE_EXECUTION_AUTHORIZATION_FIXTURE_V1,
      decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10.decision,
      prospectiveCaseId: "professor-v3-smoke-yuriko-prospective-v1",
      mechanismTruthCaseId: "multi-yuriko",
      stackIdentity: "professor-v3-yuriko-smoke-execution-tree-v1-prospective",
    },
    runner: buildProfessorV3YurikoProspectiveRunnerBindingV1({
      decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10.decision,
    }),
    executeSwitchPresent: true,
  });
  record(
    checks,
    "yuriko-spent-subject-blocked",
    "Spent Yuriko prospective case is gate-blocked",
    spentGate.status === PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
    spentGate.status,
  );

  let missingBudgetRejected = false;
  try {
    evaluateProfessorV3SmokeExecutionGateV1({
      authorization: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10,
      runner: buildProfessorV3YurikoProspectiveRunnerBindingV1({
        decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10.decision,
      }),
      executeSwitchPresent: true,
    });
  } catch (error) {
    missingBudgetRejected = error instanceof Error && error.message.includes("maxModelApiCalls");
  }
  record(
    checks,
    "historical-v10-auth-missing-budget-fails-closed",
    "Historical candidate v10 without maxModelApiCalls fails gate preflight",
    missingBudgetRejected,
  );

  let budgetBlocked = false;
  try {
    const guard = createProfessorV3ModelCallBudgetGuardV1(1);
    const wrapped = wrapProfessorV3ModelCallerWithBudgetV1({
      budgetGuard: guard,
      modelCaller: async () => ({ parsed: {} }),
    });
    await wrapped({
      attemptIndex: 0,
      systemPrompt: "s",
      userPayload: { modelVisibleText: "u", evidenceLedgerEntries: [], stableEvidenceIdIndex: [] },
    });
    await wrapped({
      attemptIndex: 1,
      systemPrompt: "s",
      userPayload: { modelVisibleText: "u", evidenceLedgerEntries: [], stableEvidenceIdIndex: [] },
    });
  } catch (error) {
    budgetBlocked = error instanceof Error && error.message.includes(PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1);
  }
  record(
    checks,
    "model-call-budget-enforced",
    "attempt-001 blocked when maxModelApiCalls=1",
    budgetBlocked,
  );

  const tmpRoot = mkdtempSync(join(tmpdir(), "yuriko-terminal-seal-"));
  const targets = resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1(tmpRoot);
  sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10({
    targets,
    caseId: "professor-v3-smoke-yuriko-prospective-v1",
    mechanismTruthCaseId: "multi-yuriko",
    executionStage: "VALIDATE",
    materialPins: { fileCount: 0, files: [] },
    stackIdentity: "professor-v3-yuriko-smoke-execution-tree-v1-prospective",
    independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
    reviewedExecutionIdentity: {
      version: "phase6a1-professor-v3-smoke-execution-identity-v9-yuriko-executable-v1",
      decision: DECISION,
      stackIdentity: "professor-v3-yuriko-smoke-execution-tree-v1-prospective",
      prospectiveCaseId: "professor-v3-smoke-yuriko-prospective-v1",
      mechanismTruthCaseId: "multi-yuriko",
      executeRunnerRelativePath: "web/scripts/run-phase6a1-execute-smoke-professor-v3-yuriko-prospective-v1.ts",
      executeRunnerSha256: "0000000000000000000000000000000000000000000000000000000000000000",
      executionPinsArtifactRelativePath:
        "web/data/milestones/deck-synthesis/phase6a1-professor-v3-smoke-execution-pins-v9-yuriko-executable-v1.json",
      executionPinsArtifactSha256: "0000000000000000000000000000000000000000000000000000000000000000",
      dependencyManifestSha256: "0000000000000000000000000000000000000000000000000000000000000000",
    },
    modelAttemptArtifacts: [],
    executionTrace: null,
    runLedger: null,
    stdout: "",
    stderr: "",
    decision: DECISION,
    orchestration: {
      executionMode: "REAL_SMOKE",
      realOutcome: "REPAIR_EXHAUSTED",
      modelAuthorization: "AUTHORIZED",
      caseId: "professor-v3-smoke-yuriko-prospective-v1",
      caseStatus: "REPAIR_EXHAUSTED",
      executionStatus: "REPAIR_EXHAUSTED",
      phasesExecuted: ["VALIDATE"],
      runLedger: null,
      executionTrace: null,
      toolCalls: [],
      repairRounds: [],
      maxRepairRounds: 3,
      normalization: null,
      validationOutcomes: [],
      lensCoverageIssues: [],
      promptPayload: null,
      note: "fixture",
    },
  });
  const terminalArtifacts = ["result", "failure", "manifest", "stdout", "stderr"] as const;
  for (const key of terminalArtifacts) {
    record(
      checks,
      `terminal-seal-writes-${key}`,
      `REPAIR_EXHAUSTED terminal seal writes ${key}`,
      existsSync(targets[key]),
    );
  }
  rmSync(tmpRoot, { recursive: true, force: true });

  const adjudication = await adjudicateProfessorV3YurikoSpentGroundingFailuresV1({ attemptId: "003" });
  record(
    checks,
    "spent-yuriko-adjudication-runs",
    "Offline adjudication runs against spent attempt-003 repair instructions",
    adjudication.finalFailedAssertionIssues > 0,
    `assertionIssues=${adjudication.finalFailedAssertionIssues}; cascade=${adjudication.causalEdgeCascadeIssues}`,
  );
  record(
    checks,
    "grounding-system-dominates",
    "Grounding-system bucket count exceeds Professor bucket count for spent Yuriko repair lines",
    adjudication.interpretation.improveGroundingSystem > adjudication.interpretation.improveProfessor,
    JSON.stringify(adjudication.bucketCounts),
  );

  const passed = checks.filter((c) => c.pass).length;
  const report = {
    version: "phase6a1-professor-v3-post-yuriko-grounding-contract-terminal-seal-repair-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: DECISION,
    totalChecks: checks.length,
    passed,
    failed: checks.length - passed,
    checks,
    adjudicationSummary: {
      bucketCounts: adjudication.bucketCounts,
      interpretation: adjudication.interpretation,
      finalFailedAssertionIssues: adjudication.finalFailedAssertionIssues,
      causalEdgeCascadeIssues: adjudication.causalEdgeCascadeIssues,
    },
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outPath: OUT_PATH, passed, failed: checks.length - passed }, null, 2));
  if (report.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
