/**
 * Append-only Professor v3 execution trace — model attempts, tool/retrieval events, repairs.
 */
import { createHash } from "node:crypto";
import type { ProfessorRunLedgerV3 } from "./professor-v3-run-ledger-v1";
import { runLedgerSha256 } from "./professor-v3-run-ledger-v1";

export const PROFESSOR_V3_EXECUTION_TRACE_V1_VERSION = "professor-v3-execution-trace-v1";

export type ProfessorModelAttemptTraceV1 = {
  attemptIndex: number;
  systemPromptSha256: string;
  userPayloadSha256: string;
  repairPromptSha256: string | null;
  rawResponseSha256: string;
  afterToolResults: boolean;
  systemPromptArtifact?: string;
  userPayloadArtifact?: string;
  repairPromptArtifact?: string | null;
  rawResponseArtifact?: string;
};

export type ProfessorRepairAttemptTraceV1 = {
  repairIndex: number;
  modelAttemptIndex: number;
  repairPromptSha256: string;
};

export type ProfessorExecutionTraceV1 = {
  version: typeof PROFESSOR_V3_EXECUTION_TRACE_V1_VERSION;
  caseId: string;
  modelAttempts: ProfessorModelAttemptTraceV1[];
  repairAttempts: ProfessorRepairAttemptTraceV1[];
};

export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256Json(value: unknown): string {
  return sha256Text(JSON.stringify(value));
}

export function createExecutionTrace(caseId: string): ProfessorExecutionTraceV1 {
  return { version: PROFESSOR_V3_EXECUTION_TRACE_V1_VERSION, caseId, modelAttempts: [], repairAttempts: [] };
}

export function appendModelAttemptTrace(args: {
  trace: ProfessorExecutionTraceV1;
  attemptIndex: number;
  systemPrompt: string;
  userPayload: unknown;
  repairPrompt?: string;
  rawResponse: unknown;
  afterToolResults?: boolean;
  artifacts?: {
    systemPromptArtifact: string;
    userPayloadArtifact: string;
    repairPromptArtifact: string | null;
    rawResponseArtifact: string;
  };
}): ProfessorExecutionTraceV1 {
  const attempt: ProfessorModelAttemptTraceV1 = {
    attemptIndex: args.attemptIndex,
    systemPromptSha256: sha256Text(args.systemPrompt),
    userPayloadSha256: sha256Json(args.userPayload),
    repairPromptSha256: args.repairPrompt ? sha256Text(args.repairPrompt) : null,
    rawResponseSha256: sha256Json(args.rawResponse),
    afterToolResults: Boolean(args.afterToolResults),
    systemPromptArtifact: args.artifacts?.systemPromptArtifact,
    userPayloadArtifact: args.artifacts?.userPayloadArtifact,
    repairPromptArtifact: args.artifacts?.repairPromptArtifact,
    rawResponseArtifact: args.artifacts?.rawResponseArtifact,
  };
  return { ...args.trace, modelAttempts: [...args.trace.modelAttempts, attempt] };
}

export function appendRepairAttemptTrace(args: {
  trace: ProfessorExecutionTraceV1;
  repairIndex: number;
  modelAttemptIndex: number;
  repairPrompt: string;
}): ProfessorExecutionTraceV1 {
  return {
    ...args.trace,
    repairAttempts: [
      ...args.trace.repairAttempts,
      {
        repairIndex: args.repairIndex,
        modelAttemptIndex: args.modelAttemptIndex,
        repairPromptSha256: sha256Text(args.repairPrompt),
      },
    ],
  };
}

export function traceSummary(args: { trace: ProfessorExecutionTraceV1; runLedger: ProfessorRunLedgerV3 }) {
  return {
    modelAttemptCount: args.trace.modelAttempts.length,
    repairAttemptCount: args.trace.repairAttempts.length,
    retrievalEventCount: args.runLedger.retrievalEvents.length,
    evidenceObjectCount: args.runLedger.evidenceObjects.length,
    finalRunLedgerSha256: runLedgerSha256(args.runLedger),
    modelAttemptPayloadShas: args.trace.modelAttempts.map((a) => a.userPayloadSha256),
  };
}
