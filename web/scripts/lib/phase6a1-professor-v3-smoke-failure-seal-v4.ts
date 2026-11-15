/**
 * Write-once forensic seal for thrown Professor v3 smoke execution failures (v4).
 * Binds partial model-attempt files present on disk at failure time.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProfessorExecutionTraceV1 } from "../../src/lib/deck-synthesis/professor-v3-execution-trace-v1";
import type { ProfessorRunLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import type {
  ProfessorV3ReviewedExecutionIdentityV3,
  ProfessorV3SmokeMaterialPinEntryV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v3";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV4 } from "./phase6a1-professor-v3-smoke-execution-authorization-v4";
import type { ProfessorV3SmokeOutputTargetsV2 } from "./phase6a1-professor-v3-smoke-output-targets-v2";
import { sha256Bytes } from "./phase6a1-professor-v3-smoke-material-pins-v3";
import { sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { writeOnceMilestoneArtifact } from "./write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";

export const PROFESSOR_V3_SMOKE_FAILURE_SEAL_V4_VERSION = "phase6a1-professor-v3-smoke-failure-seal-v4";

export type ProfessorV3PartialModelAttemptFileV4 = {
  path: string;
  byteSize: number;
  sha256: string;
};

export type ProfessorV3SmokeFailureSealV4 = {
  version: typeof PROFESSOR_V3_SMOKE_FAILURE_SEAL_V4_VERSION;
  generatedAt: string;
  decision: string;
  caseId: string;
  executionStatus: "FAILED_EXCEPTION";
  executionStage: string;
  errorClass: string;
  errorMessage: string;
  stack: string;
  stackIdentity: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV4;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV3;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[];
  partialModelAttemptFiles: ProfessorV3PartialModelAttemptFileV4[];
  executionTrace: ProfessorExecutionTraceV1 | null;
  runLedger: ProfessorRunLedgerV3 | null;
  stdout: string;
  stderr: string;
};

export function enumerateProfessorV3PartialModelAttemptFilesV4(
  modelAttemptsDir: string,
): ProfessorV3PartialModelAttemptFileV4[] {
  if (!existsSync(modelAttemptsDir)) return [];
  return readdirSync(modelAttemptsDir)
    .filter((name) => name.startsWith("attempt-"))
    .sort()
    .map((name) => {
      const absolutePath = join(modelAttemptsDir, name);
      const exactBytes = readFileSync(absolutePath, "utf8");
      return {
        path: name,
        byteSize: statSync(absolutePath).size,
        sha256: sha256Bytes(exactBytes),
      };
    });
}

export function sealProfessorV3SmokeExecutionFailureV4(args: {
  targets: ProfessorV3SmokeOutputTargetsV2;
  caseId: string;
  executionStage: string;
  error: unknown;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  stackIdentity: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV4;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV3;
  modelAttemptArtifacts?: ProfessorV3ModelAttemptArtifactRecordV3[];
  executionTrace?: ProfessorExecutionTraceV1 | null;
  runLedger?: ProfessorRunLedgerV3 | null;
  stdout?: string;
  stderr?: string;
  decision?: string;
}): ProfessorV3SmokeFailureSealV4 {
  const err = args.error;
  const partialModelAttemptFiles = enumerateProfessorV3PartialModelAttemptFilesV4(args.targets.modelAttemptsDir);
  const failure: ProfessorV3SmokeFailureSealV4 = {
    version: PROFESSOR_V3_SMOKE_FAILURE_SEAL_V4_VERSION,
    generatedAt: new Date().toISOString(),
    decision:
      args.decision ?? "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V4_INITIAL_RAG_AND_FAILURE_SEAL_CLOSURE_REQUIRED",
    caseId: args.caseId,
    executionStatus: "FAILED_EXCEPTION",
    executionStage: args.executionStage,
    errorClass: err instanceof Error ? err.constructor.name : typeof err,
    errorMessage: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack ?? "" : "",
    stackIdentity: args.stackIdentity,
    independentlyReviewedExecutionAuthorization: args.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: args.reviewedExecutionIdentity,
    materialPins: args.materialPins,
    modelAttemptArtifacts: args.modelAttemptArtifacts ?? [],
    partialModelAttemptFiles,
    executionTrace: args.executionTrace ?? null,
    runLedger: args.runLedger ?? null,
    stdout: args.stdout ?? "",
    stderr: args.stderr ?? "",
  };

  const resultArtifact = {
    version: "phase6a1-professor-v3-smoke-muldrotha-result-v1",
    generatedAt: failure.generatedAt,
    decision: failure.decision,
    caseId: failure.caseId,
    executionStatus: failure.executionStatus,
    executionStage: failure.executionStage,
    stackIdentity: failure.stackIdentity,
    independentlyReviewedExecutionAuthorization: failure.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: failure.reviewedExecutionIdentity,
    modelAttemptArtifacts: failure.modelAttemptArtifacts,
    partialModelAttemptFiles: failure.partialModelAttemptFiles,
    executionTrace: failure.executionTrace,
    runLedger: failure.runLedger,
    errorClass: failure.errorClass,
    errorMessage: failure.errorMessage,
  };

  if (!existsSync(args.targets.failure)) {
    writeOnceMilestoneArtifact(args.targets.failure, failure);
  }
  if (!existsSync(args.targets.result)) {
    writeOnceMilestoneArtifact(args.targets.result, resultArtifact);
  }
  if (failure.executionTrace && !existsSync(args.targets.executionTrace)) {
    writeOnceMilestoneArtifact(args.targets.executionTrace, failure.executionTrace);
  }
  if (failure.runLedger && !existsSync(args.targets.runLedger)) {
    writeOnceMilestoneArtifact(args.targets.runLedger, failure.runLedger);
  }
  if (!existsSync(args.targets.stdout)) {
    writeOnceTextArtifact(args.targets.stdout, `${failure.stdout}\n`);
  }
  if (!existsSync(args.targets.stderr)) {
    writeOnceTextArtifact(args.targets.stderr, `${failure.stderr}\n${failure.stack}\n`);
  }

  const manifest = {
    version: "phase6a1-professor-v3-smoke-muldrotha-manifest-v1",
    generatedAt: failure.generatedAt,
    decision: failure.decision,
    caseId: failure.caseId,
    executionStatus: failure.executionStatus,
    executionStage: failure.executionStage,
    errorClass: failure.errorClass,
    errorMessage: failure.errorMessage,
    stackIdentity: failure.stackIdentity,
    independentlyReviewedExecutionAuthorization: failure.independentlyReviewedExecutionAuthorization,
    reviewedExecutionIdentity: failure.reviewedExecutionIdentity,
    materialPins: failure.materialPins,
    modelAttemptArtifacts: failure.modelAttemptArtifacts,
    partialModelAttemptFiles: failure.partialModelAttemptFiles,
    executionTracePresent: Boolean(failure.executionTrace),
    runLedgerPresent: Boolean(failure.runLedger),
    artifacts: {
      failure: existsSync(args.targets.failure)
        ? { path: args.targets.failure, sha256: sha256File(args.targets.failure) }
        : null,
      result: existsSync(args.targets.result) ? { path: args.targets.result, sha256: sha256File(args.targets.result) } : null,
      executionTrace: existsSync(args.targets.executionTrace)
        ? { path: args.targets.executionTrace, sha256: sha256File(args.targets.executionTrace) }
        : null,
      runLedger: existsSync(args.targets.runLedger)
        ? { path: args.targets.runLedger, sha256: sha256File(args.targets.runLedger) }
        : null,
      stdout: existsSync(args.targets.stdout) ? { path: args.targets.stdout, sha256: sha256File(args.targets.stdout) } : null,
      stderr: existsSync(args.targets.stderr) ? { path: args.targets.stderr, sha256: sha256File(args.targets.stderr) } : null,
      modelAttemptsDir: args.targets.modelAttemptsDir,
    },
  };
  if (!existsSync(args.targets.manifest)) {
    writeOnceMilestoneArtifact(args.targets.manifest, manifest);
  }

  return failure;
}
