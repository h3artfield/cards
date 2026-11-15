#!/usr/bin/env npx tsx
/** Successor Muldrotha Professor v3 smoke execution runner v3 — requires --execute and project RAG env. */
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import {
  runProfessorPlanCaseV3Orchestration,
  type ProfessorV3OrchestrationProgressV3,
} from "./lib/phase6a1-professor-plan-agent-v3";
import { createProfessorV3ModelCallerV4 } from "./lib/phase6a1-professor-v3-model-caller-v4";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./lib/phase6a1-professor-v3-model-attempt-artifacts-v3";
import { buildProfessorV3SemanticRelationshipSourceIdentity } from "./lib/phase6a1-professor-v3-semantic-relationship-source-v1";
import { PROFESSOR_V3_LEGACY_MULDROTHA_SUCCESSOR_V7_AUTHORIZATION_ADAPTED_V1 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import { evaluateProfessorV3SmokeExecutionGateV1 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import { emitProfessorV3SmokeExecutionGateBlockedArtifactV1 } from "./lib/phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1";
import {
  assertProfessorV3SuccessorSmokeExecutionPreflightV7,
  buildProfessorV3SuccessorSmokeMaterialPinReportV2,
  loadProfessorV3ReviewedExecutionIdentityV6,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v6";
import { sealProfessorV3SmokeExecutionFailureV7 } from "./lib/phase6a1-professor-v3-smoke-failure-seal-v7";
import {
  assertProfessorV3SmokeOutputsAbsentV5,
  createProfessorV3ModelAttemptsDirV5,
  resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV3,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v5";
import { computeProfessorV3SmokeAttemptAccountingV1 } from "./lib/phase6a1-professor-v3-smoke-attempt-accounting-v1";
import { assertProfessorV3SuccessorRagPreflightBeforeModelV1 } from "./lib/phase6a1-professor-v3-successor-rag-preflight-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./lib/write-once-text-artifact-v1";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { ProfessorPlanningContextV3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";

loadProjectEnvLocal();

const EXECUTE_SWITCH = "--execute";
const CASE_ID = "professor-v3-smoke-muldrotha-successor-v3";
const MECHANISM_TRUTH_CASE_ID = "multi-muldrotha";
const DECISION = "PROFESSOR_V3_INCOMPLETE_RESPONSE_AND_OUTPUT_BUDGET_REPAIR_V1_AUTHORIZED_NO_MODEL";

async function main() {
  const reviewedExecutionIdentity = loadProfessorV3ReviewedExecutionIdentityV6();
  const independentlyReviewedExecutionAuthorization = PROFESSOR_V3_LEGACY_MULDROTHA_SUCCESSOR_V7_AUTHORIZATION_ADAPTED_V1;
  const STACK_IDENTITY = reviewedExecutionIdentity.stackIdentity;
  const executeSwitchPresent = process.argv.includes(EXECUTE_SWITCH);
  const targets = resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV3(MILESTONES);
  const semanticRelationshipSource = buildProfessorV3SemanticRelationshipSourceIdentity({ caseId: MECHANISM_TRUTH_CASE_ID });
  const runner = {
    decision: DECISION,
    caseId: CASE_ID,
    mechanismTruthCaseId: MECHANISM_TRUTH_CASE_ID,
    stackIdentity: STACK_IDENTITY,
  };

  const gate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: independentlyReviewedExecutionAuthorization,
    runner,
    executeSwitchPresent,
  });

  if (gate.status !== "PREFLIGHT_ELIGIBLE") {
    console.log(
      JSON.stringify(
        {
          ...emitProfessorV3SmokeExecutionGateBlockedArtifactV1({
            version: "phase6a1-professor-v3-smoke-muldrotha-successor-blocked-v3",
            decision: DECISION,
            gate,
            runner,
            authorization: independentlyReviewedExecutionAuthorization,
            outputTargets: targets,
          }),
          reviewedExecutionIdentity,
          semanticRelationshipSource,
          note: "SPENT Muldrotha successor v3 — MUST NOT EXECUTE. Fail closed before hash preflight or model request.",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  assertProfessorV3SmokeOutputsAbsentV5(targets);
  const identityVerification = assertProfessorV3SuccessorSmokeExecutionPreflightV7();
  const materialPinReport = buildProfessorV3SuccessorSmokeMaterialPinReportV2(identityVerification);
  createProfessorV3ModelAttemptsDirV5(targets.modelAttemptsDir);

  const modelPin = loadProfessorModelPinV2();
  const modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[] = [];
  const modelCaller = createProfessorV3ModelCallerV4({
    modelPin,
    outputDir: targets.modelAttemptsDir,
    relPrefix: "phase6a1-professor-v3-smoke-muldrotha-successor-model-attempts-v3",
    onAttemptArtifacts: (record) => modelAttemptArtifacts.push(record),
  });

  const stdoutCapture: string[] = [];
  const stderrCapture: string[] = [];
  const origStdout = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => {
    stdoutCapture.push(args.map(String).join(" "));
    origStdout(...args);
  };
  console.error = (...args: unknown[]) => {
    stderrCapture.push(args.map(String).join(" "));
    origError(...args);
  };

  let latestProgress: ProfessorV3OrchestrationProgressV3 | null = null;
  let executionStage = "PREFLIGHT";
  let orchestration;
  try {
    executionStage = "COMMANDER_TRUTH_LOAD";
    const entry = getPilotMechanismCatalogEntry(MECHANISM_TRUTH_CASE_ID);
    if (!entry) throw new Error("Missing Muldrotha mechanism truth");

    executionStage = "INITIAL_CONTEXT";
    let ctx: ProfessorPlanningContextV3;
    ctx = await buildProfessorPlanningContextV3({ entry, oppCase: null, options: { includeMechanicalAffordances: true } });
    ctx.caseId = CASE_ID;

    executionStage = "RAG_PREFLIGHT";
    assertProfessorV3SuccessorRagPreflightBeforeModelV1(ctx);

    executionStage = "MODEL_ORCHESTRATION";
    orchestration = await runProfessorPlanCaseV3Orchestration({
      ctx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      requireLensCoverage: true,
      maxRepairRounds: modelPin.experimentBounds.maxValidationRepairRounds,
      toolBudget: {
        ...DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3,
        maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
        maxRetrievedEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
      },
      modelCaller,
      onProgress: (progress) => {
        latestProgress = progress;
        executionStage = progress.executionStage;
      },
    });
  } catch (error) {
    sealProfessorV3SmokeExecutionFailureV7({
      targets,
      caseId: CASE_ID,
      executionStage: latestProgress?.executionStage ?? executionStage,
      error,
      materialPins: { fileCount: identityVerification.current.length, files: identityVerification.current },
      stackIdentity: STACK_IDENTITY,
      independentlyReviewedExecutionAuthorization,
      reviewedExecutionIdentity,
      modelAttemptArtifacts,
      executionTrace: latestProgress?.executionTrace ?? null,
      runLedger: latestProgress?.runLedger ?? null,
      stdout: stdoutCapture.join("\n"),
      stderr: stderrCapture.join("\n"),
      decision: DECISION,
    });
    throw error;
  } finally {
    console.log = origStdout;
    console.error = origError;
  }

  const resultArtifact = {
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-result-v3",
    generatedAt: new Date().toISOString(),
    decision: DECISION,
    caseId: CASE_ID,
    mechanismTruthCaseId: MECHANISM_TRUTH_CASE_ID,
    stackIdentity: STACK_IDENTITY,
    independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity,
    executionMode: orchestration.executionMode,
    executionStatus: orchestration.executionStatus,
    caseStatus: orchestration.caseStatus,
    modelPinSha256: modelPin.sha256,
    requireLensCoverage: true,
    semanticRelationshipSource,
    modelAttemptArtifacts,
    orchestration,
  };

  writeOnceMilestoneArtifact(targets.result, resultArtifact);
  writeOnceMilestoneArtifact(targets.executionTrace, orchestration.executionTrace);
  writeOnceMilestoneArtifact(targets.runLedger, orchestration.runLedger);
  writeOnceTextArtifact(targets.stdout, `${stdoutCapture.join("\n")}\n`);
  writeOnceTextArtifact(targets.stderr, `${stderrCapture.join("\n")}\n`);

  const attemptAccounting = computeProfessorV3SmokeAttemptAccountingV1({
    executionTrace: orchestration.executionTrace,
    modelAttemptArtifacts,
    repairAttemptCount: orchestration.repairRounds.length,
    professorToolCallCount: orchestration.toolCalls.length,
  });

  const manifest = {
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-manifest-v3",
    generatedAt: new Date().toISOString(),
    decision: DECISION,
    executeSwitch: EXECUTE_SWITCH,
    caseId: CASE_ID,
    stackIdentity: STACK_IDENTITY,
    independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity,
    executionStatus: orchestration.executionStatus,
    caseStatus: orchestration.caseStatus,
    materialPinReport,
    semanticRelationshipSource,
    attemptAccounting,
    modelAttemptArtifacts,
    artifacts: {
      result: { path: targets.result, sha256: sha256File(targets.result) },
      executionTrace: { path: targets.executionTrace, sha256: sha256File(targets.executionTrace) },
      runLedger: { path: targets.runLedger, sha256: sha256File(targets.runLedger) },
      modelAttemptsDir: targets.modelAttemptsDir,
      stdout: { path: targets.stdout, sha256: sha256File(targets.stdout) },
      stderr: { path: targets.stderr, sha256: sha256File(targets.stderr) },
    },
  };
  writeOnceMilestoneArtifact(targets.manifest, manifest);

  console.log(
    JSON.stringify(
      {
        executed: true,
        executionStatus: orchestration.executionStatus,
        caseStatus: orchestration.caseStatus,
        manifest: targets.manifest,
        manifestSha256: sha256File(targets.manifest),
        attemptAccounting,
        modelAttemptArtifactCount: modelAttemptArtifacts.length,
      },
      null,
      2,
    ),
  );

  if (orchestration.caseStatus !== "SUCCESS") process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
