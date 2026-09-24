#!/usr/bin/env npx tsx
/** Immutable one-command real Muldrotha Professor v3 smoke execution runner — requires --execute. */
import { resolve } from "node:path";
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
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v4";
import {
  assertProfessorV3SmokeExecutionPreflightV4,
  buildProfessorV3SmokeMaterialPinReportV3,
  loadProfessorV3ReviewedExecutionIdentityV3,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { sealProfessorV3SmokeExecutionFailureV4 } from "./lib/phase6a1-professor-v3-smoke-failure-seal-v4";
import {
  assertProfessorV3SmokeOutputsAbsentV2,
  createProfessorV3ModelAttemptsDirV2,
  resolveProfessorV3SmokeMuldrothaOutputTargetsV2,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v2";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import { writeOnceMilestoneArtifact } from "./lib/write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./lib/write-once-text-artifact-v1";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { ProfessorPlanningContextV3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";

const EXECUTE_SWITCH = "--execute";
const CASE_ID = "professor-v3-smoke-muldrotha-execute-v1";
const MECHANISM_TRUTH_CASE_ID = "multi-muldrotha";
const DECISION = "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V4_INITIAL_RAG_AND_FAILURE_SEAL_CLOSURE_REQUIRED";

function buildMaterialPinReport(identityVerification: ReturnType<typeof assertProfessorV3SmokeExecutionPreflightV4>) {
  return buildProfessorV3SmokeMaterialPinReportV3(identityVerification);
}

async function main() {
  const reviewedExecutionIdentity = loadProfessorV3ReviewedExecutionIdentityV3();
  const independentlyReviewedExecutionAuthorization = PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4;
  const STACK_IDENTITY = reviewedExecutionIdentity.stackIdentity;
  const executeAuthorized = process.argv.includes(EXECUTE_SWITCH);
  const targets = resolveProfessorV3SmokeMuldrothaOutputTargetsV2(MILESTONES);
  const semanticRelationshipSource = buildProfessorV3SemanticRelationshipSourceIdentity({ caseId: MECHANISM_TRUTH_CASE_ID });

  if (!executeAuthorized) {
    const blocked = {
      version: "phase6a1-professor-v3-smoke-muldrotha-execute-blocked-v4",
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
      note: "Fail closed before authorization verification or model request. Re-run with --execute after smoke-readiness v4 review authorization.",
    };
    console.log(JSON.stringify(blocked, null, 2));
    process.exit(1);
  }

  assertProfessorV3SmokeOutputsAbsentV2(targets);
  const identityVerification = assertProfessorV3SmokeExecutionPreflightV4();
  const materialPinReport = buildMaterialPinReport(identityVerification);
  createProfessorV3ModelAttemptsDirV2(targets.modelAttemptsDir);

  const modelPin = loadProfessorModelPinV2();
  const modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[] = [];
  const modelCaller = createProfessorV3ModelCallerV3({
    modelPin,
    outputDir: targets.modelAttemptsDir,
    relPrefix: "phase6a1-professor-v3-smoke-muldrotha-model-attempts-v1",
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
    sealProfessorV3SmokeExecutionFailureV4({
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
    version: "phase6a1-professor-v3-smoke-muldrotha-result-v1",
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
    version: "phase6a1-professor-v3-smoke-muldrotha-manifest-v1",
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
