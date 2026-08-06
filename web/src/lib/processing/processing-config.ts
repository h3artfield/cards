export type OrderProcessingWorker = "after" | "cloud_run_job";
export type CardProcessingPipelineMode = "legacy_dual" | "v2_primary";

export function getOrderProcessingWorker(): OrderProcessingWorker {
  const v = process.env.ORDER_PROCESSING_WORKER?.trim().toLowerCase();
  if (v === "cloud_run_job") return "cloud_run_job";
  return "after";
}

export function getCardProcessingPipelineMode(): CardProcessingPipelineMode {
  const v = process.env.CARD_PROCESSING_PIPELINE_MODE?.trim().toLowerCase();
  if (v === "v2_primary") return "v2_primary";
  return "legacy_dual";
}

export function isV1PricingOnSubmit(): boolean {
  if (getCardProcessingPipelineMode() === "v2_primary") {
    return process.env.V1_PRICING_ON_SUBMIT === "true";
  }
  return process.env.V1_PRICING_ON_SUBMIT !== "false";
}

export function isV1FullAnalysisOnSubmit(): boolean {
  if (getCardProcessingPipelineMode() === "v2_primary") {
    return process.env.V1_FULL_ANALYSIS_ON_SUBMIT === "true";
  }
  return process.env.V1_FULL_ANALYSIS_ON_SUBMIT !== "false";
}

export function isV1AnalysisAsyncEnabled(): boolean {
  return process.env.V1_ANALYSIS_ASYNC_ENABLED === "true";
}

export function getOrderProcessingJobName(): string {
  return process.env.ORDER_PROCESSING_JOB_NAME?.trim() || "order-processing-job";
}

export function getCloudRunRegion(): string {
  return process.env.CLOUD_RUN_REGION?.trim() || "us-central1";
}

export function getStuckOrderThresholdMs(): number {
  const n = parseInt(process.env.ORDER_PROCESSING_STUCK_THRESHOLD_MS ?? "600000", 10);
  return Number.isFinite(n) && n > 0 ? n : 600_000;
}

export function getCardProcessingMaxMs(): number {
  const n = parseInt(process.env.CARD_PROCESSING_MAX_MS ?? "600000", 10);
  return Number.isFinite(n) && n > 0 ? n : 600_000;
}

export function getOpenAiTimeoutMs(): number {
  const n = parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "60000", 10);
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

/** Max cards processed in parallel within one order (1 = sequential). */
export function getCardProcessingConcurrency(): number {
  const n = parseInt(process.env.CARD_PROCESSING_CONCURRENCY ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 4);
}
