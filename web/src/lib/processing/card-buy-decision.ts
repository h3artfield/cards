import type { V2ReviewStatus } from "../card-flow-v2/v2-review-status";
import { runCardAuditV2 } from "../card-flow-v2/audit/run-card-audit-v2";
import { resolveV2ReviewStatus } from "../card-flow-v2/v2-review-status";
import { resolveClerkDisplayOffers, resolveClerkRunningOfferAmounts } from "../card-flow-v2/clerk-card-insights";
import type { ScannedCard, StoreRule } from "../types";
import { evaluateClerkStoreRules } from "./clerk-store-rules";
import {
  isStaffPrintingConfirmationSettled,
  shouldEvaluateClerkStoreRules,
} from "./clerk-visual-review-state";
import type { RuleEngineResult } from "./rules-engine";

/** Buyback report says include this card in the order offer. */
export function reportRecommendsBuy(card: ScannedCard): boolean {
  const rec = card.resaleAnalysis?.recommendation;
  return rec === "buy" || rec === "negotiate";
}

export function reportRecommendsPass(card: ScannedCard): boolean {
  return card.resaleAnalysis?.recommendation === "pass";
}

/** Card counts toward running order total. */
export function isCardIncludedInOffer(card: ScannedCard): boolean {
  if (card.staffDecision === "yes") return true;
  if (card.staffDecision === "no") return false;
  if (card.status === "approved") return true;
  if (card.status === "do_not_buy") return false;
  return reportRecommendsBuy(card);
}

export function effectiveCardDecision(
  card: ScannedCard,
): "yes" | "no" | "pending" {
  if (card.staffDecision === "yes" || card.status === "approved") return "yes";
  if (card.staffDecision === "no" || card.status === "do_not_buy") return "no";
  if (reportRecommendsBuy(card)) return "yes";
  if (reportRecommendsPass(card)) return "no";
  return "pending";
}

/** Clerk V2 review — store rules and confirmed printing gate buy/pass. */
export function effectiveClerkCardDecision(
  card: ScannedCard,
  v2ReviewStatus: V2ReviewStatus,
  storeRuleBlocked?: boolean,
): "yes" | "no" | "pending" {
  if (card.staffDecision === "yes") return "yes";
  if (card.staffDecision === "no") return "no";

  if (!isStaffPrintingConfirmationSettled(card)) {
    return "pending";
  }

  if (
    card.status === "approved" &&
    v2ReviewStatus !== "v2_needs_identity_confirmation" &&
    card.cardFlowV2OfferPreview?.recommendedAction !==
      "identity_confirmation_required"
  ) {
    return "yes";
  }

  if (
    storeRuleBlocked ||
    card.cardFlowV2OfferPreview?.storeRuleBlocked ||
    card.cardFlowV2OfferPreview?.recommendedAction === "store_rule_rejected"
  ) {
    return "no";
  }

  if (v2ReviewStatus === "v2_staff_confirmed_ready") return "yes";

  if (card.status === "do_not_buy") return "no";

  if (
    v2ReviewStatus === "v2_production_price_warning" ||
    v2ReviewStatus === "v2_source_disagreement" ||
    v2ReviewStatus === "v2_staff_confirmed_blocked" ||
    v2ReviewStatus === "v2_needs_pricing_review" ||
    v2ReviewStatus === "v2_not_ready" ||
    v2ReviewStatus === "v2_needs_identity_confirmation"
  ) {
    return "pending";
  }

  if (reportRecommendsBuy(card)) return "yes";
  if (reportRecommendsPass(card)) return "no";
  return "pending";
}

export type CardClerkReviewContext = {
  hasV2: boolean;
  decision: "yes" | "no" | "pending";
  v2ReviewStatus?: V2ReviewStatus;
  storeRuleBlocked: boolean;
  storeRuleBlock: RuleEngineResult | null;
};

/** Same buy/pass logic as clerk card UI — used for running totals and checkout. */
export function resolveCardClerkReviewContext(
  card: ScannedCard,
  storeRules: StoreRule[] = [],
): CardClerkReviewContext {
  const hasV2 = Boolean(
    card.cardFlowV2Evidence ||
      card.cardFlowV2Identity ||
      card.cardFlowV2Market,
  );

  if (!hasV2) {
    return {
      hasV2: false,
      decision: effectiveCardDecision(card),
      storeRuleBlocked: false,
      storeRuleBlock: null,
    };
  }

  const v2Audit =
    card.cardFlowV2Audit ??
    (card.cardFlowV2Identity?.lockedIdentity
      ? runCardAuditV2({ card })
      : undefined);
  const versionConfirmed = isStaffPrintingConfirmationSettled(card);
  const clerkMarket = resolveClerkDisplayOffers({
    card,
    offerPreview: card.cardFlowV2OfferPreview,
    versionConfirmed,
  }).market;
  const storeRuleBlock =
    shouldEvaluateClerkStoreRules(card, versionConfirmed) &&
    storeRules.length &&
    clerkMarket != null
      ? evaluateClerkStoreRules(card, storeRules, clerkMarket)
      : null;
  const storeRuleBlocked = Boolean(storeRuleBlock?.doNotBuy);

  let v2ReviewStatus: V2ReviewStatus;
  if (versionConfirmed) {
    const preview = card.cardFlowV2OfferPreview;
    if (
      storeRuleBlocked ||
      preview?.storeRuleBlocked ||
      preview?.recommendedAction === "store_rule_rejected"
    ) {
      v2ReviewStatus = "v2_staff_confirmed_blocked";
    } else if (
      preview?.eligible ||
      preview?.recommendedAction === "staff_confirmed_preview_ready"
    ) {
      v2ReviewStatus = "v2_staff_confirmed_ready";
    } else {
      v2ReviewStatus = "v2_staff_confirmed_blocked";
    }
  } else {
    v2ReviewStatus = resolveV2ReviewStatus({ card, audit: v2Audit });
  }

  const decision = effectiveClerkCardDecision(
    card,
    v2ReviewStatus,
    storeRuleBlocked,
  );

  return {
    hasV2: true,
    decision,
    v2ReviewStatus,
    storeRuleBlocked,
    storeRuleBlock: storeRuleBlocked ? storeRuleBlock : null,
  };
}

export function isCardIncludedInClerkOffer(
  card: ScannedCard,
  storeRules: StoreRule[] = [],
): boolean {
  return resolveCardClerkReviewContext(card, storeRules).decision === "yes";
}

/** Running total — clerk display offers for yes-cards (matches card face). */
export function computeProductionOrderRunningTotals(
  cards: ScannedCard[],
  storeRules: StoreRule[] = [],
) {
  const included = cards.filter((c) =>
    isCardIncludedInClerkOffer(c, storeRules),
  );
  return {
    includedCount: included.length,
    totalCards: cards.length,
    market: included.reduce(
      (s, c) => s + resolveClerkRunningOfferAmounts(c).market,
      0,
    ),
    cash: included.reduce(
      (s, c) => s + resolveClerkRunningOfferAmounts(c).cash,
      0,
    ),
    trade: included.reduce(
      (s, c) => s + resolveClerkRunningOfferAmounts(c).trade,
      0,
    ),
  };
}

export function computeOrderRunningTotals(cards: ScannedCard[]) {
  const included = cards.filter(isCardIncludedInOffer);
  return {
    includedCount: included.length,
    totalCards: cards.length,
    market: included.reduce((s, c) => s + (c.marketPrice ?? 0), 0),
    cash: included.reduce((s, c) => s + (c.cashOffer ?? 0), 0),
    trade: included.reduce((s, c) => s + (c.tradeOffer ?? 0), 0),
  };
}

/** Apply buyback report default status when staff has not decided yet. */
export function statusFromBuybackReport(
  card: ScannedCard,
): Partial<ScannedCard> | null {
  if (card.staffDecision) return null;
  const rec = card.resaleAnalysis?.recommendation;
  if (!rec) return null;
  if (rec === "buy" || rec === "negotiate") {
    return { status: "approved" };
  }
  if (rec === "pass") {
    return { status: "do_not_buy" };
  }
  return { status: "manual_review" };
}
