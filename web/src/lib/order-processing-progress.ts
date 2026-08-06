import type { BuybackOrder, ScannedCard } from "./types";
import { isOrderProcessing } from "./customer-order-display";

export function isCardAwaitingProcessing(status: ScannedCard["status"]): boolean {
  return status === "pending" || status === "processing";
}

export function countOrderCardsProcessed(cards: ScannedCard[]): number {
  return cards.filter((c) => !isCardAwaitingProcessing(c.status)).length;
}

/** 0–100 from actual card completion; 100 when order is no longer processing. */
export function computeOrderProcessingProgress(input: {
  order: Pick<BuybackOrder, "status">;
  cards: ScannedCard[];
}): number {
  if (!isOrderProcessing(input.order.status)) return 100;

  const total = input.cards.length;
  if (total === 0) return 0;

  return Math.round((countOrderCardsProcessed(input.cards) / total) * 100);
}

export function formatOrderProcessingDetail(input: {
  order: Pick<BuybackOrder, "status">;
  cards: ScannedCard[];
}): string | null {
  if (!isOrderProcessing(input.order.status)) return null;

  const total = input.cards.length;
  if (total === 0) return null;

  const done = countOrderCardsProcessed(input.cards);
  return `${done} of ${total} card${total === 1 ? "" : "s"} processed`;
}

const WORKER_STUCK_MS = 5 * 60 * 1000;

/** Building with zero card progress for 5+ minutes — worker likely failed or never started. */
export function isOrderProcessingWorkerStuck(input: {
  order: Pick<
    BuybackOrder,
    "status" | "processingStartedAt" | "processingHeartbeatAt" | "submittedAt"
  >;
  cardsProcessedCount: number;
  cardCount: number;
  nowMs?: number;
}): boolean {
  if (!isOrderProcessing(input.order.status)) return false;
  if (input.cardCount <= 0) return false;
  if (input.cardsProcessedCount > 0) return false;

  const anchor =
    input.order.processingHeartbeatAt ??
    input.order.processingStartedAt ??
    input.order.submittedAt;
  if (!anchor) return false;

  const age = (input.nowMs ?? Date.now()) - Date.parse(anchor);
  return age >= WORKER_STUCK_MS;
}

export const ORDER_PROCESSING_WORKER_STUCK_MESSAGE =
  "Processing worker appears stuck — retry or cancel.";
