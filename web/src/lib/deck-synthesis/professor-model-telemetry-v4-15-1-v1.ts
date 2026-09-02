/**
 * Professor model telemetry v4.15.1 — token usage and call budget accounting.
 */
export const PROFESSOR_MODEL_TELEMETRY_V4_15_1_V1_VERSION = "professor-model-telemetry-v4-15-1-v1";

export type ModelCallPurposeV4151 =
  | "CREATIVE_COUNCIL"
  | "HEAD_PROFESSOR_REVIEW"
  | "ARCHITECTURE_ANALYSIS"
  | "DEEP_REFINEMENT"
  | "BRACKET_ADJUDICATION"
  | "PLAY_REPORT"
  | "OTHER";

export type OpenAiUsageV4151 = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
};

export type ModelCallRecordV4151 = {
  callId: string;
  model: string;
  purpose: ModelCallPurposeV4151;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  latencyMs: number;
  retryOfCallId?: string;
  avoidable?: boolean;
  planned?: boolean;
};

export type ModelCallBudgetV4151 = {
  plannedCalls: number;
  actualCalls: number;
  retryCalls: number;
  avoidableCalls: number;
};

export type ModelUsageAggregateV4151 = {
  version: typeof PROFESSOR_MODEL_TELEMETRY_V4_15_1_V1_VERSION;
  calls: ModelCallRecordV4151[];
  budget: ModelCallBudgetV4151;
  byPurpose: Record<
    ModelCallPurposeV4151,
    { calls: number; inputTokens: number; outputTokens: number; totalTokens: number }
  >;
  totals: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    estimatedCostUsd: number | null;
  };
};

let callCounter = 0;

export function createModelTelemetryCollector(args?: { plannedCalls?: number }): {
  collector: ModelTelemetryCollectorV4151;
  aggregate: () => ModelUsageAggregateV4151;
} {
  const collector = new ModelTelemetryCollectorV4151(args?.plannedCalls ?? 0);
  return { collector, aggregate: () => collector.aggregate() };
}

export class ModelTelemetryCollectorV4151 {
  private readonly calls: ModelCallRecordV4151[] = [];
  private plannedCalls: number;

  constructor(plannedCalls = 0) {
    this.plannedCalls = plannedCalls;
  }

  setPlannedCalls(count: number): void {
    this.plannedCalls = count;
  }

  record(args: {
    model: string;
    purpose: ModelCallPurposeV4151;
    usage?: Partial<OpenAiUsageV4151> | null;
    latencyMs: number;
    retryOfCallId?: string;
    avoidable?: boolean;
    planned?: boolean;
  }): string {
    const callId = `mc-${++callCounter}`;
    const inputTokens = args.usage?.inputTokens ?? 0;
    const outputTokens = args.usage?.outputTokens ?? 0;
    const reasoningTokens = args.usage?.reasoningTokens ?? 0;
    const totalTokens = args.usage?.totalTokens ?? inputTokens + outputTokens + reasoningTokens;
    this.calls.push({
      callId,
      model: args.model,
      purpose: args.purpose,
      inputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens,
      latencyMs: args.latencyMs,
      retryOfCallId: args.retryOfCallId,
      avoidable: args.avoidable ?? false,
      planned: args.planned ?? true,
    });
    return callId;
  }

  aggregate(): ModelUsageAggregateV4151 {
    const purposes: ModelCallPurposeV4151[] = [
      "CREATIVE_COUNCIL",
      "HEAD_PROFESSOR_REVIEW",
      "ARCHITECTURE_ANALYSIS",
      "DEEP_REFINEMENT",
      "BRACKET_ADJUDICATION",
      "PLAY_REPORT",
      "OTHER",
    ];
    const byPurpose = Object.fromEntries(
      purposes.map((purpose) => [purpose, { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }]),
    ) as ModelUsageAggregateV4151["byPurpose"];

    for (const call of this.calls) {
      const bucket = byPurpose[call.purpose];
      bucket.calls += 1;
      bucket.inputTokens += call.inputTokens;
      bucket.outputTokens += call.outputTokens;
      bucket.totalTokens += call.totalTokens;
    }

    const totals = this.calls.reduce(
      (acc, call) => {
        acc.inputTokens += call.inputTokens;
        acc.outputTokens += call.outputTokens;
        acc.reasoningTokens += call.reasoningTokens;
        acc.totalTokens += call.totalTokens;
        return acc;
      },
      { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, estimatedCostUsd: null as number | null },
    );

    totals.estimatedCostUsd = estimateOpenAiCostUsd(this.calls);

    return {
      version: PROFESSOR_MODEL_TELEMETRY_V4_15_1_V1_VERSION,
      calls: [...this.calls],
      budget: {
        plannedCalls: this.plannedCalls,
        actualCalls: this.calls.length,
        retryCalls: this.calls.filter((c) => Boolean(c.retryOfCallId)).length,
        avoidableCalls: this.calls.filter((c) => c.avoidable).length,
      },
      byPurpose,
      totals,
    };
  }
}

function estimateOpenAiCostUsd(calls: ModelCallRecordV4151[]): number | null {
  const inputPerM = parseFloat(process.env.PROFESSOR_OPENAI_INPUT_USD_PER_MTOK ?? "");
  const outputPerM = parseFloat(process.env.PROFESSOR_OPENAI_OUTPUT_USD_PER_MTOK ?? "");
  if (!Number.isFinite(inputPerM) || !Number.isFinite(outputPerM)) return null;
  const inputCost = calls.reduce((n, c) => n + c.inputTokens, 0) * (inputPerM / 1_000_000);
  const outputCost = calls.reduce((n, c) => n + c.outputTokens + c.reasoningTokens, 0) * (outputPerM / 1_000_000);
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}

export function extractChatCompletionUsage(data: unknown): OpenAiUsageV4151 | null {
  if (!data || typeof data !== "object") return null;
  const usage = (data as { usage?: Record<string, number> }).usage;
  if (!usage) return null;
  const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const reasoningTokens = usage.reasoning_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens + reasoningTokens;
  return { inputTokens, outputTokens, reasoningTokens, totalTokens };
}

export function extractResponsesApiUsage(result: unknown): OpenAiUsageV4151 | null {
  if (!result || typeof result !== "object") return null;
  const usage = (result as { usage?: Record<string, number> }).usage;
  if (!usage) return null;
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const reasoningTokens = usage.reasoning_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens + reasoningTokens;
  return { inputTokens, outputTokens, reasoningTokens, totalTokens };
}
