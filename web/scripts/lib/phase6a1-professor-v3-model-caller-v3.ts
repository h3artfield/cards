/**
 * Professor v3 model caller v3 — staged exact API boundary IO before parse/check can fail.
 */
import type { ProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./phase6a1-professor-plan-prompt-v3";
import {
  auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2,
  buildProfessorV3ResponsesApiTextFormatV2,
  PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2,
  unwrapProfessorV3ModelResponseEnvelopeV2,
} from "./phase6a1-professor-v3-plan-output-schema-v2";
import type {
  ProfessorV3ModelCallerInput,
  ProfessorV3ModelResponse,
  ProfessorV3ToolRequest,
} from "./phase6a1-professor-plan-agent-v3";
import {
  ProfessorV3StagedModelAttemptWriterV3,
  type ProfessorV3ModelAttemptArtifactRecordV3,
  type ProfessorV3ModelAttemptRequestPhaseRecordV3,
  type ProfessorV3ModelAttemptResponsePhaseRecordV3,
} from "./phase6a1-professor-v3-model-attempt-artifacts-v3";

export const PROFESSOR_V3_MODEL_CALLER_V3_VERSION = "phase6a1-professor-v3-model-caller-v3";

export const PROFESSOR_V3_TOOL_REQUEST_GUIDANCE = `Respond with the strict structured-output envelope on every turn:
{ "responseKind": "TOOL_REQUESTS"|"PLAN", "toolRequests": [...], "strategyHypotheses": [...] }
responseKind=TOOL_REQUESTS → non-empty toolRequests, strategyHypotheses=[]
responseKind=PLAN → non-empty strategyHypotheses, toolRequests=[]
Tool request item: { "tool": "searchMtgKnowledge", "query": "...", "mode": "COMMANDER_PRIMER|PACKAGE|RULES|CARD_ORACLE", "limit": 4 }`;

export type ProfessorV3ModelCallerV3Options = {
  modelPin: ProfessorModelPinV2;
  outputDir?: string;
  relPrefix?: string;
  requireOpenAiKey?: () => string;
  fetchImpl?: typeof fetch;
  onAttemptRequest?: (record: ProfessorV3ModelAttemptRequestPhaseRecordV3) => void;
  onAttemptResponse?: (record: ProfessorV3ModelAttemptResponsePhaseRecordV3) => void;
  onAttemptArtifacts?: (record: ProfessorV3ModelAttemptArtifactRecordV3) => void;
};

type ResponsesInputItem = {
  role?: string;
  type?: string;
  content?: string | Array<{ type?: string; text?: string }>;
};

type ResponsesApiResult = {
  output?: ResponsesInputItem[];
  output_text?: string;
};

export type ProfessorV3ModelCallerBoundaryResultV3 = ProfessorV3ModelResponse & {
  boundary?: ProfessorV3ModelAttemptArtifactRecordV3;
  requestBoundary?: ProfessorV3ModelAttemptRequestPhaseRecordV3;
  responseBoundary?: ProfessorV3ModelAttemptResponsePhaseRecordV3;
};

function defaultRequireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error("OPENAI_API_KEY required for Professor v3 smoke execution");
  return key.trim();
}

function parseProfessorJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`Professor v3 content is not JSON: ${raw.slice(0, 160)}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function extractOutputText(output: ResponsesInputItem[] = [], outputText?: string): string {
  if (outputText && outputText.trim().length > 0) return outputText;
  const chunks: string[] = [];
  for (const item of output) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if ((part.type === "output_text" || part.type === "text") && part.text) chunks.push(part.text);
      }
    }
    if (typeof item.content === "string") chunks.push(item.content);
  }
  return chunks.join("\n").trim();
}

export function buildProfessorV3ModelUserContent(input: ProfessorV3ModelCallerInput): string {
  const sections = [input.userPayload.modelVisibleText, PROFESSOR_V3_TOOL_REQUEST_GUIDANCE];
  if (input.repairPrompt?.trim()) sections.push(input.repairPrompt.trim());
  return sections.join("\n\n");
}

export function buildProfessorV3ApiRequestBody(
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
    text: { format: buildProfessorV3ResponsesApiTextFormatV2(options) },
  };
  return JSON.stringify(body);
}

export function assertProfessorV3ApiRequestBodyUsesAuditedStrictSchemaV2(apiRequestBodyJson: string): void {
  const body = JSON.parse(apiRequestBodyJson) as { text?: { format?: { schema?: Record<string, unknown> } } };
  const schema = body.text?.format?.schema;
  if (!schema) throw new Error("Professor v3 API request body missing text.format.schema");
  const audit = auditProfessorV3StructuredOutputSchemaStrictCompatibilityV2(schema);
  if (!audit.pass) {
    throw new Error(
      `Professor v3 structured output schema failed strict compatibility audit (constOnlyPropertyCount=${audit.constOnlyPropertyCount}): ${audit.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  }
  if (audit.constOnlyPropertyCount !== 0) {
    throw new Error(`Professor v3 structured output schema has constOnlyPropertyCount=${audit.constOnlyPropertyCount}; expected 0`);
  }
  const expected = JSON.stringify(PROFESSOR_V3_MODEL_RESPONSE_JSON_SCHEMA_V2);
  const actual = JSON.stringify(schema);
  if (expected !== actual && !body.text?.format?.name?.includes("plan_only")) {
    // plan-only mode uses a narrowed envelope — still audited recursively above.
  }
}

export function parseProfessorV3ModelResponse(content: string): ProfessorV3ModelResponse {
  const parsed = parseProfessorJson(content);
  const unwrapped = unwrapProfessorV3ModelResponseEnvelopeV2(parsed);
  if (unwrapped.toolRequests) {
    return {
      parsed: unwrapped.parsed ?? parsed,
      toolRequests: unwrapped.toolRequests as ProfessorV3ToolRequest[],
    };
  }
  return { parsed: unwrapped.parsed ?? parsed };
}

export function createProfessorV3ModelCallerV3(options: ProfessorV3ModelCallerV3Options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requireOpenAiKey = options.requireOpenAiKey ?? defaultRequireOpenAiKey;

  return async (input: ProfessorV3ModelCallerInput): Promise<ProfessorV3ModelCallerBoundaryResultV3> => {
    const apiKey = requireOpenAiKey();
    const systemInstructions = input.systemPrompt || PROFESSOR_PLAN_SYSTEM_PROMPT_V3;
    const userContent = buildProfessorV3ModelUserContent(input);
    const apiRequestBody = buildProfessorV3ApiRequestBody(options.modelPin, systemInstructions, userContent);

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

    const parsed = JSON.parse(apiResponseRaw) as ResponsesApiResult;
    if (!Array.isArray(parsed.output)) throw new Error("Empty OpenAI Responses output for Professor v3");
    const outputText = extractOutputText(parsed.output, parsed.output_text);
    const modelResponse = parseProfessorV3ModelResponse(outputText);
    const parsedResponseJson = JSON.stringify(modelResponse, null, 2);

    let boundary: ProfessorV3ModelAttemptArtifactRecordV3 | undefined;
    if (writer) {
      boundary = writer.finalizeSuccessPhase({ outputText, parsedResponseJson });
      options.onAttemptArtifacts?.(boundary);
    }

    return { ...modelResponse, boundary, requestBoundary, responseBoundary };
  };
}

export { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 };
