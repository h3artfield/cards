/**
 * Write-once terminal outcome seal for Yuriko prospective Professor v3 smokes (v10).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProfessorCaseOrchestrationRecordV3 } from "./phase6a1-professor-plan-agent-v3";
import type { ProfessorExecutionTraceV1 } from "../../src/lib/deck-synthesis/professor-v3-execution-trace-v1";
import type { ProfessorRunLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import {
  computeProfessorV3SmokeAttemptAccountingV1,
  type ProfessorV3PartialModelAttemptFileV1,
  type ProfessorV3SmokeAttemptAccountingV1,
} from "./phase6a1-professor-v3-smoke-attempt-accounting-v1";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import {
  isProfessorV3ModelCallBudgetExhaustedErrorV1,
  PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1,
} from "./phase6a1-professor-v3-model-call-budget-v1";
import { assertProfessorV3SmokeFailureDecisionV7 } from "./phase6a1-professor-v3-smoke-failure-seal-v7";
import type {
  ProfessorV3ReviewedExecutionIdentityV9,
  ProfessorV3SmokeMaterialPinEntryV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v9";
import { sha256Bytes } from "./phase6a1-professor-v3-smoke-material-pins-v9";
import type { ProfessorV3SmokeOutputTargetsV6 } from "./phase6a1-professor-v3-smoke-output-targets-v6";
import { sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { isProfessorV3ModelResponseBoundaryError } from "./phase6a1-professor-v3-model-response-boundary-v1";
import { writeOnceMilestoneArtifact } from "./write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";

export const PROFESSOR_V3_SMOKE_TERMINAL_SEAL_V10_VERSION = "phase6a1-professor-v3-smoke-terminal-seal-v10";

export type ProfessorV3SmokeTerminalOutcomeV10 =
  | "SUCCESS"
  | "REPAIR_EXHAUSTED"
  | "FAILED_EXCEPTION"
  | "MODEL_CALL_BUDGET_EXHAUSTED";

export type ProfessorV3SmokeTerminalSealV10 = {
  version: typeof PROFESSOR_V3_SMOKE_TERMINAL_SEAL_V10_VERSION;
  generatedAt: string;
  decision: string;
  caseId: string;
  terminalOutcome: ProfessorV3SmokeTerminalOutcomeV10;
  caseStatus: string;
  executionStatus: string;
  executionStage: string;
  errorClass: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  stack: string | null;
  stackIdentity: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV9;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  attemptAccounting: ProfessorV3SmokeAttemptAccountingV1;
  modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[];
  partialModelAttemptFiles: ProfessorV3PartialModelAttemptFileV1[];
  executionTrace: ProfessorExecutionTraceV1 | null;
  runLedger: ProfessorRunLedgerV3 | null;
  validationDiagnostics: ProfessorV3SmokeTerminalValidationDiagnosticsV10 | null;
  stdout: string;
  stderr: string;
  backfilledFromSpentArtifacts?: boolean;
};

export type ProfessorV3SmokeTerminalValidationDiagnosticsV10 = {
  finalRepairRound: number | null;
  validationOutcomes:
    | Array<{
        hypothesisId: string;
        outcome: string;
        failedChecks: string[];
        issueCount: number;
        issues: Array<{ code: string; message: string; severity: string }>;
      }>
    | null;
  repairPrompt: string | null;
};

function enumeratePartialModelAttemptFiles(modelAttemptsDir: string): ProfessorV3PartialModelAttemptFileV1[] {
  if (!existsSync(modelAttemptsDir)) return [];
  return readdirSync(modelAttemptsDir)
    .filter((name) => name.startsWith("attempt-"))
    .sort()
    .map((name) => {
      const absolutePath = join(modelAttemptsDir, name);
      const exactBytes = readFileSync(absolutePath, "utf8");
      return { path: name, byteSize: statSync(absolutePath).size, sha256: sha256Bytes(exactBytes) };
    });
}

function resolveTerminalOutcomeFromOrchestration(
  orchestration: ProfessorCaseOrchestrationRecordV3,
): ProfessorV3SmokeTerminalOutcomeV10 {
  if (orchestration.caseStatus === "SUCCESS") return "SUCCESS";
  if (orchestration.caseStatus === "REPAIR_EXHAUSTED") return "REPAIR_EXHAUSTED";
  return "FAILED_EXCEPTION";
}

function resolveTerminalOutcomeFromError(error: unknown): ProfessorV3SmokeTerminalOutcomeV10 {
  if (isProfessorV3ModelCallBudgetExhaustedErrorV1(error)) return "MODEL_CALL_BUDGET_EXHAUSTED";
  return "FAILED_EXCEPTION";
}

function resolveErrorMetadata(error: unknown): {
  errorClass: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  stack: string | null;
} {
  if (error == null) {
    return { errorClass: null, errorCode: null, errorMessage: null, errorDetails: null, stack: null };
  }
  if (isProfessorV3ModelCallBudgetExhaustedErrorV1(error)) {
    return {
      errorClass: error.code,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: {
        maxModelApiCalls: error.maxModelApiCalls,
        attemptedCallIndex: error.attemptedCallIndex,
      },
      stack: error.stack ?? null,
    };
  }
  if (isProfessorV3ModelResponseBoundaryError(error)) {
    return {
      errorClass: error.code,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details as unknown as Record<string, unknown>,
      stack: error.stack ?? null,
    };
  }
  return {
    errorClass: error instanceof Error ? error.constructor.name : typeof error,
    errorCode: null,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorDetails: null,
    stack: error instanceof Error ? error.stack ?? null : null,
  };
}

function buildValidationDiagnostics(
  orchestration: ProfessorCaseOrchestrationRecordV3 | null | undefined,
): ProfessorV3SmokeTerminalValidationDiagnosticsV10 | null {
  if (!orchestration?.validationOutcomes) return null;
  const finalRound = orchestration.repairRounds.at(-1);
  return {
    finalRepairRound: finalRound?.round ?? null,
    validationOutcomes: orchestration.validationOutcomes.map((result) => ({
      hypothesisId: result.hypothesisId,
      outcome: result.outcome,
      failedChecks: result.failedChecks,
      issueCount: result.issues.length,
      issues: result.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        severity: issue.severity,
      })),
    })),
    repairPrompt: finalRound?.repairPrompt ?? null,
  };
}

export function sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10(args: {
  targets: ProfessorV3SmokeOutputTargetsV6;
  caseId: string;
  mechanismTruthCaseId: string;
  stackIdentity: string;
  executionStage: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV9;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[];
  executionTrace: ProfessorExecutionTraceV1 | null;
  runLedger: ProfessorRunLedgerV3 | null;
  stdout: string;
  stderr: string;
  decision: string;
  orchestration?: ProfessorCaseOrchestrationRecordV3 | null;
  error?: unknown;
  modelPinSha256?: string;
  semanticRelationshipSource?: unknown;
  materialPinReport?: unknown;
  requireLensCoverage?: boolean;
  professorToolCallCount?: number;
  professorToolCallAttemptCount?: number;
  professorToolCallCompletedCount?: number;
  backfilledFromSpentArtifacts?: boolean;
}): ProfessorV3SmokeTerminalSealV10 {
  assertProfessorV3SmokeFailureDecisionV7(args.decision);
  const partialModelAttemptFiles = enumeratePartialModelAttemptFiles(args.targets.modelAttemptsDir);
  const attemptAccounting = computeProfessorV3SmokeAttemptAccountingV1({
    executionTrace: args.executionTrace,
    partialModelAttemptFiles,
    modelAttemptArtifacts: args.modelAttemptArtifacts,
    professorToolCallCount:
      args.professorToolCallCompletedCount ??
      args.professorToolCallCount ??
      args.orchestration?.professorToolCallCompletedCount ??
      args.orchestration?.toolCalls.length ??
      0,
    professorToolCallAttemptCount:
      args.professorToolCallAttemptCount ?? args.orchestration?.professorToolCallAttemptCount,
    professorToolCallCompletedCount:
      args.professorToolCallCompletedCount ?? args.orchestration?.professorToolCallCompletedCount,
    repairAttemptCount: args.orchestration?.repairRounds.length,
  });

  const terminalOutcome = args.error
    ? resolveTerminalOutcomeFromError(args.error)
    : args.orchestration
      ? resolveTerminalOutcomeFromOrchestration(args.orchestration)
      : "FAILED_EXCEPTION";
  const errMeta = resolveErrorMetadata(args.error);
  const caseStatus = args.orchestration?.caseStatus ?? terminalOutcome;
  const executionStatus =
    terminalOutcome === "SUCCESS"
      ? "SUCCESS"
      : terminalOutcome === "REPAIR_EXHAUSTED"
        ? "REPAIR_EXHAUSTED"
        : terminalOutcome === "MODEL_CALL_BUDGET_EXHAUSTED"
          ? "MODEL_CALL_BUDGET_EXHAUSTED"
          : "FAILED_EXCEPTION";
  const validationDiagnostics = buildValidationDiagnostics(args.orchestration);

  const terminalSeal: ProfessorV3SmokeTerminalSealV10 = {
    version: PROFESSOR_V3_SMOKE_TERMINAL_SEAL_V10_VERSION,
    generatedAt: new Date().toISOString(),
    decision: args.decision,
    caseId: args.caseId,
    terminalOutcome,
    caseStatus,
    executionStatus,
    executionStage: args.executionStage,
    errorClass: errMeta.errorClass,
    errorCode: errMeta.errorCode,
    errorMessage: errMeta.errorMessage,
    errorDetails: errMeta.errorDetails,
    stack: errMeta.stack,
    stackIdentity: args.stackIdentity,
    independentlyReviewedExecutionAuthorization: args.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: args.reviewedExecutionIdentity,
    materialPins: args.materialPins,
    attemptAccounting,
    modelAttemptArtifacts: args.modelAttemptArtifacts,
    partialModelAttemptFiles,
    executionTrace: args.executionTrace,
    runLedger: args.runLedger,
    validationDiagnostics,
    stdout: args.stdout,
    stderr: args.stderr,
    backfilledFromSpentArtifacts: args.backfilledFromSpentArtifacts,
  };

  const resultArtifact = {
    version: "phase6a1-professor-v3-smoke-yuriko-prospective-result-v1",
    generatedAt: terminalSeal.generatedAt,
    decision: terminalSeal.decision,
    caseId: terminalSeal.caseId,
    mechanismTruthCaseId: args.mechanismTruthCaseId,
    stackIdentity: terminalSeal.stackIdentity,
    independentlyReviewedExecutionAuthorization: terminalSeal.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: terminalSeal.reviewedExecutionIdentity,
    executionMode: args.orchestration?.executionMode ?? "REAL_SMOKE",
    executionStatus: terminalSeal.executionStatus,
    caseStatus: terminalSeal.caseStatus,
    terminalOutcome: terminalSeal.terminalOutcome,
    modelPinSha256: args.modelPinSha256 ?? null,
    requireLensCoverage: args.requireLensCoverage ?? true,
    semanticRelationshipSource: args.semanticRelationshipSource ?? null,
    attemptAccounting: terminalSeal.attemptAccounting,
    modelAttemptArtifacts: terminalSeal.modelAttemptArtifacts,
    partialModelAttemptFiles: terminalSeal.partialModelAttemptFiles,
    validationDiagnostics: terminalSeal.validationDiagnostics,
    orchestration: args.orchestration ?? null,
    backfilledFromSpentArtifacts: args.backfilledFromSpentArtifacts ?? false,
  };

  if (!existsSync(args.targets.failure)) writeOnceMilestoneArtifact(args.targets.failure, terminalSeal);
  if (!existsSync(args.targets.result)) writeOnceMilestoneArtifact(args.targets.result, resultArtifact);
  if (terminalSeal.executionTrace && !existsSync(args.targets.executionTrace)) {
    writeOnceMilestoneArtifact(args.targets.executionTrace, terminalSeal.executionTrace);
  }
  if (terminalSeal.runLedger && !existsSync(args.targets.runLedger)) {
    writeOnceMilestoneArtifact(args.targets.runLedger, terminalSeal.runLedger);
  }
  if (!existsSync(args.targets.stdout)) writeOnceTextArtifact(args.targets.stdout, `${terminalSeal.stdout}\n`);
  if (!existsSync(args.targets.stderr)) {
    const stderrBody = [terminalSeal.stderr, terminalSeal.stack ?? ""].filter(Boolean).join("\n");
    writeOnceTextArtifact(args.targets.stderr, `${stderrBody}\n`);
  }

  const manifest = {
    version: "phase6a1-professor-v3-smoke-yuriko-prospective-manifest-v1",
    generatedAt: terminalSeal.generatedAt,
    decision: terminalSeal.decision,
    executeSwitch: "--execute",
    caseId: terminalSeal.caseId,
    stackIdentity: terminalSeal.stackIdentity,
    terminalOutcome: terminalSeal.terminalOutcome,
    executionStatus: terminalSeal.executionStatus,
    caseStatus: terminalSeal.caseStatus,
    executionStage: terminalSeal.executionStage,
    errorClass: terminalSeal.errorClass,
    errorCode: terminalSeal.errorCode,
    errorMessage: terminalSeal.errorMessage,
    independentlyReviewedExecutionAuthorization: terminalSeal.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: terminalSeal.reviewedExecutionIdentity,
    materialPinReport: args.materialPinReport ?? null,
    semanticRelationshipSource: args.semanticRelationshipSource ?? null,
    attemptAccounting: terminalSeal.attemptAccounting,
    modelAttemptArtifacts: terminalSeal.modelAttemptArtifacts,
    partialModelAttemptFiles: terminalSeal.partialModelAttemptFiles,
    validationDiagnostics: terminalSeal.validationDiagnostics,
    executionTracePresent: Boolean(terminalSeal.executionTrace),
    runLedgerPresent: Boolean(terminalSeal.runLedger),
    backfilledFromSpentArtifacts: args.backfilledFromSpentArtifacts ?? false,
    artifacts: {
      failure: existsSync(args.targets.failure) ? { path: args.targets.failure, sha256: sha256File(args.targets.failure) } : null,
      result: existsSync(args.targets.result) ? { path: args.targets.result, sha256: sha256File(args.targets.result) } : null,
      executionTrace: existsSync(args.targets.executionTrace)
        ? { path: args.targets.executionTrace, sha256: sha256File(args.targets.executionTrace) }
        : null,
      runLedger: existsSync(args.targets.runLedger) ? { path: args.targets.runLedger, sha256: sha256File(args.targets.runLedger) } : null,
      stdout: existsSync(args.targets.stdout) ? { path: args.targets.stdout, sha256: sha256File(args.targets.stdout) } : null,
      stderr: existsSync(args.targets.stderr) ? { path: args.targets.stderr, sha256: sha256File(args.targets.stderr) } : null,
      modelAttemptsDir: args.targets.modelAttemptsDir,
    },
  };
  if (!existsSync(args.targets.manifest)) writeOnceMilestoneArtifact(args.targets.manifest, manifest);

  return terminalSeal;
}

export { PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1 };
