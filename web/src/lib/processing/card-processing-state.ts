import type { ScannedCard } from "../types";
import { getStuckOrderThresholdMs } from "./processing-config";

const COMPLETE_STATUSES = new Set<ScannedCard["status"]>([
  "processed",
  "manual_review",
  "do_not_buy",
  "approved",
  "rejected",
]);

/** Cards that should not be reprocessed by the order job. */
export function isCardProcessingComplete(card: ScannedCard): boolean {
  return COMPLETE_STATUSES.has(card.status);
}

export function shouldProcessCard(card: ScannedCard): boolean {
  return card.status === "pending" || card.status === "processing";
}

export function isStaleProcessingCard(
  card: ScannedCard,
  nowMs = Date.now(),
): boolean {
  if (card.status !== "processing") return false;
  const timings = card.processingTimings;
  const started = timings?.startedAt
    ? Date.parse(timings.startedAt)
    : Date.parse(card.createdAt);
  if (Number.isNaN(started)) return false;
  return nowMs - started > getStuckOrderThresholdMs();
}
