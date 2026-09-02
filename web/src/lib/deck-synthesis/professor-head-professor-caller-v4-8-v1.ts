/**
 * GPT-5.6 Sol Head Professor — OpenAI Responses API.
 *
 * Production profile: medium reasoning + compact dossier + sync-first (~1–2 min).
 * Falls back to background polling if the sync connection drops.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfessorModelPinV2 } from "../../../scripts/lib/phase6a1-professor-plan-model-pin-v2";
import { hashModelPinPayload } from "../../../scripts/lib/phase6a1-professor-plan-model-pin-v2";
import {
  extractResponsesApiUsage,
  type ModelCallPurposeV4151,
  type ModelTelemetryCollectorV4151,
  type OpenAiUsageV4151,
} from "./professor-model-telemetry-v4-15-1-v1";

export const PROFESSOR_HEAD_PROFESSOR_CALLER_V4_8_V1_VERSION = "professor-head-professor-caller-v4-8-v1";

export const HEAD_PROFESSOR_PRODUCT_NAME = "GPT-5.6 Sol";

/** Default 5 min wall-clock — full review + refinement calls need headroom on live decks. */
export const HEAD_PROFESSOR_DEFAULT_TIMEOUT_MS = 300_000;

export const HEAD_PROFESSOR_PARSE_REPAIR_VERSION = "head-professor-parse-v2-json-schema";

export const HEAD_PROFESSOR_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallAssessment: { type: "string" },
    bracketAssessment: { type: "string" },
    predictedEffectiveBracket: { type: "number", enum: [1, 2, 3, 4, 5] },
    keyImprovements: { type: "array", items: { type: "string" }, maxItems: 6 },
    strengths: { type: "array", items: { type: "string" }, maxItems: 3 },
    structuralProblems: { type: "array", items: { type: "string" }, maxItems: 3 },
    manaProblems: { type: "array", items: { type: "string" }, maxItems: 3 },
    swaps: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cut: { type: "string" },
          add: { type: "string" },
          priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          reason: { type: "string" },
          expectedImprovement: { type: "array", items: { type: "string" }, maxItems: 3 },
        },
        required: ["cut", "add", "priority", "reason", "expectedImprovement"],
      },
    },
    requiresMajorRevision: { type: "boolean" },
    remainingConcerns: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
  required: [
    "overallAssessment",
    "bracketAssessment",
    "predictedEffectiveBracket",
    "keyImprovements",
    "strengths",
    "structuralProblems",
    "manaProblems",
    "swaps",
    "requiresMajorRevision",
    "remainingConcerns",
  ],
} as const;

export const HEAD_PROFESSOR_DEFAULT_MAX_OUTPUT_TOKENS = 12_288;

const POLL_INTERVAL_MS = 2_000;
const CREATE_TIMEOUT_MS = 45_000;
const POLL_REQUEST_TIMEOUT_MS = 20_000;

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

const VALID_REASONING_EFFORTS = new Set<ReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

function resolveModelPinPath(): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/deck-synthesis/phase6a1-professor-plan-model-pin-v2.json"),
    resolve(process.cwd(), "web/data/milestones/deck-synthesis/phase6a1-professor-plan-model-pin-v2.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

export function loadHeadProfessorModelPinV48(): ProfessorModelPinV2 {
  const path = resolveModelPinPath();
  if (!existsSync(path)) {
    throw new Error(`Head Professor model pin not found: ${path}`);
  }
  const pin = JSON.parse(readFileSync(path, "utf8")) as ProfessorModelPinV2;
  const { sha256: _ignored, ...payload } = pin;
  const expected = hashModelPinPayload(payload);
  if (pin.sha256 !== expected) {
    throw new Error(`Head Professor model pin SHA256 mismatch`);
  }
  return pin;
}

export function resolveHeadProfessorReasoningEffort(
  _modelPin: ProfessorModelPinV2,
  liveFast?: boolean,
): ReasoningEffort {
  if (liveFast) return "low";
  const env = process.env.PROFESSOR_BREW_HEAD_PROFESSOR_REASONING_EFFORT?.trim().toLowerCase();
  if (env && VALID_REASONING_EFFORTS.has(env as ReasoningEffort)) {
    return env as ReasoningEffort;
  }
  // Pin uses xhigh for formal PLAN experiments; Head Professor review needs speed.
  return "medium";
}

export function resolveHeadProfessorMaxOutputTokens(modelPin: ProfessorModelPinV2): number {
  const envRaw = process.env.PROFESSOR_BREW_HEAD_PROFESSOR_MAX_OUTPUT_TOKENS?.trim();
  const envVal = envRaw ? parseInt(envRaw, 10) : NaN;
  if (Number.isFinite(envVal) && envVal > 0) {
    return Math.min(envVal, modelPin.inferenceParameters.maxCompletionTokens ?? envVal);
  }
  return HEAD_PROFESSOR_DEFAULT_MAX_OUTPUT_TOKENS;
}

export function resolveHeadProfessorTimeoutMs(_modelPin: ProfessorModelPinV2, liveFast?: boolean): number {
  if (liveFast) {
    const liveRaw = process.env.PROFESSOR_BREW_LIVE_HEAD_PROFESSOR_TIMEOUT_MS?.trim();
    const liveTimeout = liveRaw ? parseInt(liveRaw, 10) : NaN;
    if (Number.isFinite(liveTimeout) && liveTimeout > 0) return liveTimeout;
    return 120_000;
  }
  const envRaw = process.env.PROFESSOR_BREW_HEAD_PROFESSOR_TIMEOUT_MS?.trim();
  const envTimeout = envRaw ? parseInt(envRaw, 10) : NaN;
  if (Number.isFinite(envTimeout) && envTimeout > 0) return envTimeout;
  return HEAD_PROFESSOR_DEFAULT_TIMEOUT_MS;
}

type ResponsesInputItem = {
  role?: string;
  type?: string;
  content?: string | Array<{ type?: string; text?: string }>;
};

type ResponsesApiResult = {
  id?: string;
  status?: string;
  output?: ResponsesInputItem[];
  output_text?: string;
  error?: { message?: string; code?: string } | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function extractOutputText(output: ResponsesInputItem[] = [], outputText?: string): string {
  if (outputText?.trim()) return outputText.trim();
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

function extractJsonObjectText(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`Head Professor response is not JSON: ${raw.slice(0, 200)}`);
  }
  return raw.slice(start, end + 1);
}

function stripTrailingCommas(json: string): string {
  return json.replace(/,\s*([}\]])/g, "$1");
}

function closeOpenJsonContainers(json: string): string {
  let brace = 0;
  let bracket = 0;
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
  }
  let suffix = "";
  while (bracket > 0) {
    suffix += "]";
    bracket--;
  }
  while (brace > 0) {
    suffix += "}";
    brace--;
  }
  return json + suffix;
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function extractSwapsFallback(jsonText: string): Record<string, unknown> | null {
  const swaps: Record<string, unknown>[] = [];

  function pushSwap(cutRaw: string, addRaw: string, priority: string, reasonRaw?: string) {
    const cut = unescapeJsonString(cutRaw);
    const add = unescapeJsonString(addRaw);
    if (swaps.some((s) => s.cut === cut && s.add === add)) return;
    swaps.push({
      cut,
      add,
      priority,
      reason: reasonRaw ? unescapeJsonString(reasonRaw) : "Head Professor recommendation",
      expectedImprovement: [],
    });
  }

  const cutFirst =
    /\{\s*"cut"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"add"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"priority"\s*:\s*"(HIGH|MEDIUM|LOW)"(?:\s*,\s*"reason"\s*:\s*"((?:\\.|[^"\\])*)")?[^}]*\}/g;
  let match: RegExpExecArray | null;
  while ((match = cutFirst.exec(jsonText)) !== null) {
    pushSwap(match[1]!, match[2]!, match[3]!, match[4]);
  }
  const addFirst =
    /\{\s*"add"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"cut"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"priority"\s*:\s*"(HIGH|MEDIUM|LOW)"(?:\s*,\s*"reason"\s*:\s*"((?:\\.|[^"\\])*)")?[^}]*\}/g;
  while ((match = addFirst.exec(jsonText)) !== null) {
    pushSwap(match[2]!, match[1]!, match[3]!, match[4]);
  }

  if (swaps.length === 0) {
    const cuts: { card: string; priority: string }[] = [];
    const additions: { card: string; priority: string }[] = [];
    const cutRe =
      /\{\s*"card"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"priority"\s*:\s*"(HIGH|MEDIUM|LOW)"[^}]*\}/g;
    let cutMatch: RegExpExecArray | null;
    const cutsSection = jsonText.match(/"cuts"\s*:\s*\[[\s\S]*?\]/);
    if (cutsSection) {
      while ((cutMatch = cutRe.exec(cutsSection[0])) !== null) {
        cuts.push({ card: unescapeJsonString(cutMatch[1]!), priority: cutMatch[2]! });
      }
    }
    const addsSection = jsonText.match(/"additions"\s*:\s*\[[\s\S]*?\]/);
    if (addsSection) {
      while ((cutMatch = cutRe.exec(addsSection[0])) !== null) {
        additions.push({ card: unescapeJsonString(cutMatch[1]!), priority: cutMatch[2]! });
      }
    }
    for (const cut of cuts) {
      const add =
        additions.find((a) => a.priority === cut.priority) ?? additions[swaps.length % Math.max(additions.length, 1)];
      if (add && !swaps.some((s) => s.cut === cut.card)) {
        swaps.push({
          cut: cut.card,
          add: add.card,
          priority: cut.priority,
          reason: "Head Professor cut/add pair",
          expectedImprovement: [],
        });
      }
    }
  }

  if (swaps.length === 0) return null;

  const overallMatch = jsonText.match(/"overallAssessment"\s*:\s*"((?:\\.|[^"\\])*)"/);
  console.warn(`[head-professor] Recovered ${swaps.length} swaps from malformed JSON`);
  return {
    overallAssessment: overallMatch
      ? unescapeJsonString(overallMatch[1]!)
      : "Head Professor review recovered from partial JSON.",
    swaps,
    strengths: [],
    structuralProblems: [],
    mechanicalProblems: [],
    manaProblems: [],
    interactionProblems: [],
    resourceProblems: [],
    resilienceProblems: [],
    winPathProblems: [],
    creativityOpportunities: [],
    preserveAtAllCosts: [],
    cuts: [],
    additions: [],
    researchRequests: [],
    revisedGamePlan: null,
    requiresMajorRevision: false,
    remainingConcerns: [],
    bracketAssessment: "",
    predictedEffectiveBracket: 3,
    keyImprovements: [],
    structuralChanges: [],
  };
}

function tryParseJsonCandidate(candidate: string): unknown | null {
  try {
    return JSON.parse(candidate);
  } catch (err) {
    if (!(err instanceof SyntaxError)) return null;
    const posMatch = err.message.match(/position (\d+)/);
    if (!posMatch) return null;
    const pos = parseInt(posMatch[1]!, 10);
    if (!Number.isFinite(pos) || pos <= 0) return null;

    let slice = candidate.slice(0, pos);
    slice = slice.replace(/,\s*(\{|\[)?[^\]\}]*$/, "");
    slice = stripTrailingCommas(slice);
    slice = closeOpenJsonContainers(slice);

    try {
      const parsed = JSON.parse(slice);
      console.warn(`[head-professor] Parsed JSON after truncating at syntax error position ${pos}`);
      return parsed;
    } catch {
      return null;
    }
  }
}

function parseJsonFromModelText(content: string): unknown {
  const jsonText = extractJsonObjectText(content);
  const candidates = [
    jsonText,
    stripTrailingCommas(jsonText),
    closeOpenJsonContainers(stripTrailingCommas(jsonText)),
    closeOpenJsonContainers(jsonText),
  ];

  for (const candidate of candidates) {
    const parsed = tryParseJsonCandidate(candidate);
    if (parsed !== null) return parsed;
  }

  const recovered = extractSwapsFallback(jsonText);
  if (recovered) return recovered;

  throw new Error(
    `Head Professor JSON parse failed (${jsonText.length} chars near end): ${jsonText.slice(Math.max(0, jsonText.length - 240))}`,
  );
}

function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return "Head Professor API request failed";
  const cause = err.cause as { code?: string; message?: string } | undefined;
  if (cause?.code) return `${err.message} (${cause.code})`;
  if (cause?.message && cause.message !== err.message) return `${err.message} — ${cause.message}`;
  return err.message;
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof HeadProfessorCallFailedError && /timed out after/i.test(err.message)) return true;
  if (!(err instanceof Error)) return false;
  return /aborted due to timeout|timed out after/i.test(err.message);
}

/** Transient network blips only — never retry on wall-clock timeout (prevents bg↔sync infinite loop). */
function isTransientNetworkError(err: unknown): boolean {
  if (isTimeoutError(err)) return false;
  if (!(err instanceof Error)) return false;
  if (/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(err.message)) {
    return true;
  }
  const cause = err.cause as { code?: string; message?: string } | undefined;
  return Boolean(cause?.code && /ECONNRESET|ETIMEDOUT|UND_ERR/i.test(cause.code));
}

function formatTimeoutMessage(timeoutMs: number, reasoningEffort: ReasoningEffort): string {
  const minutes = Math.round(timeoutMs / 60_000);
  return `GPT-5.6 Sol Head Professor timed out after ${minutes} minute${minutes === 1 ? "" : "s"} (reasoning=${reasoningEffort}). Retry or raise PROFESSOR_BREW_HEAD_PROFESSOR_TIMEOUT_MS.`;
}

export class HeadProfessorCallFailedError extends Error {
  constructor(
    message: string,
    public readonly model: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HeadProfessorCallFailedError";
  }
}

function modelSupportsReasoningEffort(modelIdentifier: string): boolean {
  return /gpt-5|o[134]|sol|luna/i.test(modelIdentifier);
}

function buildHeadProfessorRequestBody(args: {
  modelPin: ProfessorModelPinV2;
  modelIdentifier: string;
  reasoningEffort: ReasoningEffort;
  system: string;
  userContent: string;
  useJsonSchema?: boolean;
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
}): Record<string, unknown> {
  const schema = args.jsonSchema ?? HEAD_PROFESSOR_RESPONSE_JSON_SCHEMA;
  const schemaName = args.schemaName ?? "head_professor_review_v48";
  const body: Record<string, unknown> = {
    model: args.modelIdentifier,
    input: [
      { role: "developer", content: args.system },
      { role: "user", content: args.userContent },
    ],
    max_output_tokens: resolveHeadProfessorMaxOutputTokens(args.modelPin),
    text: args.useJsonSchema === false
      ? { format: { type: "json_object" } }
      : {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
  };
  if (modelSupportsReasoningEffort(args.modelIdentifier)) {
    body.reasoning = {
      effort: args.reasoningEffort,
      ...(args.modelPin.reasoningConfiguration.mode === "pro" ? { mode: "pro" } : {}),
    };
  }
  return body;
}

function shouldFallbackFromJsonSchema(err: unknown): boolean {
  if (!(err instanceof HeadProfessorCallFailedError)) return false;
  return /json_schema|schema|400|invalid.*format/i.test(err.message);
}

function parseCompletedResponse(args: {
  apiResult: ResponsesApiResult;
  modelIdentifier: string;
}): string {
  const outputText = extractOutputText(args.apiResult.output, args.apiResult.output_text);
  if (!outputText) {
    throw new HeadProfessorCallFailedError("Head Professor returned empty output", args.modelIdentifier);
  }
  return outputText;
}

async function callSyncHeadProfessorResponse(args: {
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  modelIdentifier: string;
}): Promise<ResponsesApiResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(args.body),
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  const apiResponseRaw = await response.text();
  if (!response.ok) {
    throw new HeadProfessorCallFailedError(
      `Head Professor API failed (${response.status}): ${apiResponseRaw.slice(0, 500)}`,
      args.modelIdentifier,
    );
  }
  const result = JSON.parse(apiResponseRaw) as ResponsesApiResult;
  if (result.status === "failed") {
    const message = result.error?.message ?? "Head Professor response failed";
    throw new HeadProfessorCallFailedError(message, args.modelIdentifier, result.error);
  }
  return result;
}

async function createBackgroundHeadProfessorResponse(args: {
  apiKey: string;
  body: Record<string, unknown>;
  modelIdentifier: string;
}): Promise<{ id: string; status: string }> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...args.body, background: true }),
    signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
  });
  const apiResponseRaw = await response.text();
  if (!response.ok) {
    throw new HeadProfessorCallFailedError(
      `Head Professor API failed (${response.status}): ${apiResponseRaw.slice(0, 500)}`,
      args.modelIdentifier,
    );
  }
  const created = JSON.parse(apiResponseRaw) as ResponsesApiResult;
  if (!created.id) {
    throw new HeadProfessorCallFailedError(
      `Head Professor background create returned no id: ${apiResponseRaw.slice(0, 300)}`,
      args.modelIdentifier,
    );
  }
  return { id: created.id, status: created.status ?? "queued" };
}

async function pollBackgroundHeadProfessorResponse(args: {
  apiKey: string;
  responseId: string;
  timeoutMs: number;
  modelIdentifier: string;
  reasoningEffort: ReasoningEffort;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<ResponsesApiResult> {
  const deadline = Date.now() + args.timeoutMs;
  let polls = 0;
  const started = Date.now();

  while (Date.now() < deadline) {
    if (polls > 0) await sleep(POLL_INTERVAL_MS);
    polls++;

    let pollRaw: string;
    try {
      const pollResponse = await fetch(`https://api.openai.com/v1/responses/${args.responseId}`, {
        headers: { Authorization: `Bearer ${args.apiKey}` },
        signal: AbortSignal.timeout(POLL_REQUEST_TIMEOUT_MS),
      });
      pollRaw = await pollResponse.text();
      if (!pollResponse.ok) {
        throw new HeadProfessorCallFailedError(
          `Head Professor poll failed (${pollResponse.status}): ${pollRaw.slice(0, 500)}`,
          args.modelIdentifier,
        );
      }
    } catch (err) {
      if (err instanceof HeadProfessorCallFailedError) throw err;
      console.warn("[head-professor] poll transient error:", describeFetchError(err));
      continue;
    }

    const result = JSON.parse(pollRaw) as ResponsesApiResult;
    if (result.status === "completed") return result;
    if (result.status === "failed") {
      const message = result.error?.message ?? "Head Professor background response failed";
      throw new HeadProfessorCallFailedError(message, args.modelIdentifier, result.error);
    }
    if (polls === 1 || polls % 12 === 0) {
      console.info(
        `[head-professor] GPT-5.6 Sol review in progress (${result.status ?? "unknown"}) — poll ${polls}`,
      );
      if (args.onProgress) {
        const elapsedSec = Math.round((Date.now() - started) / 1000);
        await args.onProgress(`Still working… (${elapsedSec}s)`);
      }
    }
  }

  throw new HeadProfessorCallFailedError(
    formatTimeoutMessage(args.timeoutMs, args.reasoningEffort),
    args.modelIdentifier,
  );
}

export async function callHeadProfessorJsonV48<T>(args: {
  system: string;
  userContent: string;
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
  /** When false, skip strict json_schema (OpenAI often rejects the v4.15 full-review schema). */
  useJsonSchema?: boolean;
  /** Skip sync attempt — use background Responses API immediately (large prompts). */
  backgroundFirst?: boolean;
  /** Live Brew Room: sync-first, low reasoning, 2 min cap — no background ping-pong. */
  liveFast?: boolean;
  /** Override pinned frontier model (e.g. Sol-directed cost control). */
  modelIdentifierOverride?: string;
  /** Override reasoning effort for this call. */
  reasoningEffortOverride?: ReasoningEffort;
  /** Progress hook for long background polls / sync waits. */
  onProgress?: (message: string) => void | Promise<void>;
  telemetry?: {
    collector: ModelTelemetryCollectorV4151;
    purpose: ModelCallPurposeV4151;
    planned?: boolean;
    avoidable?: boolean;
  };
}): Promise<{ parsed: T; model: string; rawText: string; usage: OpenAiUsageV4151 | null; callId: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new HeadProfessorCallFailedError("OPENAI_API_KEY required for Head Professor review", HEAD_PROFESSOR_PRODUCT_NAME);
  }

  const modelPin = loadHeadProfessorModelPinV48();
  const modelIdentifier = args.modelIdentifierOverride?.trim() || modelPin.modelIdentifier;
  const liveFast = args.liveFast === true;
  const timeoutMs = resolveHeadProfessorTimeoutMs(modelPin, liveFast);
  const reasoningEffort =
    args.reasoningEffortOverride ??
    resolveHeadProfessorReasoningEffort(modelPin, liveFast);
  const promptBytes = Buffer.byteLength(args.userContent, "utf8");
  const startedAt = Date.now();
  let retryParentCallId: string | undefined;

  const recordTelemetry = (usage: OpenAiUsageV4151 | null, retryOfCallId?: string) => {
    if (!args.telemetry) return null;
    return args.telemetry.collector.record({
      model: modelIdentifier,
      purpose: args.telemetry.purpose,
      usage,
      latencyMs: Date.now() - startedAt,
      retryOfCallId,
      planned: args.telemetry.planned,
      avoidable: args.telemetry.avoidable ?? Boolean(retryOfCallId),
    });
  };

  const runParse = (outputText: string) => {
    try {
      return parseJsonFromModelText(outputText) as T;
    } catch (err) {
      throw new HeadProfessorCallFailedError(
        err instanceof Error ? err.message : "Failed to parse Head Professor JSON",
        modelIdentifier,
        err,
      );
    }
  };

  const wantsJsonSchema = args.useJsonSchema !== false && Boolean(args.jsonSchema);
  const backgroundFirst =
    !liveFast &&
    (args.backgroundFirst === true ||
      (args.backgroundFirst !== false &&
        (promptBytes >= 14_000 ||
          process.env.PROFESSOR_BREW_HEAD_PROFESSOR_BACKGROUND_FIRST?.trim() === "1")));

  try {
    console.info(
      `[head-professor] Starting ${modelIdentifier} review (${HEAD_PROFESSOR_PARSE_REPAIR_VERSION}, ${liveFast ? "live-fast" : backgroundFirst ? "background-first" : "sync-first"}, reasoning=${reasoningEffort}, prompt ${promptBytes} bytes, timeout ${Math.round(timeoutMs / 1000)}s)`,
    );

    let body = buildHeadProfessorRequestBody({
      modelPin,
      modelIdentifier,
      reasoningEffort,
      system: args.system,
      userContent: args.userContent,
      useJsonSchema: wantsJsonSchema,
      jsonSchema: args.jsonSchema,
      schemaName: args.schemaName,
    });

    const runSync = async (requestBody: Record<string, unknown>) => {
      const syncResult = await callSyncHeadProfessorResponse({
        apiKey,
        body: requestBody,
        timeoutMs,
        modelIdentifier,
      });
      return {
        outputText: parseCompletedResponse({
          apiResult: syncResult,
          modelIdentifier,
        }),
        usage: extractResponsesApiUsage(syncResult),
      };
    };

    const completeViaBackground = async (
      requestBody: Record<string, unknown>,
    ): Promise<{ outputText: string; usage: OpenAiUsageV4151 | null; viaBackground: boolean }> => {
      retryParentCallId = recordTelemetry(null) ?? undefined;
      const created = await createBackgroundHeadProfessorResponse({
        apiKey,
        body: requestBody,
        modelIdentifier,
      });
      const apiResult = await pollBackgroundHeadProfessorResponse({
        apiKey,
        responseId: created.id,
        timeoutMs,
        modelIdentifier,
        reasoningEffort,
        onProgress: args.onProgress,
      });
      return {
        outputText: parseCompletedResponse({ apiResult, modelIdentifier }),
        usage: extractResponsesApiUsage(apiResult),
        viaBackground: true,
      };
    };

    const completeSyncOnly = async (
      requestBody: Record<string, unknown>,
    ): Promise<{ outputText: string; usage: OpenAiUsageV4151 | null; viaBackground: boolean }> => {
      const sync = await runSync(requestBody);
      return { ...sync, viaBackground: false };
    };

    const completeWithBackgroundFallback = async (
      requestBody: Record<string, unknown>,
      syncFailureReason: string,
    ): Promise<{ outputText: string; usage: OpenAiUsageV4151 | null; viaBackground: boolean }> => {
      try {
        return await completeSyncOnly(requestBody);
      } catch (syncErr) {
        if (!isTransientNetworkError(syncErr)) throw syncErr;
        console.warn(
          `[head-professor] ${syncFailureReason}, retrying in background mode:`,
          describeFetchError(syncErr),
        );
        return completeViaBackground(requestBody);
      }
    };

    let result: { outputText: string; usage: OpenAiUsageV4151 | null; viaBackground: boolean };
    if (backgroundFirst) {
      try {
        result = await completeViaBackground(body);
      } catch (bgErr) {
        console.warn(
          "[head-professor] Background-first failed, falling back to sync-only (no re-background):",
          describeFetchError(bgErr),
        );
        result = await completeSyncOnly(body);
      }
    } else {
      try {
        result = await completeWithBackgroundFallback(body, "Sync call failed");
      } catch (syncErr) {
        if (!wantsJsonSchema || !shouldFallbackFromJsonSchema(syncErr)) throw syncErr;
        console.warn("[head-professor] json_schema rejected, falling back to json_object");
        body = buildHeadProfessorRequestBody({
          modelPin,
          modelIdentifier,
          reasoningEffort,
          system: args.system,
          userContent: args.userContent,
          useJsonSchema: false,
          jsonSchema: args.jsonSchema,
          schemaName: args.schemaName,
        });
        result = await completeWithBackgroundFallback(body, "json_object sync failed");
      }
    }

    const parsed = runParse(result.outputText);
    const callId = recordTelemetry(result.usage, retryParentCallId);
    console.info(
      `[head-professor] ${modelIdentifier} review completed (${result.viaBackground ? "background" : "sync"})`,
    );
    return {
      parsed,
      model: modelIdentifier,
      rawText: result.outputText,
      usage: result.usage,
      callId,
    };
  } catch (err) {
    if (err instanceof HeadProfessorCallFailedError) throw err;
    throw new HeadProfessorCallFailedError(describeFetchError(err), modelIdentifier, err);
  }
}
