import type { OrderStatus } from "../types";

/** Clerk-facing phase for the open orders list. */
export type ClerkOrderPhase = "building" | "ready_for_review";

const READY_FOR_REVIEW: OrderStatus[] = [
  "under_review",
  "offer_ready",
  "accepted",
];

export function clerkOrderPhase(status: OrderStatus): ClerkOrderPhase {
  return READY_FOR_REVIEW.includes(status) ? "ready_for_review" : "building";
}

export function isOrderReadyForReview(status: OrderStatus): boolean {
  return clerkOrderPhase(status) === "ready_for_review";
}
