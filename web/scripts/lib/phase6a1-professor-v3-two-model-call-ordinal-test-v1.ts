/**
 * Two-model-call ordinal test — first real model call → tools → second model boundary (0 OpenAI).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { loadProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import {
  runProfessorPlanCaseV3Orchestration,
  type ProfessorV3ModelCallerInput,
} from "./phase6a1-professor-plan-agent-v3";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./phase6a1-professor-plan-prompt-v3";
import { buildProfessorV3ModelUserContentV4 } from "./phase6a1-professor-v3-model-caller-v4";
import {
  ProfessorV3StagedModelAttemptWriterV3,
  type ProfessorV3ModelAttemptArtifactRecordV3,
} from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import { PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_REACHED_V1 } from "./phase6a1-professor-v3-zada-model-request-boundary-v1";
import type { ProfessorV3ZadaSpentAttempt000ParsedEnvelopeV1 } from "./phase6a1-professor-v3-zada-spent-tool-loop-fixture-v1";

export const PROFESSOR_V3_TWO_MODEL_CALL_ORDINAL_TEST_V1_VERSION =
  "phase6a1-professor-v3-two-model-call-ordinal-test-v1";

export type ProfessorV3ModelCallTraceEntryV1 = {
  modelCallOrdinal: number;
  afterToolResults: boolean;
  userContentSha256: string;
};

export type ProfessorV3TwoModelCallOrdinalTestResultV1 = {
  version: typeof PROFESSOR_V3_TWO_MODEL_CALL_ORDINAL_TEST_V1_VERSION;
  modelCallTrace: ProfessorV3ModelCallTraceEntryV1[];
  modelApiCallAttemptCount: number;
  executionTraceModelAttemptCount: number;
  professorToolCallCompletedCount: number;
  boundaryReached: boolean;
  artifactRecords: ProfessorV3ModelAttemptArtifactRecordV3[];
  attempt000UserContentSha256: string | null;
  attempt001UserContentSha256: string | null;
  attemptArtifactFiles: string[];
};

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function runProfessorV3TwoModelCallOrdinalTestV1(args: {
  ctx: ProfessorPlanningContextV3;
  frozenEnvelope: ProfessorV3ZadaSpentAttempt000ParsedEnvelopeV1;
  outputDir: string;
}): Promise<ProfessorV3TwoModelCallOrdinalTestResultV1> {
  const modelPin = loadProfessorModelPinV2();
  const modelCallTrace: ProfessorV3ModelCallTraceEntryV1[] = [];
  const artifactRecords: ProfessorV3ModelAttemptArtifactRecordV3[] = [];
  let boundaryReached = false;
  let executionTraceModelAttemptCount = 0;
  let professorToolCallCompletedCount = 0;

  const modelCaller = async (input: ProfessorV3ModelCallerInput) => {
    const userContent = buildProfessorV3ModelUserContentV4(input);
    const writer = new ProfessorV3StagedModelAttemptWriterV3({
      outputDir: args.outputDir,
      relPrefix: "attempts",
      attemptIndex: input.attemptIndex,
      afterToolResults: Boolean(input.afterToolResults),
    });
    writer.writeRequestPhase({
      systemInstructions: input.systemPrompt || PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
      userContent,
      repairInstructions: input.repairPrompt,
      apiRequestBody: JSON.stringify({ stub: true, attemptIndex: input.attemptIndex }),
    });
    modelCallTrace.push({
      modelCallOrdinal: input.attemptIndex,
      afterToolResults: Boolean(input.afterToolResults),
      userContentSha256: sha256Text(userContent),
    });

    if (input.afterToolResults) {
      boundaryReached = true;
      throw new Error(PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_REACHED_V1);
    }

    const outputText = JSON.stringify(args.frozenEnvelope.parsed);
    const parsedResponseJson = JSON.stringify({
      parsed: args.frozenEnvelope.parsed,
      toolRequests: [...args.frozenEnvelope.toolRequests],
    });
    writer.writeResponseRawPhase({
      apiResponseRaw: parsedResponseJson,
      httpStatus: 200,
      httpStatusText: "OK",
    });
    const record = writer.finalizeSuccessPhase({ outputText, parsedResponseJson });
    artifactRecords.push(record);
    return {
      parsed: args.frozenEnvelope.parsed,
      toolRequests: [...args.frozenEnvelope.toolRequests],
    };
  };

  try {
    await runProfessorPlanCaseV3Orchestration({
      ctx: args.ctx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      requireLensCoverage: false,
      maxRepairRounds: 0,
      toolBudget: {
        ...DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3,
        maxToolCalls: modelPin.experimentBounds.maxProfessorToolCalls,
        maxRetrievedEvidenceChunks: modelPin.experimentBounds.maxEvidenceChunks,
      },
      modelCaller,
      onProgress: (progress) => {
        executionTraceModelAttemptCount = progress.executionTrace.modelAttempts.length;
        professorToolCallCompletedCount = progress.professorToolCallCompletedCount;
      },
    });
  } catch (error) {
    if (!(error instanceof Error && error.message === PROFESSOR_V3_ZADA_MODEL_REQUEST_BOUNDARY_REACHED_V1)) {
      throw error;
    }
  }

  const attemptArtifactFiles = existsSync(args.outputDir)
    ? readdirSync(args.outputDir).filter((name) => name.startsWith("attempt-")).sort()
    : [];

  const readUserSha = (attemptIndex: number) => {
    const path = join(args.outputDir, `attempt-${String(attemptIndex).padStart(3, "0")}-user-content.txt`);
    return existsSync(path) ? sha256Text(readFileSync(path, "utf8")) : null;
  };

  return {
    version: PROFESSOR_V3_TWO_MODEL_CALL_ORDINAL_TEST_V1_VERSION,
    modelCallTrace,
    modelApiCallAttemptCount: modelCallTrace.length,
    executionTraceModelAttemptCount,
    professorToolCallCompletedCount,
    boundaryReached,
    artifactRecords,
    attempt000UserContentSha256: readUserSha(0),
    attempt001UserContentSha256: readUserSha(1),
    attemptArtifactFiles,
  };
}
