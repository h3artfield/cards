/**
 * Directive 008 — V2-primary processing config and guards.
 * Run: npm run test:directive-008-v2-primary
 */
import {
  getCardProcessingPipelineMode,
  getOrderProcessingWorker,
  isV1AnalysisAsyncEnabled,
  isV1FullAnalysisOnSubmit,
  isV1PricingOnSubmit,
} from "../src/lib/processing/processing-config";
import {
  isCardProcessingComplete,
  shouldProcessCard,
} from "../src/lib/processing/card-processing-state";
import {
  mergeAsyncV1Enrichment,
  snapshotProductionFields,
} from "../src/lib/processing/preserve-production-fields";
import type { ScannedCard } from "../src/lib/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function card(status: ScannedCard["status"]): ScannedCard {
  return {
    id: "c1",
    orderId: "o1",
    frontImageUrl: "",
    backImageUrl: "",
    status,
    itemType: "raw",
    createdAt: "2026-07-06T12:00:00.000Z",
  };
}

function runConfig() {
  console.log("\n1. Staging config flags");
  process.env.ORDER_PROCESSING_WORKER = "cloud_run_job";
  process.env.CARD_PROCESSING_PIPELINE_MODE = "v2_primary";
  process.env.V1_FULL_ANALYSIS_ON_SUBMIT = "false";
  process.env.V1_PRICING_ON_SUBMIT = "false";
  process.env.V1_ANALYSIS_ASYNC_ENABLED = "true";

  assert(getOrderProcessingWorker() === "cloud_run_job", "worker cloud_run_job");
  assert(getCardProcessingPipelineMode() === "v2_primary", "pipeline v2_primary");
  assert(!isV1FullAnalysisOnSubmit(), "V1 full analysis off on submit");
  assert(!isV1PricingOnSubmit(), "V1 pricing off on submit");
  assert(isV1AnalysisAsyncEnabled(), "V1 async enabled");
}

function runCardSkip() {
  console.log("\n2. Card skip / resume");
  assert(isCardProcessingComplete(card("processed")), "processed is complete");
  assert(isCardProcessingComplete(card("manual_review")), "manual_review complete");
  assert(shouldProcessCard(card("pending")), "pending should process");
  assert(shouldProcessCard(card("processing")), "processing should process");
  assert(!shouldProcessCard(card("processed")), "processed should not process");
}

function runPreserveProduction() {
  console.log("\n3. Async V1 preserves production");
  const before = snapshotProductionFields({
    ...card("processed"),
    marketPrice: 55.91,
    cashOffer: 27.95,
    tradeOffer: 30,
    pricingJson: { source: "v2_offer_influence" },
  });
  const enriched = {
    ...card("processed"),
    marketPrice: 2.5,
    cashOffer: 1,
    tradeOffer: 1,
    status: "manual_review" as const,
    pricingJson: { source: "multi_source" },
    resaleAnalysis: {
      recommendation: "pass",
      summary: "test",
      suggestedCashOffer: 0,
      maxBuyPrice: 0,
      confidence: 0.5,
      risks: [],
      opportunities: [],
      sentiment: "neutral",
      salesFrequency: "low",
      analyzedAt: "2026-07-06T12:00:00.000Z",
    },
  };
  const merged = mergeAsyncV1Enrichment(before, enriched as ScannedCard);
  assert(merged.marketPrice === 55.91, "marketPrice preserved");
  assert(merged.cashOffer === 27.95, "cashOffer preserved");
  assert(merged.status === "processed", "status preserved");
  assert(
    (merged.pricingJson as { source?: string }).source === "v2_offer_influence",
    "pricingJson.source preserved",
  );
  assert(Boolean(merged.resaleAnalysis), "resaleAnalysis added");
}

function main() {
  console.log("Directive 008 — V2-primary processing\n");
  runConfig();
  runCardSkip();
  runPreserveProduction();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
