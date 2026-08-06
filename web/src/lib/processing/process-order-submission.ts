import { dataStore } from "@/lib/storage/data-store";
import {
  processOrderCards,
  resolveOrderStatus,
} from "@/lib/processing/process-order";
import { notifyOwner } from "@/lib/processing/notifications";
import { handleOrderReadyForReviewTransition } from "@/lib/processing/order-ready-customer-email";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import {
  getCardProcessingPipelineMode,
  getOrderProcessingWorker,
  isV1AnalysisAsyncEnabled,
  isV1FullAnalysisOnSubmit,
} from "@/lib/processing/processing-config";
import {
  createOrderProcessingTimings,
  finalizeOrderProcessingTimings,
} from "@/lib/processing/processing-timings";
import {
  isCardProcessingComplete,
  shouldProcessCard,
} from "@/lib/processing/card-processing-state";
import { runDeferredV1Enrichment } from "@/lib/processing/run-deferred-v1-enrichment";
import type { BuybackOrder } from "@/lib/types";

export type ProcessOrderSubmissionOptions = {
  isFirstSubmit?: boolean;
  attemptId?: string;
  jobExecutionId?: string;
  workerMode?: "after" | "cloud_run_job";
};

async function touchOrderHeartbeat(
  order: BuybackOrder,
  step: string,
): Promise<BuybackOrder> {
  return dataStore.saveOrder({
    ...order,
    processingHeartbeatAt: new Date().toISOString(),
    lastCompletedStep: step,
  });
}

function createOrderHeartbeatQueue(orderId: string) {
  let chain = Promise.resolve();
  return (step: string) => {
    chain = chain.then(async () => {
      const fresh = await dataStore.getOrder(orderId);
      if (!fresh) return;
      await touchOrderHeartbeat(fresh, step);
    });
    return chain;
  };
}

/** Vision, pricing, and analysis — Cloud Run Job or legacy after(). */
export async function processOrderSubmission(
  orderId: string,
  options: ProcessOrderSubmissionOptions = {},
): Promise<void> {
  const workerMode = options.workerMode ?? getOrderProcessingWorker();
  const pipelineMode = getCardProcessingPipelineMode();
  const attemptId = options.attemptId ?? options.jobExecutionId;

  let order = await dataStore.getOrder(orderId);
  if (!order) return;

  let cards = await dataStore.getCardsByOrder(orderId);
  if (!cards.length) return;

  const customer = await dataStore.getCustomer(order.customerId);
  if (!customer) return;

  const storeId = order.storeId?.trim() || DEFAULT_STORE_ID;
  const settings = await dataStore.getSettings(storeId);
  const rules = await dataStore.getActiveRules(storeId);
  const submittedAt = order.submittedAt ?? new Date().toISOString();
  const orderStartedMs = Date.now();

  let cardsProcessed = 0;
  let cardsSkipped = 0;
  let cardsFailed = 0;

  const orderTimings =
    order.orderProcessingTimings ??
    createOrderProcessingTimings({
      workerMode,
      pipelineMode,
      jobExecutionId: options.jobExecutionId,
    });

  const queueOrderHeartbeat = createOrderHeartbeatQueue(orderId);

  order = await dataStore.saveOrder({
    ...order,
    status: "processing",
    submittedAt,
    processingStartedAt: order.processingStartedAt ?? submittedAt,
    processingAttemptId: attemptId ?? order.processingAttemptId,
    processingHeartbeatAt: new Date().toISOString(),
    lastCompletedStep: "job_started",
    orderProcessingTimings: orderTimings,
  });

  try {
    const toProcess = cards.filter((c) => {
      if (isCardProcessingComplete(c)) {
        cardsSkipped++;
        return false;
      }
      return shouldProcessCard(c) || c.status === "processing";
    });

    if (toProcess.length > 0) {
      await processOrderCards(toProcess, settings, rules, {
        workerMode,
        pipelineMode,
        attemptId,
        skipFullAnalysis:
          pipelineMode === "v2_primary" && !isV1FullAnalysisOnSubmit(),
        onCardProcessing: async (card) => {
          await dataStore.saveCard({
            ...card,
            status: "processing",
            processingAttemptId: attemptId,
            lastCompletedStep: "card_processing_started",
          });
          await queueOrderHeartbeat(`card_processing:${card.id}`);
        },
        onCardComplete: async (card) => {
          await dataStore.saveCard(card);
          cardsProcessed++;
          await queueOrderHeartbeat(`card_complete:${card.id}`);
        },
        onCardSkipped: () => {
          cardsSkipped++;
        },
        onCardFailed: () => {
          cardsFailed++;
        },
        onCardFailedSave: async (card) => {
          await dataStore.saveCard(card);
          await queueOrderHeartbeat(`card_failed:${card.id}`);
        },
      });
    }

    cards = await dataStore.getCardsByOrder(orderId);
    const freshOrder = (await dataStore.getOrder(orderId)) ?? order;
    const manualReviewCount = cards.filter(
      (c) => c.status === "manual_review" || c.status === "do_not_buy",
    ).length;
    const finalStatus = resolveOrderStatus(manualReviewCount, cards.length);
    const previousStatus = freshOrder.status;

    const eligible = cards.filter((c) => c.status !== "do_not_buy");
    const updatedOrder: BuybackOrder = {
      ...freshOrder,
      status: finalStatus,
      submittedAt,
      reviewedAt: new Date().toISOString(),
      totalMarketEstimate: eligible.reduce(
        (s, c) => s + (c.marketPrice ?? 0),
        0,
      ),
      totalCashOffer: eligible.reduce((s, c) => s + (c.cashOffer ?? 0), 0),
      totalTradeOffer: eligible.reduce((s, c) => s + (c.tradeOffer ?? 0), 0),
      manualReviewCount,
      processingHeartbeatAt: new Date().toISOString(),
      lastCompletedStep: "order_finalized",
      orderProcessingTimings: finalizeOrderProcessingTimings(
        {
          ...orderTimings,
          cardsProcessed,
          cardsSkipped,
          cardsFailed,
        },
        orderStartedMs,
      ),
    };

    await dataStore.saveOrder(updatedOrder);

    const withNotification = await handleOrderReadyForReviewTransition({
      previousStatus,
      order: updatedOrder,
      customer,
      storeName: settings.storeName,
      cardCount: cards.length,
    });
    const savedOrder =
      withNotification !== updatedOrder
        ? await dataStore.saveOrder(withNotification)
        : updatedOrder;

    if (options.isFirstSubmit) {
      await notifyOwner(settings.ownerEmail, savedOrder, customer);
    }

    if (pipelineMode === "v2_primary" && isV1AnalysisAsyncEnabled()) {
      await queueOrderHeartbeat("v1_async_enrichment_started");
      for (const card of cards) {
        try {
          const enriched = await runDeferredV1Enrichment(
            card,
            settings,
            rules,
            workerMode,
          );
          await dataStore.saveCard(enriched);
        } catch (err) {
          console.error(
            `[processOrderSubmission] async V1 enrichment card ${card.id}:`,
            err,
          );
        }
      }
      await queueOrderHeartbeat("v1_async_enrichment_complete");
    }
  } catch (err) {
    console.error(`[processOrderSubmission] order ${orderId}:`, err);
    const failedOrder = (await dataStore.getOrder(orderId)) ?? order;
    await dataStore.saveOrder({
      ...failedOrder,
      status: "processing",
      submittedAt,
      processingHeartbeatAt: new Date().toISOString(),
      lastCompletedStep: "job_failed",
      orderProcessingTimings: finalizeOrderProcessingTimings(
        {
          ...orderTimings,
          cardsProcessed,
          cardsSkipped,
          cardsFailed: cardsFailed + 1,
        },
        orderStartedMs,
      ),
    });
    throw err;
  }
}
