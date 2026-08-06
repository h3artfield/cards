import type { V2OfferPreview } from "./offer/types";
import type { V2ReviewStatus } from "./v2-review-status";
import type { StaffTrainingExplanation } from "./staff-training-explanation";
import type { RuleEngineResult } from "../processing/rules-engine";
import { formatPriceDiffPercent } from "./v2-staff-labels";

export type ClerkRecommendationKind =
  | "ready_to_buy"
  | "ready_low_confidence"
  | "needs_manager_review"
  | "confirm_version_first"
  | "pricing_source_disagreement"
  | "production_price_warning"
  | "insufficient_market_data"
  | "store_rule_pass";

export type ClerkRecommendation = {
  kind: ClerkRecommendationKind;
  title: string;
  reasonLines: string[];
  actionLine: string;
  tone: "green" | "amber" | "red" | "violet" | "slate";
};

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/** Whether production vs V2 comparison belongs in clerk/manager UI. */
export function needsProductionComparison(input: {
  reviewStatus: V2ReviewStatus;
  productionMarketPrice?: number;
  v2PreviewMarketPrice?: number;
}): boolean {
  if (input.reviewStatus === "v2_production_price_warning") return true;
  if (input.reviewStatus === "v2_source_disagreement") return true;
  if (input.reviewStatus === "v2_needs_pricing_review") return true;
  if (input.reviewStatus === "v2_staff_confirmed_blocked") return true;

  const pct = formatPriceDiffPercent(
    input.productionMarketPrice,
    input.v2PreviewMarketPrice,
  );
  if (!pct) return false;
  const n = Math.abs(parseInt(pct, 10));
  return Number.isFinite(n) && n >= 15;
}

export function showClerkWarningSection(reviewStatus: V2ReviewStatus): boolean {
  return (
    reviewStatus === "v2_production_price_warning" ||
    reviewStatus === "v2_source_disagreement" ||
    reviewStatus === "v2_needs_identity_confirmation" ||
    reviewStatus === "v2_needs_pricing_review" ||
    reviewStatus === "v2_staff_confirmed_blocked" ||
    reviewStatus === "v2_not_ready"
  );
}

export function resolveClerkRecommendation(input: {
  reviewStatus: V2ReviewStatus;
  offerPreview?: V2OfferPreview;
  productionMarketPrice?: number;
  staffTraining?: StaffTrainingExplanation | null;
  storeRuleBlock?: RuleEngineResult | null;
}): ClerkRecommendation {
  const previewVal =
    input.offerPreview?.previewMarketValue ??
    input.offerPreview?.marketDecision.marketValue;
  const production = input.productionMarketPrice;
  const training = input.staffTraining?.paragraphs ?? [];

  if (
    input.reviewStatus === "v2_needs_identity_confirmation" ||
    input.reviewStatus === "v2_ready_for_staff"
  ) {
    return {
      kind: "confirm_version_first",
      title: "Confirm card version first",
      tone: "violet",
      reasonLines: ["Pick the exact printing that matches the photos."],
      actionLine: "Confirm the correct version before accepting any offer.",
    };
  }

  if (input.storeRuleBlock?.doNotBuy) {
    const titles = input.storeRuleBlock.matchedRules;
    return {
      kind: "store_rule_pass",
      title: "Pass — store rule",
      tone: "red",
      reasonLines: titles.map((t) => `Store rule: ${t}`),
      actionLine: "Do not buy per store policy.",
    };
  }

  if (
    (input.reviewStatus === "v2_staff_confirmed_ready" ||
      input.reviewStatus === "v2_staff_confirmed_blocked") &&
    (input.offerPreview?.storeRuleBlocked ||
      input.offerPreview?.recommendedAction === "store_rule_rejected")
  ) {
    const titles =
      input.offerPreview.storeRuleTitles ??
      (input.offerPreview.pricingRuleApplied
        ? [input.offerPreview.pricingRuleApplied]
        : ["Store policy"]);
    return {
      kind: "store_rule_pass",
      title: "Pass — store rule",
      tone: "red",
      reasonLines: titles.map((t) => `Store rule: ${t}`),
      actionLine: "Do not buy per store policy.",
    };
  }

  if (input.reviewStatus === "v2_production_price_warning") {
    return {
      kind: "production_price_warning",
      title: "Needs manager review",
      tone: "red",
      reasonLines: [
        "Production price appears wrong.",
        previewVal != null
          ? `V2 exact-print value is ${money(previewVal)}.`
          : "V2 exact-print value is available.",
        production != null
          ? `Production currently shows ${money(production)}.`
          : "Production may not match this printing.",
      ],
      actionLine: "Manager review production offer before accepting.",
    };
  }

  if (input.reviewStatus === "v2_source_disagreement") {
    return {
      kind: "pricing_source_disagreement",
      title: "Needs manager review",
      tone: "amber",
      reasonLines: [
        "Pricing sources disagree too much.",
        "Do not average values.",
        training[1] ?? "",
      ].filter(Boolean),
      actionLine: "Manager review required.",
    };
  }

  if (input.reviewStatus === "v2_staff_confirmed_ready") {
    const lowConfidence =
      !input.offerPreview ||
      input.offerPreview.marketDecision.confidence === "low" ||
      input.offerPreview.marketDecision.blockers.includes("ebay_sold_unavailable") ||
      input.offerPreview.recommendedAction === "staff_confirmed_preview_ready";
    return {
      kind: lowConfidence ? "ready_low_confidence" : "ready_to_buy",
      title: lowConfidence ? "Ready low confidence" : "Ready to buy",
      tone: "green",
      reasonLines: [
        previewVal != null
          ? `V2 exact card value: ${money(previewVal)}`
          : "V2 preview is ready.",
        lowConfidence ? "Minimum offer floor may apply." : "",
      ].filter(Boolean),
      actionLine: "Proceed according to store policy.",
    };
  }

  if (
    input.reviewStatus === "v2_staff_confirmed_blocked" ||
    input.offerPreview?.eligible === false
  ) {
    return {
      kind: "insufficient_market_data",
      title: "Needs manager review",
      tone: "amber",
      reasonLines: [
        input.offerPreview?.marketDecision.explanation ??
          "Not enough reliable market data for a safe preview.",
      ],
      actionLine: "Manager review required.",
    };
  }

  if (input.reviewStatus === "v2_needs_pricing_review") {
    return {
      kind: "needs_manager_review",
      title: "Needs manager review",
      tone: "amber",
      reasonLines: ["Pricing needs a closer look before accepting."],
      actionLine: "Escalate to manager review.",
    };
  }

  if (input.reviewStatus === "v2_not_ready") {
    return {
      kind: "needs_manager_review",
      title: "Needs manager review",
      tone: "slate",
      reasonLines: ["V2 review is stale or incomplete."],
      actionLine: "Ask a manager to re-run V2 review.",
    };
  }

  return {
    kind: "needs_manager_review",
    title: "Needs manager review",
    tone: "violet",
    reasonLines: ["Review V2 estimate before accepting this offer."],
    actionLine: "Follow store policy for staff review.",
  };
}

/** Queue list helper — minimal fields only. */
export function resolveClerkRecommendationForQueue(input: {
  v2ReviewStatus: V2ReviewStatus;
  productionMarketPrice?: number;
  v2PreviewMarketPrice?: number;
}): ClerkRecommendation {
  const offerPreview: V2OfferPreview | undefined =
    input.v2PreviewMarketPrice != null
      ? ({
          eligible: true,
          previewMarketValue: input.v2PreviewMarketPrice,
          marketDecision: {
            marketValue: input.v2PreviewMarketPrice,
            confidence: "low",
            blockers: [],
          },
        } as unknown as V2OfferPreview)
      : undefined;

  return resolveClerkRecommendation({
    reviewStatus: input.v2ReviewStatus,
    productionMarketPrice: input.productionMarketPrice,
    offerPreview,
  });
}

/** Short label for collapsed card summary and queues. */
export function clerkRecommendationShortTitle(
  recommendation: ClerkRecommendation,
): string {
  return recommendation.title;
}
