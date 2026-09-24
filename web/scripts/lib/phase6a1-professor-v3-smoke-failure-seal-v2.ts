/**
 * Write-once forensic seal for thrown Professor v3 smoke execution failures.
 */
import { existsSync } from "node:fs";
import type { ProfessorRunLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import type { ProfessorV3ModelAttemptArtifactRecordV2 } from "./phase6a1-professor-v3-model-attempt-artifacts-v2";
import type { ProfessorV3SmokeMaterialPinEntryV2 } from "./phase6a1-professor-v3-smoke-material-pins-v2";
import type { ProfessorV3SmokeOutputTargetsV2 } from "./phase6a1-professor-v3-smoke-output-targets-v2";
import { sha256File } from "./phase6a1-pinned-implementation-container-v1";
import { writeOnceMilestoneArtifact } from "./write-once-milestone-artifact-v2";
import { writeOnceTextArtifact } from "./write-once-text-artifact-v1";

export const PROFESSOR_V3_SMOKE_FAILURE_SEAL_V2_VERSION = "phase6a1-professor-v3-smoke-failure-seal-v2";

export type ProfessorV3SmokeFailureSealV2 = {
  version: typeof PROFESSOR_V3_SMOKE_FAILURE_SEAL_V2_VERSION;
  generatedAt: string;
  decision: string;
  caseId: string;
  executionStatus: "FAILED_EXCEPTION";
  executionStage: string;
  errorClass: string;
  errorMessage: string;
  stack: string;
  stackIdentity: string;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV2[] };
  modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV2[];
  runLedger: ProfessorRunLedgerV3 | null;
  stdout: string;
  stderr: string;
};

export function sealProfessorV3SmokeExecutionFailureV2(args: {
  targets: ProfessorV3SmokeOutputTargetsV2;
  caseId: string;
  executionStage: string;
  error: unknown;
  materialPins: { fileCount: number; files: ProfessorV3SmokeMaterialPinEntryV2[] };
  stackIdentity: string;
  modelAttemptArtifacts?: ProfessorV3ModelAttemptArtifactRecordV2[];
  runLedger?: ProfessorRunLedgerV3 | null;
  stdout?: string;
  stderr?: string;
  decision?: string;
}): ProfessorV3SmokeFailureSealV2 {
  const err = args.error;
  const failure: ProfessorV3SmokeFailureSealV2 = {
    version: PROFESSOR_V3_SMOKE_FAILURE_SEAL_V2_VERSION,
    generatedAt: new Date().toISOString(),
    decision: args.decision ?? "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V2_EXECUTION_SEAL_AND_EXACT_IO_REQUIRED",
    caseId: args.caseId,
    executionStatus: "FAILED_EXCEPTION",
    executionStage: args.executionStage,
    errorClass: err instanceof Error ? err.constructor.name : typeof err,
    errorMessage: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack ?? "" : "",
    stackIdentity: args.stackIdentity,
    materialPins: args.materialPins,
    modelAttemptArtifacts: args.modelAttemptArtifacts ?? [],
    runLedger: args.runLedger ?? null,
    stdout: args.stdout ?? "",
    stderr: args.stderr ?? "",
  };

  if (!existsSync(args.targets.failure)) {
    writeOnceMilestoneArtifact(args.targets.failure, failure);
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
    materialPins: failure.materialPins,
    modelAttemptArtifacts: failure.modelAttemptArtifacts,
    artifacts: {
      failure: existsSync(args.targets.failure)
        ? { path: args.targets.failure, sha256: sha256File(args.targets.failure) }
        : null,
      stdout: existsSync(args.targets.stdout) ? { path: args.targets.stdout, sha256: sha256File(args.targets.stdout) } : null,
      stderr: existsSync(args.targets.stderr) ? { path: args.targets.stderr, sha256: sha256File(args.targets.stderr) } : null,
    },
  };
  if (!existsSync(args.targets.manifest)) {
    writeOnceMilestoneArtifact(args.targets.manifest, manifest);
  }

  return failure;
}
