/**
 * Reviewed Professor v3 model caller — OpenAI Responses API bound to formal model pin v2.
 */
import type { ProfessorModelPinV2 } from "./phase6a1-professor-plan-model-pin-v2";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./phase6a1-professor-plan-prompt-v3";
import type {
  ProfessorV3ModelCallerInput,
  ProfessorV3ModelResponse,
  ProfessorV3ToolRequest,
} from "./phase6a1-professor-plan-agent-v3";

export const PROFESSOR_V3_MODEL_CALLER_V1_VERSION = "phase6a1-professor-v3-model-caller-v1";

export const PROFESSOR_V3_TOOL_REQUEST_GUIDANCE = `When you need additional curated MTG knowledge before planning, respond with JSON containing toolRequests only:
{ "toolRequests": [{ "tool": "searchMtgKnowledge", "query": "...", "mode": "COMMANDER_PRIMER|PACKAGE|RULES|CARD_ORACLE", "limit": 4 }] }
When ready to submit your strategic plan, respond with { "strategyHypotheses": [...] } only.`;

type ResponsesInputItem = {
  role?: string;
  type?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  name?: string;
  arguments?: string;
  call_id?: string;
  output?: string;
};

type ResponsesApiResult = {
  output?: ResponsesInputItem[];
  output_text?: string;
};

function requireOpenAiKey(): string {
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

async function openAiResponses(
  apiKey: string,
  modelPin: ProfessorModelPinV2,
  input: ResponsesInputItem[],
): Promise<ResponsesApiResult> {
  const body: Record<string, unknown> = {
    model: modelPin.modelIdentifier,
    input,
    reasoning: {
      effort: modelPin.reasoningConfiguration.effort,
      ...(modelPin.reasoningConfiguration.mode === "pro" ? { mode: "pro" } : {}),
    },
    max_output_tokens: modelPin.inferenceParameters.maxCompletionTokens,
    text: { format: { type: "json_object" } },
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(modelPin.inferenceParameters.requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Professor v3 smoke failed: ${await response.text()}`);
  }

  const data = (await response.json()) as ResponsesApiResult;
  if (!Array.isArray(data.output)) throw new Error("Empty OpenAI Responses output for Professor v3");
  return data;
}

export function buildProfessorV3ModelUserContent(input: ProfessorV3ModelCallerInput): string {
  const sections = [input.userPayload.modelVisibleText, PROFESSOR_V3_TOOL_REQUEST_GUIDANCE];
  if (input.repairPrompt?.trim()) sections.push(input.repairPrompt.trim());
  return sections.join("\n\n");
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

export function createProfessorV3ModelCallerV1(modelPin: ProfessorModelPinV2) {
  return async (input: ProfessorV3ModelCallerInput): Promise<ProfessorV3ModelResponse> => {
    const apiKey = requireOpenAiKey();
    const systemPrompt = input.systemPrompt || PROFESSOR_PLAN_SYSTEM_PROMPT_V3;
    const userContent = buildProfessorV3ModelUserContent(input);
    const response = await openAiResponses(apiKey, modelPin, [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userContent },
    ]);
    const text = extractOutputText(response.output, response.output_text);
    return parseProfessorV3ModelResponse(text);
  };
}

export { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 };
