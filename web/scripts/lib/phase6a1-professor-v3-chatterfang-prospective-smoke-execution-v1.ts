/**
 * Shared Chatterfang prospective Professor v3 smoke execution path — used by runner and sealing tests.
 */
import {
  runProfessorPlanCaseV3Orchestration,
  type ProfessorV3ModelCallerInput,
  type ProfessorV3OrchestrationProgressV3,
} from "./phase6a1-professor-plan-agent-v3";
import { buildProfessorPlanningContextV3 } from "./phase6a1-professor-plan-context-builder-v3";
import { loadProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { createProfessorV3ModelCallerV4, type ProfessorV3ModelCallerV4Options } from "./phase6a1-professor-v3-model-caller-v4";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import { buildProfessorV3SemanticRelationshipSourceIdentity } from "./phase6a1-professor-v3-semantic-relationship-source-v1";
import {
  evaluateProfessorV3SmokeExecutionGateV1,
  type ProfessorV3SmokeExecutionGateEvaluationV1,
  type ProfessorV3SmokeRunnerCaseBindingV1,
} from "./phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import { sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10 } from "./phase6a1-professor-v3-smoke-terminal-seal-v10";
import {
  createProfessorV3ModelCallBudgetGuardV1,
  resolveProfessorV3MaxModelApiCallsV1,
  wrapProfessorV3ModelCallerWithBudgetV1,
} from "./phase6a1-professor-v3-model-call-budget-v1";
import {
  assertProfessorV3ChatterfangExecutableSmokeExecutionPreflightV11,
  buildProfessorV3ChatterfangExecutableSmokeMaterialPinReportV1,
  type ProfessorV3ReviewedExecutionIdentityV11,
} from "./phase6a1-professor-v3-smoke-material-pins-v11";
import {
  assertProfessorV3ChatterfangSmokeOutputsAbsentV1,
  createProfessorV3ModelAttemptsDirV6,
  resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1,
  type ProfessorV3SmokeOutputTargetsV6,
} from "./phase6a1-professor-v3-smoke-output-targets-v6";
import { computeProfessorV3SmokeAttemptAccountingV1 } from "./phase6a1-professor-v3-smoke-attempt-accounting-v1";
import { assertProfessorV3SuccessorRagPreflightBeforeModelV1 } from "./phase6a1-professor-v3-successor-rag-preflight-v1";
import { emitProfessorV3SmokeExecutionGateBlockedArtifactV1 } from "./phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1";
import { MILESTONES } from "./phase6a1-pinned-implementation-container-v1";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";

export const PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_EXECUTION_V1_VERSION =
  "phase6a1-professor-v3-chatterfang-prospective-smoke-execution-v1";

export const PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_BINDING_V1 = {
  caseId: "professor-v3-smoke-chatterfang-prospective-v1",
  mechanismTruthCaseId: "multi-chatterfang",
  stackIdentity: "professor-v3-chatterfang-smoke-execution-tree-v1-prospective",
} as const;

export type ProfessorV3ChatterfangProspectiveSmokeExecutionBlockedV1 = {
  blocked: true;
  version: typeof PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_EXECUTION_V1_VERSION;
  gate: ProfessorV3SmokeExecutionGateEvaluationV1;
  runner: ProfessorV3SmokeRunnerCaseBindingV1;
  authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  outputTargets: ProfessorV3SmokeOutputTargetsV6;
  blockedArtifact: ReturnType<typeof emitProfessorV3SmokeExecutionGateBlockedArtifactV1>;
};

export type ProfessorV3ChatterfangProspectiveSmokeExecutionCompletedV1 = {
  blocked: false;
  version: typeof PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_EXECUTION_V1_VERSION;
  gate: ProfessorV3SmokeExecutionGateEvaluationV1;
  runner: ProfessorV3SmokeRunnerCaseBindingV1;
  authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV11;
  outputTargets: ProfessorV3SmokeOutputTargetsV6;
  executionStage: string;
  reachedStage:
    | "MODEL_REQUEST_BOUNDARY_BEFORE_OPENAI"
    | "MODEL_ORCHESTRATION_COMPLETED"
    | "MODEL_ORCHESTRATION_FAILED";
  orchestration?: Awaited<ReturnType<typeof runProfessorPlanCaseV3Orchestration>>;
  modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[];
  latestProgress: ProfessorV3OrchestrationProgressV3 | null;
  materialPinReport: ReturnType<typeof buildProfessorV3ChatterfangExecutableSmokeMaterialPinReportV1>;
  semanticRelationshipSource: ReturnType<typeof buildProfessorV3SemanticRelationshipSourceIdentity>;
  attemptAccounting?: ReturnType<typeof computeProfessorV3SmokeAttemptAccountingV1>;
  manifestPath?: string;
};

export type ProfessorV3ChatterfangProspectiveSmokeExecutionResultV1 =
  | ProfessorV3ChatterfangProspectiveSmokeExecutionBlockedV1
  | ProfessorV3ChatterfangProspectiveSmokeExecutionCompletedV1;

export function buildProfessorV3ChatterfangProspectiveRunnerBindingV1(args: {
  decision: string;
}): ProfessorV3SmokeRunnerCaseBindingV1 {
  return {
    decision: args.decision,
    caseId: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_BINDING_V1.caseId,
    mechanismTruthCaseId: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_BINDING_V1.mechanismTruthCaseId,
    stackIdentity: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_BINDING_V1.stackIdentity,
  };
}

export async function runProfessorV3ChatterfangProspectiveSmokeExecutionV1(args: {
  authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  executeSwitchPresent: boolean;
  milestonesDir?: string;
  modelCallerOptions?: Partial<ProfessorV3ModelCallerV4Options>;
  orchestrationOptions?: {
    requireLensCoverage?: boolean;
  };
  writeSuccessArtifacts?: boolean;
  captureStdoutStderr?: boolean;
}): Promise<ProfessorV3ChatterfangProspectiveSmokeExecutionResultV1> {
  const writeSuccessArtifacts = args.writeSuccessArtifacts ?? true;
  const captureStdoutStderr = args.captureStdoutStderr ?? true;
  const milestonesDir = args.milestonesDir ?? MILESTONES;
  const targets = resolveProfessorV3SmokeChatterfangProspectiveOutputTargetsV1(milestonesDir);
  const runner = buildProfessorV3ChatterfangProspectiveRunnerBindingV1({ decision: args.authorization.decision });
  const gate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: args.authorization,
    runner,
    executeSwitchPresent: args.executeSwitchPresent,
  });

  if (gate.status !== "PREFLIGHT_ELIGIBLE") {
    return {
      blocked: true,
      version: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_EXECUTION_V1_VERSION,
      gate,
      runner,
      authorization: args.authorization,
      outputTargets: targets,
      blockedArtifact: emitProfessorV3SmokeExecutionGateBlockedArtifactV1({
        version: "phase6a1-professor-v3-smoke-chatterfang-prospective-blocked-v1",
        decision: args.authorization.decision,
        gate,
        runner,
        authorization: args.authorization,
        outputTargets: targets,
      }),
    };
  }

  assertProfessorV3ChatterfangSmokeOutputsAbsentV1(targets);

  const identityVerification = assertProfessorV3ChatterfangExecutableSmokeExecutionPreflightV11({
    authorization: args.authorization,
  });
  const materialPinReport = buildProfessorV3ChatterfangExecutableSmokeMaterialPinReportV1(identityVerification);
  const reviewedExecutionIdentity = identityVerification.identity;

  const modelPin = loadProfessorModelPinV2();
  const maxModelApiCalls = resolveProfessorV3MaxModelApiCallsV1({
    modelExecutionAuthorized: gate.modelExecutionAuthorized,
    maxModelApiCalls: args.authorization.maxModelApiCalls,
    decision: args.authorization.decision,
  });
  if (maxModelApiCalls == null) {
    throw new Error("FAIL_CLOSED: preflight-eligible smoke requires explicit maxModelApiCalls");
  }
  const modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[] = [];
  const budgetGuard = createProfessorV3ModelCallBudgetGuardV1(maxModelApiCalls);
  const rawModelCaller = createProfessorV3ModelCallerV4({
    modelPin,
    outputDir: targets.modelAttemptsDir,
    relPrefix: "phase6a1-professor-v3-smoke-chatterfang-prospective-model-attempts-v1",
    onAttemptArtifacts: (record) => modelAttemptArtifacts.push(record),
    ...args.modelCallerOptions,
  });
  const modelCaller = wrapProfessorV3ModelCallerWithBudgetV1({
    modelCaller: rawModelCaller,
    budgetGuard,
  });

  const stdoutCapture: string[] = [];
  const stderrCapture: string[] = [];
  const origStdout = console.log;
  const origError = console.error;
  if (captureStdoutStderr) {
    console.log = (...logArgs: unknown[]) => {
      stdoutCapture.push(logArgs.map(String).join(" "));
      origStdout(...logArgs);
    };
    console.error = (...logArgs: unknown[]) => {
      stderrCapture.push(logArgs.map(String).join(" "));
      origError(...logArgs);
    };
  }

  const semanticRelationshipSource = buildProfessorV3SemanticRelationshipSourceIdentity({
    caseId: runner.mechanismTruthCaseId,
  });

  let latestProgress: ProfessorV3OrchestrationProgressV3 | null = null;
  let executionStage = "PREFLIGHT";
  let orchestration: Awaited<ReturnType<typeof runProfessorPlanCaseV3Orchestration>> | undefined;
  try {
    executionStage = "COMMANDER_TRUTH_LOAD";
    const entry = getPilotMechanismCatalogEntry(runner.mechanismTruthCaseId);
    if (!entry) throw new Error(`Missing Chatterfang mechanism truth for ${runner.mechanismTruthCaseId}`);

    executionStage = "INITIAL_CONTEXT";
    const ctx: ProfessorPlanningContextV3 = await buildProfessorPlanningContextV3({
      entry,
      oppCase: null,
      options: { includeMechanicalAffordances: true },
    });
    ctx.caseId = runner.caseId;

    executionStage = "RAG_PREFLIGHT";
    assertProfessorV3SuccessorRagPreflightBeforeModelV1(ctx);

    executionStage = "MODEL_ATTEMPTS_DIR";
    createProfessorV3ModelAttemptsDirV6(targets.modelAttemptsDir);

    executionStage = "MODEL_ORCHESTRATION";
    orchestration = await runProfessorPlanCaseV3Orchestration({
      ctx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: gate.modelAuthorization,
      requireLensCoverage: args.orchestrationOptions?.requireLensCoverage ?? true,
      maxRepairRounds: modelPin.experimentBounds.maxValidationRepairRounds,
      toolBudget: {
        ...DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3,
        maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
        maxRetrievedEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
      },
      modelCaller: modelCaller as (input: ProfessorV3ModelCallerInput) => ReturnType<typeof modelCaller>,
      onProgress: (progress) => {
        latestProgress = progress;
        executionStage = progress.executionStage;
      },
    });
  } catch (error) {
    sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10({
      targets,
      caseId: runner.caseId,
      mechanismTruthCaseId: runner.mechanismTruthCaseId,
      executionStage: latestProgress?.executionStage ?? executionStage,
      error,
      materialPins: { fileCount: identityVerification.current.length, files: identityVerification.current },
      stackIdentity: runner.stackIdentity,
      independentlyReviewedExecutionAuthorization: args.authorization,
      reviewedExecutionIdentity,
      modelAttemptArtifacts,
      executionTrace: latestProgress?.executionTrace ?? orchestration?.executionTrace ?? null,
      runLedger: latestProgress?.runLedger ?? orchestration?.runLedger ?? null,
      stdout: stdoutCapture.join("\n"),
      stderr: stderrCapture.join("\n"),
      decision: args.authorization.decision,
      orchestration,
      modelPinSha256: modelPin.sha256,
      requireLensCoverage: args.orchestrationOptions?.requireLensCoverage ?? true,
      semanticRelationshipSource,
      materialPinReport,
      professorToolCallCount: orchestration?.professorToolCallCompletedCount ?? orchestration?.toolCalls.length,
      professorToolCallAttemptCount:
        latestProgress?.professorToolCallAttemptCount ?? orchestration?.professorToolCallAttemptCount,
      professorToolCallCompletedCount:
        latestProgress?.professorToolCallCompletedCount ?? orchestration?.professorToolCallCompletedCount,
    });
    throw error;
  } finally {
    if (captureStdoutStderr) {
      console.log = origStdout;
      console.error = origError;
    }
  }

  const reachedStageAtModelRequest =
    executionStage === "MODEL_REQUEST" ||
    latestProgress?.executionStage === "MODEL_REQUEST" ||
    orchestration?.phasesExecuted.includes("MODEL_REQUEST");

  let reachedStage: ProfessorV3ChatterfangProspectiveSmokeExecutionCompletedV1["reachedStage"] =
    orchestration?.caseStatus === "SUCCESS"
      ? "MODEL_ORCHESTRATION_COMPLETED"
      : "MODEL_ORCHESTRATION_FAILED";
  if (reachedStageAtModelRequest && orchestration?.caseStatus !== "SUCCESS") {
    reachedStage = "MODEL_REQUEST_BOUNDARY_BEFORE_OPENAI";
  }

  let manifestPath: string | undefined;
  if (writeSuccessArtifacts && orchestration) {
    sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10({
      targets,
      caseId: runner.caseId,
      mechanismTruthCaseId: runner.mechanismTruthCaseId,
      executionStage: latestProgress?.executionStage ?? executionStage,
      materialPins: { fileCount: identityVerification.current.length, files: identityVerification.current },
      stackIdentity: runner.stackIdentity,
      independentlyReviewedExecutionAuthorization: args.authorization,
      reviewedExecutionIdentity,
      modelAttemptArtifacts,
      executionTrace: orchestration.executionTrace,
      runLedger: orchestration.runLedger,
      stdout: stdoutCapture.join("\n"),
      stderr: stderrCapture.join("\n"),
      decision: args.authorization.decision,
      orchestration,
      modelPinSha256: modelPin.sha256,
      requireLensCoverage: args.orchestrationOptions?.requireLensCoverage ?? true,
      semanticRelationshipSource,
      materialPinReport,
      professorToolCallCount: orchestration.professorToolCallCompletedCount,
      professorToolCallAttemptCount: orchestration.professorToolCallAttemptCount,
      professorToolCallCompletedCount: orchestration.professorToolCallCompletedCount,
    });
    manifestPath = targets.manifest;
  }

  return {
    blocked: false,
    version: PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_EXECUTION_V1_VERSION,
    gate,
    runner,
    authorization: args.authorization,
    reviewedExecutionIdentity,
    outputTargets: targets,
    executionStage: latestProgress?.executionStage ?? executionStage,
    reachedStage,
    orchestration,
    modelAttemptArtifacts,
    latestProgress,
    materialPinReport,
    semanticRelationshipSource,
    attemptAccounting:
      orchestration &&
      computeProfessorV3SmokeAttemptAccountingV1({
        executionTrace: orchestration.executionTrace,
        modelAttemptArtifacts,
        repairAttemptCount: orchestration.repairRounds.length,
        professorToolCallCount: orchestration.professorToolCallCompletedCount,
      professorToolCallAttemptCount: orchestration.professorToolCallAttemptCount,
      professorToolCallCompletedCount: orchestration.professorToolCallCompletedCount,
      }),
    manifestPath,
  };
}
