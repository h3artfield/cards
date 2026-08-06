import type { ScannedCard } from "@/lib/types";
import { CONDITION_LABELS } from "@/lib/constants";

const ITEM_TYPE_LABELS: Record<string, string> = {
  raw: "Raw card",
  graded: "Graded slab",
  unknown: "Card",
};

/** Customer-safe status — no pricing or internal workflow detail. */
export function customerCardStatusLabel(status: ScannedCard["status"]): string {
  switch (status) {
    case "pending":
    case "processing":
      return "Identifying…";
    case "processed":
    case "manual_review":
    case "approved":
      return "Submitted for store review";
    case "do_not_buy":
      return "Not eligible for buyback";
    case "rejected":
      return "Not accepted";
    default:
      return "Submitted";
  }
}

export function customerCardDetails(card: ScannedCard): string[] {
  const lines: string[] = [];
  const typeLabel = ITEM_TYPE_LABELS[card.itemType] ?? "Card";
  lines.push(typeLabel);

  if (card.setName) lines.push(card.setName);
  if (card.cardNumber) lines.push(`#${card.cardNumber}`);
  if (card.year) lines.push(card.year);
  if (card.slabCompany && card.slabGrade) {
    lines.push(`${card.slabCompany} ${card.slabGrade}`);
  } else if (card.conditionEstimate) {
    lines.push(CONDITION_LABELS[card.conditionEstimate]);
  }
  if (card.variant) lines.push(card.variant);
  if (card.parallel) lines.push(card.parallel);

  return lines;
}

export function isOrderProcessing(status: string): boolean {
  return status === "submitted" || status === "processing";
}

export function isOrderLockedForScanning(status: string): boolean {
  return !["draft", "scanning"].includes(status);
}
