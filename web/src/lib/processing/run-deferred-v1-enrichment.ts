import type { ScannedCard, StoreRule, StoreSettings } from "../types";
import { runFullCardAnalysis } from "./full-analysis";
import {
  mergeAsyncV1Enrichment,
  snapshotProductionFields,
} from "./preserve-production-fields";
import { bindApiCallTracker } from "./api-call-tracker";
import {
  createCardProcessingTimings,
  finalizeCardProcessingTimings,
  timePhase,
} from "./processing-timings";
import type { OrderProcessingWorker } from "./processing-config";

/** Phase 2 — V1 enrichment that must not overwrite V2 production fields. */
export async function runDeferredV1Enrichment(
  card: ScannedCard,
  settings: StoreSettings,
  rules: StoreRule[],
  workerMode: OrderProcessingWorker,
): Promise<ScannedCard> {
  const before = snapshotProductionFields(card);
  const timings = card.processingTimings ?? createCardProcessingTimings({
    workerMode,
    pipelineMode: "v2_primary",
  });
  bindApiCallTracker(timings);
  const startedMs = Date.now();

  try {
    const result = await timePhase(timings, "v1FullAnalysisMs", () =>
      runFullCardAnalysis(card, {
        rules,
        settings,
        preserveProductionFields: true,
      }),
    );

    return {
      ...mergeAsyncV1Enrichment(before, result.card),
      processingTimings: finalizeCardProcessingTimings(
        {
          ...timings,
          v1FullAnalysisMs:
            (timings.v1FullAnalysisMs ?? 0) + (Date.now() - startedMs),
        },
        startedMs,
      ),
      lastCompletedStep: "v1_async_enrichment_complete",
    };
  } finally {
    bindApiCallTracker(null);
  }
}
