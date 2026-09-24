#!/usr/bin/env npx tsx
/** Successor Muldrotha Professor v3 smoke execution runner — requires --execute and project RAG env. */
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import {
  runProfessorPlanCaseV3Orchestration,
  type ProfessorV3OrchestrationProgressV3,
} from "./lib/phase6a1-professor-plan-agent-v3";
import { createProfessorV3ModelCallerV3 } from "./lib/phase6a1-professor-v3-model-caller-v3";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./lib/phase6a1-professor-v3-model-attempt-artifacts-v3";
import { buildProfessorV3SemanticRelationshipSourceIdentity } from "./lib/phase6a1-professor-v3-semantic-relationship-source-v1";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V5 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v5";
import {
  assertProfessorV3SuccessorSmokeExecutionPreflightV5,
  buildProfessorV3SuccessorSmokeMaterialPinReportV1,
  loadProfessorV3ReviewedExecutionIdentityV4,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v4";
import { sealProfessorV3SmokeExecutionFailureV5 } from "./lib/phase6a1-professor-v3-smoke-failure-seal-v5";
import {
  assertProfessorV3SmokeOutputsAbsentV3,
  createProfessorV3ModelAttemptsDirV3,
  resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV1,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v3";
import { assertProfessorV3SuccessorRagPreflightBeforeModelV1 } from "./lib/phase6a1-professor-v3-successor-rag-preflight-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./lib/write-once-text-artifact-v1";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { ProfessorPlanningContextV3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";

loadProjectEnvLocal();

const EXECUTE_SWITCH = "--execute";
const CASE_ID = "professor-v3-smoke-muldrotha-successor-v1";
const MECHANISM_TRUTH_CASE_ID = "multi-muldrotha";
const DECISION =
  "PROFESSOR_V3_SPENT_FAILURE_REPAIR_V1_BLOCK_STRUCTURED_OUTPUT_SCHEMA_API_INCOMPATIBLE_AND_SUCCESSOR_EXECUTION_DELTA_REQUIRED";

async function main() {
  const reviewedExecutionIdentity = loadProfessorV3ReviewedExecutionIdentityV4();
  const independentlyReviewedExecutionAuthorization = PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V5;
  const STACK_IDENTITY = reviewedExecutionIdentity.stackIdentity;
  const executeAuthorized = process.argv.includes(EXECUTE_SWITCH);
  const targets = resolveProfessorV3SmokeMuldrothaSuccessorOutputTargetsV1(MILESTONES);
  const semanticRelationshipSource = buildProfessorV3SemanticRelationshipSourceIdentity({ caseId: MECHANISM_TRUTH_CASE_ID });

  if (!executeAuthorized) {
    console.log(
      JSON.stringify(
        {
          version: "phase6a1-professor-v3-smoke-muldrotha-successor-blocked-v1",
          generatedAt: new Date().toISOString(),
          decision: DECISION,
          executeSwitchRequired: EXECUTE_SWITCH,
          caseId: CASE_ID,
          mechanismTruthCaseId: MECHANISM_TRUTH_CASE_ID,
          modelAuthorization: "BLOCKED",
          executionStatus: "MODEL_EXECUTION_NOT_AUTHORIZED",
          stackIdentity: STACK_IDENTITY,
          independentlyReviewedExecutionAuthorization,
          reviewedExecutionIdentity,
          semanticRelationshipSource,
          outputTargets: targets,
          note: "Fail closed before authorization verification or model request. Re-run with --execute after successor smoke-readiness review authorization.",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  assertProfessorV3SmokeOutputsAbsentV3(targets);
  const identityVerification = assertProfessorV3SuccessorSmokeExecutionPreflightV5();
  const materialPinReport = buildProfessorV3SuccessorSmokeMaterialPinReportV1(identityVerification);
  createProfessorV3ModelAttemptsDirV3(targets.modelAttemptsDir);

  const modelPin = loadProfessorModelPinV2();
  const modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[] = [];
  const modelCaller = createProfessorV3ModelCallerV3({
    modelPin,
    outputDir: targets.modelAttemptsDir,
    relPrefix: "phase6a1-professor-v3-smoke-muldrotha-successor-model-attempts-v1",
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
    sealProfessorV3SmokeExecutionFailureV5({
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
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-result-v1",
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

  const manifest = {
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-manifest-v1",
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
        modelAttemptCount: modelAttemptArtifacts.length,
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
