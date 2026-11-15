/**
 * Consistent Professor v3 smoke attempt accounting — API calls vs artifact files.
 */
import type { ProfessorExecutionTraceV1 } from "../../src/lib/deck-synthesis/professor-v3-execution-trace-v1";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";

export const PROFESSOR_V3_SMOKE_ATTEMPT_ACCOUNTING_V1_VERSION = "phase6a1-professor-v3-smoke-attempt-accounting-v1";

export type ProfessorV3PartialModelAttemptFileV1 = {
  path: string;
  byteSize: number;
  sha256: string;
};

export type ProfessorV3SmokeModelAttemptSummaryV1 = {
  attemptIndex: number;
  afterToolResults: boolean;
  httpStatus: number | null;
  apiResponseRawArtifact: string | null;
  artifactFileCount: number;
};

export type ProfessorV3SmokeAttemptAccountingV1 = {
  version: typeof PROFESSOR_V3_SMOKE_ATTEMPT_ACCOUNTING_V1_VERSION;
  modelApiCallCount: number;
  modelAttempts: ProfessorV3SmokeModelAttemptSummaryV1[];
  modelAttemptArtifactCount: number;
  repairAttemptCount: number;
  professorToolCallCount: number;
  professorToolCallAttemptCount: number;
  professorToolCallCompletedCount: number;
  modelApiCallAttemptCount?: number;
};

function attemptIndexFromPartialPath(path: string): number | null {
  const match = path.match(/^attempt-(\d+)-/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function groupProfessorV3PartialModelAttemptFilesByApiCall(
  partialModelAttemptFiles: ProfessorV3PartialModelAttemptFileV1[],
): Map<number, ProfessorV3PartialModelAttemptFileV1[]> {
  const grouped = new Map<number, ProfessorV3PartialModelAttemptFileV1[]>();
  for (const file of partialModelAttemptFiles) {
    const attemptIndex = attemptIndexFromPartialPath(file.path);
    if (attemptIndex === null) continue;
    const bucket = grouped.get(attemptIndex) ?? [];
    bucket.push(file);
    grouped.set(attemptIndex, bucket);
  }
  return grouped;
}

export function computeProfessorV3SmokeAttemptAccountingV1(args: {
  executionTrace?: ProfessorExecutionTraceV1 | null;
  partialModelAttemptFiles?: ProfessorV3PartialModelAttemptFileV1[];
  modelAttemptArtifacts?: ProfessorV3ModelAttemptArtifactRecordV3[];
  repairAttemptCount?: number;
  professorToolCallCount?: number;
  professorToolCallAttemptCount?: number;
  professorToolCallCompletedCount?: number;
  modelApiCallAttemptCount?: number;
}): ProfessorV3SmokeAttemptAccountingV1 {
  const partialModelAttemptFiles = args.partialModelAttemptFiles ?? [];
  const modelAttemptArtifacts = args.modelAttemptArtifacts ?? [];
  const grouped = groupProfessorV3PartialModelAttemptFilesByApiCall(partialModelAttemptFiles);
  const attemptIndexes = [...new Set([...grouped.keys(), ...modelAttemptArtifacts.map((a) => a.attemptIndex)])].sort(
    (a, b) => a - b,
  );

  const modelAttempts: ProfessorV3SmokeModelAttemptSummaryV1[] = attemptIndexes.map((attemptIndex) => {
    const artifact = modelAttemptArtifacts.find((entry) => entry.attemptIndex === attemptIndex);
    const files = grouped.get(attemptIndex) ?? [];
    return {
      attemptIndex,
      afterToolResults: artifact?.afterToolResults ?? false,
      httpStatus: artifact?.httpStatus ?? null,
      apiResponseRawArtifact: artifact?.apiResponseRawArtifact ?? null,
      artifactFileCount: files.length,
    };
  });

  const traceApiCallCount = args.executionTrace?.modelAttempts.length ?? 0;
  const groupedApiCallCount = grouped.size;
  const artifactApiCallCount = new Set(modelAttemptArtifacts.map((entry) => entry.attemptIndex)).size;
  const modelApiCallCount = Math.max(traceApiCallCount, groupedApiCallCount, artifactApiCallCount, modelAttempts.length);

  const professorToolCallCompletedCount =
    args.professorToolCallCompletedCount ?? args.professorToolCallCount ?? 0;
  const professorToolCallAttemptCount =
    args.professorToolCallAttemptCount ?? professorToolCallCompletedCount;

  return {
    version: PROFESSOR_V3_SMOKE_ATTEMPT_ACCOUNTING_V1_VERSION,
    modelApiCallCount,
    modelAttempts,
    modelAttemptArtifactCount: partialModelAttemptFiles.length,
    repairAttemptCount: args.repairAttemptCount ?? args.executionTrace?.repairAttempts.length ?? 0,
    professorToolCallCount: professorToolCallCompletedCount,
    professorToolCallAttemptCount,
    professorToolCallCompletedCount,
    modelApiCallAttemptCount: args.modelApiCallAttemptCount ?? modelApiCallCount,
  };
}
