/**
 * Write-once forensic seal for Korvold prospective Professor v3 smoke failures (v8).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProfessorExecutionTraceV1 } from "../../src/lib/deck-synthesis/professor-v3-execution-trace-v1";
import type { ProfessorRunLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import {
  isProfessorV3KorvoldModelRequestBoundaryErrorV1,
  PROFESSOR_V3_KORVOLD_MODEL_REQUEST_BOUNDARY_REACHED_V1,
} from "./phase6a1-professor-v3-korvold-model-request-boundary-v1";
import {
  computeProfessorV3SmokeAttemptAccountingV1,
  type ProfessorV3PartialModelAttemptFileV1,
  type ProfessorV3SmokeAttemptAccountingV1,
} from "./phase6a1-professor-v3-smoke-attempt-accounting-v1";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import { assertProfessorV3SmokeFailureDecisionV7 } from "./phase6a1-professor-v3-smoke-failure-seal-v7";
import type {
  ProfessorV3ReviewedExecutionIdentityV8,
  ProfessorV3SmokeMaterialPinEntryV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v8";
import { sha256Bytes } from "./phase6a1-professor-v3-smoke-material-pins-v8";
import type { ProfessorV3SmokeOutputTargetsV6 } from "./phase6a1-professor-v3-smoke-output-targets-v6";
import { sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { isProfessorV3ModelResponseBoundaryError } from "./phase6a1-professor-v3-model-response-boundary-v1";
import { writeOnceMilestoneArtifact } from "./write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";

export const PROFESSOR_V3_SMOKE_FAILURE_SEAL_V8_VERSION = "phase6a1-professor-v3-smoke-failure-seal-v8";

export type ProfessorV3SmokeFailureSealV8 = {
  version: typeof PROFESSOR_V3_SMOKE_FAILURE_SEAL_V8_VERSION;
  generatedAt: string;
  decision: string;
  caseId: string;
  executionStatus: "FAILED_EXCEPTION";
  executionStage: string;
  errorClass: string;
  errorCode: string | null;
  errorMessage: string;
  errorDetails: Record<string, unknown> | null;
  stack: string;
  stackIdentity: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV8;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  attemptAccounting: ProfessorV3SmokeAttemptAccountingV1;
  modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[];
  partialModelAttemptFiles: ProfessorV3PartialModelAttemptFileV1[];
  executionTrace: ProfessorExecutionTraceV1 | null;
  runLedger: ProfessorRunLedgerV3 | null;
  stdout: string;
  stderr: string;
};

function resolveFailureErrorMetadata(error: unknown): {
  errorClass: string;
  errorCode: string | null;
  errorMessage: string;
  errorDetails: Record<string, unknown> | null;
} {
  if (isProfessorV3KorvoldModelRequestBoundaryErrorV1(error)) {
    return {
      errorClass: error.code,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: { reachedStage: error.reachedStage },
    };
  }
  if (isProfessorV3ModelResponseBoundaryError(error)) {
    return {
      errorClass: error.code,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details as unknown as Record<string, unknown>,
    };
  }
  return {
    errorClass: error instanceof Error ? error.constructor.name : typeof error,
    errorCode: null,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorDetails: null,
  };
}

export function enumerateProfessorV3PartialModelAttemptFilesV8(modelAttemptsDir: string): ProfessorV3PartialModelAttemptFileV1[] {
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

export function sealProfessorV3KorvoldProspectiveSmokeExecutionFailureV8(args: {
  targets: ProfessorV3SmokeOutputTargetsV6;
  caseId: string;
  executionStage: string;
  error: unknown;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  stackIdentity: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV8;
  modelAttemptArtifacts?: ProfessorV3ModelAttemptArtifactRecordV3[];
  executionTrace?: ProfessorExecutionTraceV1 | null;
  runLedger?: ProfessorRunLedgerV3 | null;
  stdout?: string;
  stderr?: string;
  decision: string;
  professorToolCallCount?: number;
}): ProfessorV3SmokeFailureSealV8 {
  assertProfessorV3SmokeFailureDecisionV7(args.decision);
  const errMeta = resolveFailureErrorMetadata(args.error);
  const partialModelAttemptFiles = enumerateProfessorV3PartialModelAttemptFilesV8(args.targets.modelAttemptsDir);
  const attemptAccounting = computeProfessorV3SmokeAttemptAccountingV1({
    executionTrace: args.executionTrace ?? null,
    partialModelAttemptFiles,
    modelAttemptArtifacts: args.modelAttemptArtifacts ?? [],
    professorToolCallCount: args.professorToolCallCount ?? 0,
  });
  const failure: ProfessorV3SmokeFailureSealV8 = {
    version: PROFESSOR_V3_SMOKE_FAILURE_SEAL_V8_VERSION,
    generatedAt: new Date().toISOString(),
    decision: args.decision,
    caseId: args.caseId,
    executionStatus: "FAILED_EXCEPTION",
    executionStage: args.executionStage,
    errorClass: errMeta.errorClass,
    errorCode: errMeta.errorCode,
    errorMessage: errMeta.errorMessage,
    errorDetails: errMeta.errorDetails,
    stack: args.error instanceof Error ? args.error.stack ?? "" : "",
    stackIdentity: args.stackIdentity,
    independentlyReviewedExecutionAuthorization: args.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: args.reviewedExecutionIdentity,
    materialPins: args.materialPins,
    attemptAccounting,
    modelAttemptArtifacts: args.modelAttemptArtifacts ?? [],
    partialModelAttemptFiles,
    executionTrace: args.executionTrace ?? null,
    runLedger: args.runLedger ?? null,
    stdout: args.stdout ?? "",
    stderr: args.stderr ?? "",
  };

  const resultArtifact = {
    version: "phase6a1-professor-v3-smoke-korvold-prospective-result-v1",
    generatedAt: failure.generatedAt,
    decision: failure.decision,
    caseId: failure.caseId,
    executionStatus: failure.executionStatus,
    executionStage: failure.executionStage,
    stackIdentity: failure.stackIdentity,
    independentlyReviewedExecutionAuthorization: failure.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: failure.reviewedExecutionIdentity,
    attemptAccounting: failure.attemptAccounting,
    modelAttemptArtifacts: failure.modelAttemptArtifacts,
    partialModelAttemptFiles: failure.partialModelAttemptFiles,
    executionTrace: failure.executionTrace,
    runLedger: failure.runLedger,
    errorClass: failure.errorClass,
    errorCode: failure.errorCode,
    errorMessage: failure.errorMessage,
    errorDetails: failure.errorDetails,
    modelRequestBoundaryReached: failure.errorCode === PROFESSOR_V3_KORVOLD_MODEL_REQUEST_BOUNDARY_REACHED_V1 ||
      failure.executionStage === "MODEL_REQUEST",
  };

  if (!existsSync(args.targets.failure)) writeOnceMilestoneArtifact(args.targets.failure, failure);
  if (!existsSync(args.targets.result)) writeOnceMilestoneArtifact(args.targets.result, resultArtifact);
  if (failure.executionTrace && !existsSync(args.targets.executionTrace)) {
    writeOnceMilestoneArtifact(args.targets.executionTrace, failure.executionTrace);
  }
  if (failure.runLedger && !existsSync(args.targets.runLedger)) {
    writeOnceMilestoneArtifact(args.targets.runLedger, failure.runLedger);
  }
  if (!existsSync(args.targets.stdout)) writeOnceTextArtifact(args.targets.stdout, `${failure.stdout}\n`);
  if (!existsSync(args.targets.stderr)) writeOnceTextArtifact(args.targets.stderr, `${failure.stderr}\n${failure.stack}\n`);

  const manifest = {
    version: "phase6a1-professor-v3-smoke-korvold-prospective-manifest-v1",
    generatedAt: failure.generatedAt,
    decision: failure.decision,
    caseId: failure.caseId,
    executionStatus: failure.executionStatus,
    executionStage: failure.executionStage,
    errorClass: failure.errorClass,
    errorCode: failure.errorCode,
    errorMessage: failure.errorMessage,
    stackIdentity: failure.stackIdentity,
    independentlyReviewedExecutionAuthorization: failure.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: failure.reviewedExecutionIdentity,
    materialPins: failure.materialPins,
    attemptAccounting: failure.attemptAccounting,
    modelAttemptArtifacts: failure.modelAttemptArtifacts,
    partialModelAttemptFiles: failure.partialModelAttemptFiles,
    executionTracePresent: Boolean(failure.executionTrace),
    runLedgerPresent: Boolean(failure.runLedger),
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
  return failure;
}

export { PROFESSOR_V3_KORVOLD_MODEL_REQUEST_BOUNDARY_REACHED_V1 };
