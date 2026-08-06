import type { V2ReviewStatus } from "../card-flow-v2/v2-review-status";
import type { ScannedCard } from "../types";
import type { ReviewCardState } from "@/components/ReviewStateCardShell";

export function isStaffPrintingConfirmationSettled(
  card: ScannedCard,
  identity?: { staffSelection?: { suspectId?: string; confirmedBy?: string } },
): boolean {
  const sel =
    identity?.staffSelection ?? card.cardFlowV2Identity?.staffSelection;
  if (!sel?.suspectId) return false;
  return sel.confirmedBy !== "pending";
}

/** Clerk flip-card border: pending until printing confirmed, then green/red from rules + preview. */
export function resolveClerkVisualReviewState(input: {
  card: ScannedCard;
  v2ReviewStatus: V2ReviewStatus;
  versionConfirmed?: boolean;
  storeRuleBlocked?: boolean;
}): ReviewCardState {
  const versionConfirmed =
    input.versionConfirmed ??
    isStaffPrintingConfirmationSettled(input.card);

  if (!versionConfirmed) {
    return "pending";
  }

  if (input.storeRuleBlocked) {
    return "no";
  }

  if (
    input.v2ReviewStatus === "v2_staff_confirmed_blocked" ||
    input.v2ReviewStatus === "v2_production_price_warning"
  ) {
    return "no";
  }

  if (input.v2ReviewStatus === "v2_staff_confirmed_ready") {
    return "yes";
  }

  if (
    input.v2ReviewStatus === "v2_needs_pricing_review" ||
    input.v2ReviewStatus === "v2_source_disagreement"
  ) {
    return "pending";
  }

  return "pending";
}

export function shouldEvaluateClerkStoreRules(
  card: ScannedCard,
  versionConfirmed?: boolean,
): boolean {
  return versionConfirmed ?? isStaffPrintingConfirmationSettled(card);
}
