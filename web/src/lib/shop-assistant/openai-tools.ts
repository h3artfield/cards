import { requireOpenAiApiKey } from "../card-flow-v2/openai-json";
import { trackApiCall } from "../processing/api-call-tracker";

/**
 * One Chat Completions call that may ask for tools. This file only talks to
 * OpenAI; what the tools are, and whether a result may be sent back, is
 * decided in `agent.ts`.
 */

export type AgentToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
};

export type AgentToolCall = { id: string; name: string; arguments: string };

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: AgentToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type AgentModelRequest = {
  system: string;
  messages: AgentMessage[];
  tools: AgentToolDefinition[];
  /** "none" makes the model answer in words; the tools stay defined. Default "auto". */
  toolChoice?: "auto" | "none";
  signal?: AbortSignal;
};

export type AgentModelReply = { text: string | null; toolCalls: AgentToolCall[] };

export type AgentModel = (request: AgentModelRequest) => Promise<AgentModelReply>;

/** Same split the JSON helper makes: these models take no temperature. */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|gpt-6)/i.test(model.trim());
}

function toWire(message: AgentMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content ?? "" };
}

export function readToolReply(data: unknown): AgentModelReply {
  const message = (data as { choices?: Array<{ message?: Record<string, unknown> }> } | null)
    ?.choices?.[0]?.message;
  if (!message) throw new Error("OpenAI returned no message");
  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls: AgentToolCall[] = [];
  for (const raw of rawCalls) {
    const call = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    if (typeof call.id !== "string" || typeof call.function?.name !== "string") continue;
    toolCalls.push({
      id: call.id,
      name: call.function.name,
      arguments: typeof call.function.arguments === "string" ? call.function.arguments : "{}",
    });
  }
  const text = typeof message.content === "string" && message.content.trim() ? message.content : null;
  return { text, toolCalls };
}

export function createOpenAiAgentModel(options: {
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}): AgentModel {
  return async ({ system, messages, tools, toolChoice, signal }) => {
    const apiKey = requireOpenAiApiKey();
    trackApiCall("openai");

    const body: Record<string, unknown> = {
      model: options.model,
      messages: [{ role: "system", content: system }, ...messages.map(toWire)],
    };
    if (tools.length) {
      body.tools = tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
      body.tool_choice = toolChoice ?? "auto";
    }
    if (isReasoningModel(options.model)) {
      body.reasoning_effort = "none";
      body.max_completion_tokens = options.maxTokens ?? 900;
    } else {
      body.max_tokens = options.maxTokens ?? 900;
      body.temperature = 0.2;
    }

    const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      // The status only. The body can echo the prompt back.
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }
    return readToolReply(await response.json());
  };
}
