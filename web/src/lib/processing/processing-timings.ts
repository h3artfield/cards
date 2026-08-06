import type {
  CardProcessingTimings,
  OrderProcessingTimings,
} from "../types";
import type {
  CardProcessingPipelineMode,
  OrderProcessingWorker,
} from "./processing-config";

export function createCardProcessingTimings(input: {
  workerMode: OrderProcessingWorker;
  pipelineMode: CardProcessingPipelineMode;
}): CardProcessingTimings {
  return {
    workerMode: input.workerMode,
    pipelineMode: input.pipelineMode,
    startedAt: new Date().toISOString(),
    apiCallCounts: {},
  };
}

export function finalizeCardProcessingTimings(
  timings: CardProcessingTimings,
  startedMs: number,
): CardProcessingTimings {
  const completedAt = new Date().toISOString();
  return {
    ...timings,
    completedAt,
    totalMs: Date.now() - startedMs,
  };
}

export function createOrderProcessingTimings(input: {
  workerMode: OrderProcessingWorker;
  pipelineMode: CardProcessingPipelineMode;
  jobExecutionId?: string;
}): OrderProcessingTimings {
  return {
    workerMode: input.workerMode,
    pipelineMode: input.pipelineMode,
    jobExecutionId: input.jobExecutionId,
    startedAt: new Date().toISOString(),
    cardsProcessed: 0,
    cardsSkipped: 0,
    cardsFailed: 0,
  };
}

export function finalizeOrderProcessingTimings(
  timings: OrderProcessingTimings,
  startedMs: number,
): OrderProcessingTimings {
  return {
    ...timings,
    completedAt: new Date().toISOString(),
    totalMs: Date.now() - startedMs,
  };
}

export async function timePhase<T>(
  timings: CardProcessingTimings,
  key: keyof Pick<
    CardProcessingTimings,
    | "v2EvidenceMs"
    | "v2IdentityMs"
    | "v2MarketMs"
    | "v2AuditPreviewMs"
    | "v2InfluenceMs"
    | "storeRulesMs"
    | "v1VisionMs"
    | "v1PricingMs"
    | "v1FullAnalysisMs"
  >,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    timings[key] = (timings[key] ?? 0) + (Date.now() - start);
  }
}
