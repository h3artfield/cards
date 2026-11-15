/**
 * Professor v3 model caller v2 — exact API boundary IO + write-once attempt artifacts.
 */
import type { ProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./phase6a1-professor-plan-prompt-v3";
import type {
  ProfessorV3ModelCallerInput,
  ProfessorV3ModelResponse,
  ProfessorV3ToolRequest,
} from "./phase6a1-professor-plan-agent-v3";
import {
  type ProfessorV3ModelAttemptArtifactRecordV2,
  writeProfessorV3ModelAttemptArtifactsV2,
} from "./phase6a1-professor-v3-model-attempt-artifacts-v2";

export const PROFESSOR_V3_MODEL_CALLER_V2_VERSION = "phase6a1-professor-v3-model-caller-v2";

export const PROFESSOR_V3_TOOL_REQUEST_GUIDANCE = `When you need additional curated MTG knowledge before planning, respond with JSON containing toolRequests only:
{ "toolRequests": [{ "tool": "searchMtgKnowledge", "query": "...", "mode": "COMMANDER_PRIMER|PACKAGE|RULES|CARD_ORACLE", "limit": 4 }] }
When ready to submit your strategic plan, respond with { "strategyHypotheses": [...] } only.`;

export type ProfessorV3ModelCallerV2Options = {
  modelPin: ProfessorModelPinV2;
  outputDir?: string;
  relPrefix?: string;
  requireOpenAiKey?: () => string;
  fetchImpl?: typeof fetch;
  onAttemptArtifacts?: (record: ProfessorV3ModelAttemptArtifactRecordV2) => void;
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

export type ProfessorV3ModelCallerBoundaryResultV2 = ProfessorV3ModelResponse & {
  boundary?: ProfessorV3ModelAttemptArtifactRecordV2;
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

export function buildProfessorV3ApiRequestBody(modelPin: ProfessorModelPinV2, systemInstructions: string, userContent: string): string {
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
    text: { format: { type: "json_object" } },
  };
  return JSON.stringify(body);
}

export function parseProfessorV3ModelResponse(content: string): ProfessorV3ModelResponse {
  const parsed = parseProfessorJson(content) as Record<string, unknown>;
  if (Array.isArray(parsed.toolRequests)) {
    return {
      parsed,
      toolRequests: parsed.toolRequests as ProfessorV3ToolRequest[],
    };
  }
  return { parsed };
}

async function callOpenAiResponses(args: {
  apiKey: string;
  modelPin: ProfessorModelPinV2;
  apiRequestBody: string;
  fetchImpl: typeof fetch;
}): Promise<{ apiResponseRaw: string; parsed: ResponsesApiResult }> {
  const response = await args.fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: args.apiRequestBody,
    signal: AbortSignal.timeout(args.modelPin.inferenceParameters.requestTimeoutMs),
  });
  const apiResponseRaw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI Professor v3 smoke failed (${response.status}): ${apiResponseRaw}`);
  }
  const parsed = JSON.parse(apiResponseRaw) as ResponsesApiResult;
  if (!Array.isArray(parsed.output)) throw new Error("Empty OpenAI Responses output for Professor v3");
  return { apiResponseRaw, parsed };
}

export function createProfessorV3ModelCallerV2(options: ProfessorV3ModelCallerV2Options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requireOpenAiKey = options.requireOpenAiKey ?? defaultRequireOpenAiKey;

  return async (input: ProfessorV3ModelCallerInput): Promise<ProfessorV3ModelCallerBoundaryResultV2> => {
    const apiKey = requireOpenAiKey();
    const systemInstructions = input.systemPrompt || PROFESSOR_PLAN_SYSTEM_PROMPT_V3;
    const userContent = buildProfessorV3ModelUserContent(input);
    const apiRequestBody = buildProfessorV3ApiRequestBody(options.modelPin, systemInstructions, userContent);
    const { apiResponseRaw, parsed: apiResult } = await callOpenAiResponses({
      apiKey,
      modelPin: options.modelPin,
      apiRequestBody,
      fetchImpl,
    });
    const outputText = extractOutputText(apiResult.output, apiResult.output_text);
    const modelResponse = parseProfessorV3ModelResponse(outputText);
    const parsedResponseJson = JSON.stringify(modelResponse, null, 2);

    let boundary: ProfessorV3ModelAttemptArtifactRecordV2 | undefined;
    if (options.outputDir) {
      boundary = writeProfessorV3ModelAttemptArtifactsV2({
        outputDir: options.outputDir,
        relPrefix: options.relPrefix,
        capture: {
          attemptIndex: input.attemptIndex,
          afterToolResults: Boolean(input.afterToolResults),
          systemInstructions,
          userContent,
          repairInstructions: input.repairPrompt,
          apiRequestBody,
          apiResponseRaw,
          outputText,
          parsedResponseJson,
        },
      });
      options.onAttemptArtifacts?.(boundary);
    }

    return { ...modelResponse, boundary };
  };
}

export { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 };
