/**
 * Write-once forensic seal for thrown Professor v3 successor smoke execution failures (v5).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProfessorExecutionTraceV1 } from "../../src/lib/deck-synthesis/professor-v3-execution-trace-v1";
import type { ProfessorRunLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import type {
  ProfessorV3ReviewedExecutionIdentityV6,
  ProfessorV3SmokeMaterialPinEntryV3,
} from "./phase6a1-professor-v3-smoke-material-pins-v5";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV6 } from "./phase6a1-professor-v3-smoke-execution-authorization-v6";
import type { ProfessorV3SmokeOutputTargetsV4 } from "./phase6a1-professor-v3-smoke-output-targets-v4";
import { sha256Bytes } from "./phase6a1-professor-v3-smoke-material-pins-v5";
import { sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { writeOnceMilestoneArtifact } from "./write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";

export const PROFESSOR_V3_SMOKE_FAILURE_SEAL_V6_VERSION = "phase6a1-professor-v3-smoke-failure-seal-v6";

export type ProfessorV3PartialModelAttemptFileV6 = {
  path: string;
  byteSize: number;
  sha256: string;
};

export type ProfessorV3SmokeFailureSealV6 = {
  version: typeof PROFESSOR_V3_SMOKE_FAILURE_SEAL_V6_VERSION;
  generatedAt: string;
  decision: string;
  caseId: string;
  executionStatus: "FAILED_EXCEPTION";
  executionStage: string;
  errorClass: string;
  errorMessage: string;
  stack: string;
  stackIdentity: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV6;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV6;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[];
  partialModelAttemptFiles: ProfessorV3PartialModelAttemptFileV6[];
  executionTrace: ProfessorExecutionTraceV1 | null;
  runLedger: ProfessorRunLedgerV3 | null;
  stdout: string;
  stderr: string;
};

export function enumerateProfessorV3PartialModelAttemptFilesV6(
  modelAttemptsDir: string,
): ProfessorV3PartialModelAttemptFileV6[] {
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

export function sealProfessorV3SmokeExecutionFailureV6(args: {
  targets: ProfessorV3SmokeOutputTargetsV4;
  caseId: string;
  executionStage: string;
  error: unknown;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV3[] };
  stackIdentity: string;
  independentlyReviewedExecutionAuthorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV6;
  reviewedExecutionIdentity: ProfessorV3ReviewedExecutionIdentityV6;
  modelAttemptArtifacts?: ProfessorV3ModelAttemptArtifactRecordV3[];
  executionTrace?: ProfessorExecutionTraceV1 | null;
  runLedger?: ProfessorRunLedgerV3 | null;
  stdout?: string;
  stderr?: string;
  decision?: string;
}): ProfessorV3SmokeFailureSealV6 {
  const err = args.error;
  const partialModelAttemptFiles = enumerateProfessorV3PartialModelAttemptFilesV6(args.targets.modelAttemptsDir);
  const failure: ProfessorV3SmokeFailureSealV6 = {
    version: PROFESSOR_V3_SMOKE_FAILURE_SEAL_V6_VERSION,
    generatedAt: new Date().toISOString(),
    decision:
      args.decision ??
      "PROFESSOR_V3_SUCCESSOR_SMOKE_V1_SPENT_FAIL_API_SCHEMA_TYPE_ANNOTATION_REPAIR_REQUIRED_NO_MODEL",
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
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-result-v2",
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

  if (!existsSync(args.targets.failure)) writeOnceMilestoneArtifact(args.targets.failure, failure);
  if (!existsSync(args.targets.result)) writeOnceMilestoneArtifact(args.targets.result, resultArtifact);
  if (failure.executionTrace && !existsSync(args.targets.executionTrace)) {
    writeOnceMilestoneArtifact(args.targets.executionTrace, failure.executionTrace);
  }
  if (failure.runLedger && !existsSync(args.targets.runLedger)) writeOnceMilestoneArtifact(args.targets.runLedger, failure.runLedger);
  if (!existsSync(args.targets.stdout)) writeOnceTextArtifact(args.targets.stdout, `${failure.stdout}\n`);
  if (!existsSync(args.targets.stderr)) writeOnceTextArtifact(args.targets.stderr, `${failure.stderr}\n${failure.stack}\n`);

  const manifest = {
    version: "phase6a1-professor-v3-smoke-muldrotha-successor-manifest-v2",
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
