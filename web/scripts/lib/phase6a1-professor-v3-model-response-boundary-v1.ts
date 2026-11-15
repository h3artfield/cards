/**
 * Responses API terminal-state gate before Professor JSON parse — never salvage truncated output.
 */
import type { ProfessorV3ModelResponse, ProfessorV3ToolRequest } from "./phase6a1-professor-plan-agent-v3";
import type { ProfessorV3ModelAttemptResponsePhaseRecordV3 } from "./phase6a1-professor-v3-model-attempt-artifacts-v3";
import { unwrapProfessorV3ModelResponseEnvelopeV2 } from "./phase6a1-professor-v3-plan-output-schema-v2";

export const PROFESSOR_V3_MODEL_RESPONSE_BOUNDARY_V1_VERSION = "phase6a1-professor-v3-model-response-boundary-v1";

export const PROFESSOR_V3_MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS = "MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS";
export const PROFESSOR_V3_MODEL_RESPONSE_INCOMPLETE = "MODEL_RESPONSE_INCOMPLETE";
export const PROFESSOR_V3_MODEL_RESPONSE_JSON_PARSE_FAILED = "MODEL_RESPONSE_JSON_PARSE_FAILED";

let professorJsonParseInvocationCountForTests = 0;

export function resetProfessorJsonParseInvocationCountForTests(): void {
  professorJsonParseInvocationCountForTests = 0;
}

export function getProfessorJsonParseInvocationCountForTests(): number {
  return professorJsonParseInvocationCountForTests;
}

type ResponsesContentPart = { type?: string; text?: string };
type ResponsesOutputItem = {
  type?: string;
  status?: string;
  content?: string | ResponsesContentPart[];
};

export type ProfessorV3ResponsesApiEnvelopeV1 = {
  id: string;
  status: string;
  incomplete_details?: { reason?: string };
  max_output_tokens?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
  output?: ResponsesOutputItem[];
  output_text?: string;
};

export type ProfessorV3ModelResponseBoundaryErrorDetailsV1 = {
  responseId: string;
  responseStatus: string;
  incompleteReason: string | null;
  configuredMaxOutputTokens: number | null;
  usageInputTokens: number | null;
  usageOutputTokens: number | null;
  usageReasoningTokens: number | null;
  messageStatus: string | null;
  emittedTextLength: number;
};

export class ProfessorV3ModelResponseBoundaryError extends Error {
  readonly code: string;
  readonly details: ProfessorV3ModelResponseBoundaryErrorDetailsV1;
  readonly responseBoundary?: ProfessorV3ModelAttemptResponsePhaseRecordV3;
  readonly rawResponseForTrace?: unknown;

  constructor(args: {
    code: string;
    message: string;
    details: ProfessorV3ModelResponseBoundaryErrorDetailsV1;
    responseBoundary?: ProfessorV3ModelAttemptResponsePhaseRecordV3;
    rawResponseForTrace?: unknown;
  }) {
    super(args.message);
    this.name = args.code;
    this.code = args.code;
    this.details = args.details;
    this.responseBoundary = args.responseBoundary;
    this.rawResponseForTrace = args.rawResponseForTrace;
  }
}

export function isProfessorV3ModelResponseBoundaryError(error: unknown): error is ProfessorV3ModelResponseBoundaryError {
  return error instanceof ProfessorV3ModelResponseBoundaryError;
}

export function parseProfessorV3ResponsesApiEnvelope(apiResponseRaw: string): ProfessorV3ResponsesApiEnvelopeV1 {
  const parsed = JSON.parse(apiResponseRaw) as ProfessorV3ResponsesApiEnvelopeV1;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Professor v3 Responses API payload is not an object");
  }
  if (typeof parsed.id !== "string" || typeof parsed.status !== "string") {
    throw new Error("Professor v3 Responses API payload missing id/status");
  }
  return parsed;
}

export function extractProfessorV3OutputTextFromResponsesApi(envelope: ProfessorV3ResponsesApiEnvelopeV1): {
  outputText: string;
  messageStatus: string | null;
} {
  if (envelope.output_text && envelope.output_text.trim().length > 0) {
    return { outputText: envelope.output_text, messageStatus: null };
  }
  const chunks: string[] = [];
  let messageStatus: string | null = null;
  for (const item of envelope.output ?? []) {
    if (item.type === "message") {
      if (typeof item.status === "string") messageStatus = item.status;
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if ((part.type === "output_text" || part.type === "text") && part.text) chunks.push(part.text);
        }
      }
    }
    if (typeof item.content === "string") chunks.push(item.content);
  }
  return { outputText: chunks.join("\n").trim(), messageStatus };
}

export function buildProfessorV3ModelResponseBoundaryErrorDetails(
  envelope: ProfessorV3ResponsesApiEnvelopeV1,
  emittedTextLength: number,
  messageStatus: string | null,
): ProfessorV3ModelResponseBoundaryErrorDetailsV1 {
  return {
    responseId: envelope.id,
    responseStatus: envelope.status,
    incompleteReason: envelope.incomplete_details?.reason ?? null,
    configuredMaxOutputTokens: envelope.max_output_tokens ?? null,
    usageInputTokens: envelope.usage?.input_tokens ?? null,
    usageOutputTokens: envelope.usage?.output_tokens ?? null,
    usageReasoningTokens: envelope.usage?.output_tokens_details?.reasoning_tokens ?? null,
    messageStatus,
    emittedTextLength,
  };
}

export function assertProfessorV3ResponsesApiCompletedBeforeParse(args: {
  envelope: ProfessorV3ResponsesApiEnvelopeV1;
  emittedTextLength: number;
  messageStatus: string | null;
  responseBoundary?: ProfessorV3ModelAttemptResponsePhaseRecordV3;
}): void {
  const { envelope } = args;
  const details = buildProfessorV3ModelResponseBoundaryErrorDetails(envelope, args.emittedTextLength, args.messageStatus);
  const rawResponseForTrace = {
    responseKind: "RESPONSES_API_ENVELOPE",
    id: envelope.id,
    status: envelope.status,
    incomplete_details: envelope.incomplete_details ?? null,
    max_output_tokens: envelope.max_output_tokens ?? null,
    usage: envelope.usage ?? null,
    messageStatus: args.messageStatus,
    emittedTextLength: args.emittedTextLength,
  };

  if (envelope.status !== "completed") {
    const code =
      envelope.status === "incomplete" && envelope.incomplete_details?.reason === "max_output_tokens"
        ? PROFESSOR_V3_MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS
        : PROFESSOR_V3_MODEL_RESPONSE_INCOMPLETE;
    throw new ProfessorV3ModelResponseBoundaryError({
      code,
      message: `${code}: response ${envelope.id} status=${envelope.status} reason=${details.incompleteReason ?? "unknown"}`,
      details,
      responseBoundary: args.responseBoundary,
      rawResponseForTrace,
    });
  }

  if (args.messageStatus && args.messageStatus !== "completed") {
    const code =
      args.messageStatus === "incomplete" && envelope.incomplete_details?.reason === "max_output_tokens"
        ? PROFESSOR_V3_MODEL_INCOMPLETE_MAX_OUTPUT_TOKENS
        : PROFESSOR_V3_MODEL_RESPONSE_INCOMPLETE;
    throw new ProfessorV3ModelResponseBoundaryError({
      code,
      message: `${code}: message status=${args.messageStatus} for response ${envelope.id}`,
      details,
      responseBoundary: args.responseBoundary,
      rawResponseForTrace,
    });
  }
}

function parseProfessorJsonContent(content: string): unknown {
  professorJsonParseInvocationCountForTests += 1;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new ProfessorV3ModelResponseBoundaryError({
      code: PROFESSOR_V3_MODEL_RESPONSE_JSON_PARSE_FAILED,
      message: `${PROFESSOR_V3_MODEL_RESPONSE_JSON_PARSE_FAILED}: Professor v3 content is not JSON object text`,
      details: {
        responseId: "",
        responseStatus: "completed",
        incompleteReason: null,
        configuredMaxOutputTokens: null,
        usageInputTokens: null,
        usageOutputTokens: null,
        usageReasoningTokens: null,
        messageStatus: "completed",
        emittedTextLength: content.length,
      },
    });
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProfessorV3ModelResponseBoundaryError({
      code: PROFESSOR_V3_MODEL_RESPONSE_JSON_PARSE_FAILED,
      message: `${PROFESSOR_V3_MODEL_RESPONSE_JSON_PARSE_FAILED}: ${message}`,
      details: {
        responseId: "",
        responseStatus: "completed",
        incompleteReason: null,
        configuredMaxOutputTokens: null,
        usageInputTokens: null,
        usageOutputTokens: null,
        usageReasoningTokens: null,
        messageStatus: "completed",
        emittedTextLength: content.length,
      },
    });
  }
}

export function parseProfessorV3CompletedModelResponseOutput(content: string): ProfessorV3ModelResponse {
  const parsed = parseProfessorJsonContent(content);
  const unwrapped = unwrapProfessorV3ModelResponseEnvelopeV2(parsed);
  if (unwrapped.toolRequests) {
    return {
      parsed: unwrapped.parsed ?? parsed,
      toolRequests: unwrapped.toolRequests as ProfessorV3ToolRequest[],
    };
  }
  return { parsed: unwrapped.parsed ?? parsed };
}

export function processProfessorV3ResponsesApiBoundary(args: {
  apiResponseRaw: string;
  responseBoundary?: ProfessorV3ModelAttemptResponsePhaseRecordV3;
}): ProfessorV3ModelResponse {
  const envelope = parseProfessorV3ResponsesApiEnvelope(args.apiResponseRaw);
  const { outputText, messageStatus } = extractProfessorV3OutputTextFromResponsesApi(envelope);
  assertProfessorV3ResponsesApiCompletedBeforeParse({
    envelope,
    emittedTextLength: outputText.length,
    messageStatus,
    responseBoundary: args.responseBoundary,
  });
  return parseProfessorV3CompletedModelResponseOutput(outputText);
}
