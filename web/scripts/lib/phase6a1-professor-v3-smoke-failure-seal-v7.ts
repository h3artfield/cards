/**
 * Write-once forensic seal for Professor v3 smoke failures (v7) — required decision + attempt accounting.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProfessorExecutionTraceV1 } from "../../src/lib/deck-synthesis/professor-v3-execution-trace-v1";
import type { ProfessorRunLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import {
  computeProfessorV3SmokeAttemptAccountingV1,
  type ProfessorV3PartialModelAttemptFileV1,
  type ProfessorV3SmokeAttemptAccountingV1,
} from "./phase6a1-professor-v3-smoke-attempt-accounting-v1";
import type {
  ProfessorV3ReviewedExecutionIdentityV6,
  ProfessorV3SmokeMaterialPinEntryV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v6";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV7 } from "./phase6a1-professor-v3-smoke-execution-authorization-v7";
import type { ProfessorV3SmokeOutputTargetsV5 } from "./phase6a1-professor-v3-smoke-output-targets-v5";
import { sha256Bytes } from "./phase6a1-professor-v3-smoke-material-pins-v6";
import { sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { isProfessorV3ModelResponseBoundaryError } from "./phase6a1-professor-v3-model-response-boundary-v1";
import { writeOnceMilestoneArtifact } from "./write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";

export const PROFESSOR_V3_SMOKE_FAILURE_SEAL_V7_VERSION = "phase6a1-professor-v3-smoke-failure-seal-v7";

export const PROFESSOR_V3_STALE_SMOKE_DECISION_STRINGS_V7 = [
  "PROFESSOR_V3_SUCCESSOR_SMOKE_V1_SPENT_FAIL_API_SCHEMA_TYPE_ANNOTATION_REPAIR_REQUIRED_NO_MODEL",
] as const;

export type ProfessorV3PartialModelAttemptFileV7 = ProfessorV3PartialModelAttemptFileV1;

export type ProfessorV3SmokeFailureSealV7 = {
  version: typeof PROFESSOR_V3_SMOKE_FAILURE_SEAL_V7_VERSION;
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
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV7;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV6;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  attemptAccounting: ProfessorV3SmokeAttemptAccountingV1;
  modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[];
  partialModelAttemptFiles: ProfessorV3PartialModelAttemptFileV7[];
  executionTrace: ProfessorExecutionTraceV1 | null;
  runLedger: ProfessorRunLedgerV3 | null;
  stdout: string;
  stderr: string;
};

export function assertProfessorV3SmokeFailureDecisionV7(decision: string): void {
  if (!decision.trim()) throw new Error("Professor v3 smoke failure seal requires explicit decision");
  if (PROFESSOR_V3_STALE_SMOKE_DECISION_STRINGS_V7.includes(decision as (typeof PROFESSOR_V3_STALE_SMOKE_DECISION_STRINGS_V7)[number])) {
    throw new Error(`Professor v3 smoke failure seal rejects stale decision string: ${decision}`);
  }
}

export function enumerateProfessorV3PartialModelAttemptFilesV7(
  modelAttemptsDir: string,
): ProfessorV3PartialModelAttemptFileV7[] {
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

function resolveFailureErrorMetadata(error: unknown): {
  errorClass: string;
  errorCode: string | null;
  errorMessage: string;
  errorDetails: Record<string, unknown> | null;
} {
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

export function sealProfessorV3SmokeExecutionFailureV7(args: {
  targets: ProfessorV3SmokeOutputTargetsV5;
  caseId: string;
  executionStage: string;
  error: unknown;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  stackIdentity: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV7;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV6;
  modelAttemptArtifacts?: ProfessorV3ModelAttemptArtifactRecordV3[];
  executionTrace?: ProfessorExecutionTraceV1 | null;
  runLedger?: ProfessorRunLedgerV3 | null;
  stdout?: string;
  stderr?: string;
  decision: string;
  professorToolCallCount?: number;
}): ProfessorV3SmokeFailureSealV7 {
  assertProfessorV3SmokeFailureDecisionV7(args.decision);
  const errMeta = resolveFailureErrorMetadata(args.error);
  const partialModelAttemptFiles = enumerateProfessorV3PartialModelAttemptFilesV7(args.targets.modelAttemptsDir);
  const attemptAccounting = computeProfessorV3SmokeAttemptAccountingV1({
    executionTrace: args.executionTrace ?? null,
    partialModelAttemptFiles,
    modelAttemptArtifacts: args.modelAttemptArtifacts ?? [],
    professorToolCallCount: args.professorToolCallCount ?? 0,
  });
  const failure: ProfessorV3SmokeFailureSealV7 = {
    version: PROFESSOR_V3_SMOKE_FAILURE_SEAL_V7_VERSION,
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
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-result-v3",
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
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-manifest-v3",
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
