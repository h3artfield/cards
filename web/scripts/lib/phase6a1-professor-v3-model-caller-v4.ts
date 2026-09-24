/**
 * Professor v3 model caller v4 — response-state gate before parse + bounded schema v3.
 */
import type { ProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./phase6a1-professor-plan-prompt-v3";
import {
  auditProfessorV3StructuredOutputSchemaStrictCompatibilityV3,
  buildProfessorV3ResponsesApiTextFormatV3,
  formatProfessorV3BoundedOutputContractForPromptV3,
  PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3,
} from "./phase6a1-professor-v3-plan-output-schema-v3";
import type {
  ProfessorV3ModelCallerInput,
  ProfessorV3ModelResponse,
} from "./phase6a1-professor-plan-agent-v3";
import {
  isProfessorV3ModelResponseBoundaryError,
  parseProfessorV3ResponsesApiEnvelope,
  processProfessorV3ResponsesApiBoundary,
  extractProfessorV3OutputTextFromResponsesApi,
  buildProfessorV3ModelResponseBoundaryErrorDetails,
  assertProfessorV3ResponsesApiCompletedBeforeParse,
  ProfessorV3ModelResponseBoundaryError,
} from "./phase6a1-professor-v3-model-response-boundary-v1";
import type { ProfessorV3BudgetTelemetryV1 } from "./phase6a1-professor-v3-budget-telemetry-v1";
import { computeProfessorV3BudgetTelemetryV1 } from "./phase6a1-professor-v3-budget-telemetry-v1";
import {
  ProfessorV3StagedModelAttemptWriterV3,
  type ProfessorV3ModelAttemptArtifactRecordV3,
  type ProfessorV3ModelAttemptRequestPhaseRecordV3,
  type ProfessorV3ModelAttemptResponsePhaseRecordV3,
} from "./phase6a1-professor-v3-model-attempt-artifacts-v3";

export const PROFESSOR_V3_MODEL_CALLER_V4_VERSION = "phase6a1-professor-v3-model-caller-v4";

export const PROFESSOR_V3_TOOL_REQUEST_GUIDANCE_V4 = `Respond with the strict structured-output envelope on every turn:
{ "responseKind": "TOOL_REQUESTS"|"PLAN", "toolRequests": [...], "strategyHypotheses": [...] }
responseKind=TOOL_REQUESTS → non-empty toolRequests, strategyHypotheses=[]
responseKind=PLAN → exactly four strategyHypotheses (one per required lens), toolRequests=[]
Tool request item: { "tool": "searchMtgKnowledge", "query": "...", "mode": "COMMANDER_PRIMER|PACKAGE|RULES|CARD_ORACLE", "limit": 4 }`;

export type ProfessorV3ModelCallerV4Options = {
  modelPin: ProfessorModelPinV2;
  outputDir?: string;
  relPrefix?: string;
  requireOpenAiKey?: () => string;
  fetchImpl?: typeof fetch;
  planOnly?: boolean;
  omitToolGuidance?: boolean;
  onAttemptRequest?: (record: ProfessorV3ModelAttemptRequestPhaseRecordV3) => void;
  onAttemptResponse?: (record: ProfessorV3ModelAttemptResponsePhaseRecordV3) => void;
  onAttemptArtifacts?: (record: ProfessorV3ModelAttemptArtifactRecordV3) => void;
};

export type ProfessorV3ModelCallerBoundaryResultV4 = ProfessorV3ModelResponse & {
  boundary?: ProfessorV3ModelAttemptArtifactRecordV3;
  requestBoundary?: ProfessorV3ModelAttemptRequestPhaseRecordV3;
  responseBoundary?: ProfessorV3ModelAttemptResponsePhaseRecordV3;
  budgetTelemetry?: ProfessorV3BudgetTelemetryV1;
};

function defaultRequireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error("OPENAI_API_KEY required for Professor v3 smoke execution");
  return key.trim();
}

export function buildProfessorV3ModelUserContentV4(input: ProfessorV3ModelCallerInput): string {
  const sections = [
    input.userPayload.modelVisibleText,
    PROFESSOR_V3_TOOL_REQUEST_GUIDANCE_V4,
    formatProfessorV3BoundedOutputContractForPromptV3(),
  ];
  if (input.repairPrompt?.trim()) sections.push(input.repairPrompt.trim());
  return sections.join("\n\n");
}

export function buildProfessorV3ApiRequestBodyV4(
  modelPin: ProfessorModelPinV2,
  systemInstructions: string,
  userContent: string,
  options?: { planOnly?: boolean },
): string {
  const body = {
    model: modelPin.modelIdentifier,
    input: [
      { role: "developer", content: systemInstructions },
      { role: "user", content: userContent },
    ],
    reasoning: {
      effort: modelPin.reasoningConfiguration.effort,
      ...(modelPin.reasoningConfiguration.mode === "pro" ? { mode: "pro" } : {}),
    },
    max_output_tokens: modelPin.inferenceParameters.maxCompletionTokens,
    text: { format: buildProfessorV3ResponsesApiTextFormatV3(options) },
  };
  return JSON.stringify(body);
}

export function assertProfessorV3ApiRequestBodyUsesAuditedStrictSchemaV3(apiRequestBodyJson: string): void {
  const body = JSON.parse(apiRequestBodyJson) as { text?: { format?: { schema?: Record<string, unknown> } } };
  const schema = body.text?.format?.schema;
  if (!schema) throw new Error("Professor v3 API request body missing text.format.schema");
  const audit = auditProfessorV3StructuredOutputSchemaStrictCompatibilityV3(schema);
  if (!audit.pass) {
    throw new Error(
      `Professor v3 structured output schema failed strict compatibility audit (constOnlyPropertyCount=${audit.constOnlyPropertyCount}): ${audit.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  }
  if (audit.constOnlyPropertyCount !== 0) {
    throw new Error(`Professor v3 structured output schema has constOnlyPropertyCount=${audit.constOnlyPropertyCount}; expected 0`);
  }
  const expected = JSON.stringify(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V3);
  const actual = JSON.stringify(schema);
  if (expected !== actual && !body.text?.format?.name?.includes("plan_only")) {
    throw new Error("Professor v3 API request body schema mismatch against bounded v3 envelope");
  }
}

function finalizeBoundaryFailure(args: {
  writer?: ProfessorV3StagedModelAttemptWriterV3;
  responseBoundary?: ProfessorV3ModelAttemptResponsePhaseRecordV3;
  outputText?: string;
  onAttemptArtifacts?: (record: ProfessorV3ModelAttemptArtifactRecordV3) => void;
  error: unknown;
}): never {
  if (args.writer && args.responseBoundary) {
    const boundary = args.writer.finalizeIncompletePhase(
      args.outputText !== undefined ? { outputText: args.outputText } : undefined,
    );
    args.onAttemptArtifacts?.(boundary);
  }
  throw args.error;
}

export function createProfessorV3ModelCallerV4(options: ProfessorV3ModelCallerV4Options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requireOpenAiKey = options.requireOpenAiKey ?? defaultRequireOpenAiKey;

  return async (input: ProfessorV3ModelCallerInput): Promise<ProfessorV3ModelCallerBoundaryResultV4> => {
    const apiKey = requireOpenAiKey();
    const systemInstructions = input.systemPrompt || PROFESSOR_PLAN_SYSTEM_PROMPT_V3;
    const userContent = options.omitToolGuidance
      ? [
          input.userPayload.modelVisibleText,
          formatProfessorV3BoundedOutputContractForPromptV3(),
          input.repairPrompt?.trim(),
        ]
          .filter(Boolean)
          .join("\n\n")
      : buildProfessorV3ModelUserContentV4(input);
    const apiRequestBody = buildProfessorV3ApiRequestBodyV4(options.modelPin, systemInstructions, userContent, {
      planOnly: options.planOnly,
    });
    const buildBudgetTelemetry = (envelope?: ReturnType<typeof parseProfessorV3ResponsesApiEnvelope> | null) =>
      computeProfessorV3BudgetTelemetryV1({
        systemInstructions,
        userContent,
        maxOutputTokens: options.modelPin.inferenceParameters.maxCompletionTokens,
        resolvedCommanderNames: input.budgetTelemetryContext?.resolvedCommanderNames,
        ragEvidence: input.budgetTelemetryContext?.ragEvidence,
        retrievalEventEvidenceIds: input.budgetTelemetryContext?.retrievalEventEvidenceIds,
        envelope: envelope ?? null,
      });

    let writer: ProfessorV3StagedModelAttemptWriterV3 | undefined;
    let requestBoundary: ProfessorV3ModelAttemptRequestPhaseRecordV3 | undefined;
    if (options.outputDir) {
      writer = new ProfessorV3StagedModelAttemptWriterV3({
        outputDir: options.outputDir,
        relPrefix: options.relPrefix,
        attemptIndex: input.attemptIndex,
        afterToolResults: Boolean(input.afterToolResults),
      });
      requestBoundary = writer.writeRequestPhase({
        systemInstructions,
        userContent,
        repairInstructions: input.repairPrompt,
        apiRequestBody,
      });
      options.onAttemptRequest?.(requestBoundary);
    }

    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: apiRequestBody,
      signal: AbortSignal.timeout(options.modelPin.inferenceParameters.requestTimeoutMs),
    });
    const apiResponseRaw = await response.text();

    let responseBoundary: ProfessorV3ModelAttemptResponsePhaseRecordV3 | undefined;
    if (writer) {
      responseBoundary = writer.writeResponseRawPhase({
        apiResponseRaw,
        httpStatus: response.status,
        httpStatusText: response.statusText,
      });
      options.onAttemptResponse?.(responseBoundary);
    }

    if (!response.ok) {
      throw new Error(`OpenAI Professor v3 smoke failed (${response.status}): ${apiResponseRaw}`);
    }

    let outputText = "";
    try {
      const modelResponse = processProfessorV3ResponsesApiBoundary({
        apiResponseRaw,
        responseBoundary,
      });
      const envelope = parseProfessorV3ResponsesApiEnvelope(apiResponseRaw);
      const extracted = extractProfessorV3OutputTextFromResponsesApi(envelope);
      outputText = extracted.outputText;
      const parsedResponseJson = JSON.stringify(modelResponse, null, 2);

      let boundary: ProfessorV3ModelAttemptArtifactRecordV3 | undefined;
      if (writer) {
        boundary = writer.finalizeSuccessPhase({ outputText, parsedResponseJson });
        options.onAttemptArtifacts?.(boundary);
      }

      return { ...modelResponse, boundary, requestBoundary, responseBoundary, budgetTelemetry: buildBudgetTelemetry(envelope) };
    } catch (error) {
      let throwError: unknown = error;
      if (isProfessorV3ModelResponseBoundaryError(error) && !error.rawResponseForTrace && apiResponseRaw) {
        try {
          const envelope = parseProfessorV3ResponsesApiEnvelope(apiResponseRaw);
          const extracted = extractProfessorV3OutputTextFromResponsesApi(envelope);
          outputText = extracted.outputText;
          throwError = new ProfessorV3ModelResponseBoundaryError({
            code: error.code,
            message: error.message,
            details: error.details,
            responseBoundary: error.responseBoundary ?? responseBoundary,
            rawResponseForTrace: {
              responseKind: "RESPONSES_API_ENVELOPE",
              id: envelope.id,
              status: envelope.status,
              incomplete_details: envelope.incomplete_details ?? null,
              max_output_tokens: envelope.max_output_tokens ?? null,
              usage: envelope.usage ?? null,
              messageStatus: extracted.messageStatus,
              emittedTextLength: extracted.outputText.length,
            },
          });
        } catch {
          throwError = error;
        }
      }
      finalizeBoundaryFailure({
        writer,
        responseBoundary,
        outputText: outputText || undefined,
        onAttemptArtifacts: options.onAttemptArtifacts,
        error: throwError,
      });
    }
  };
}

export {
  assertProfessorV3ResponsesApiCompletedBeforeParse,
  buildProfessorV3ModelResponseBoundaryErrorDetails,
  extractProfessorV3OutputTextFromResponsesApi,
  isProfessorV3ModelResponseBoundaryError,
  parseProfessorV3ResponsesApiEnvelope,
  processProfessorV3ResponsesApiBoundary,
};

export { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 };
