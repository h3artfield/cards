import type { ScannedCard } from "../../types";
import { isCardFlowV2OfferInfluenceEnabled } from "../feature-flag";
import type { V2MarketDecisionBlocker, V2OfferPreview } from "./types";

export type ProductionFieldSnapshot = {
  marketPrice?: number;
  cashOffer?: number;
  tradeOffer?: number;
  status: ScannedCard["status"];
};

function snapshotProductionFields(card: ScannedCard): ProductionFieldSnapshot {
  return {
    marketPrice: card.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    status: card.status,
  };
}

export type V2OfferInfluenceResult = {
  applied: boolean;
  reason?: string;
  card: ScannedCard;
  previousProduction?: ProductionFieldSnapshot;
};

const HARD_BLOCKERS: V2MarketDecisionBlocker[] = [
  "source_disagreement",
  "identity_not_locked_or_confirmed",
  "no_market_data",
];

/** True when card production fields were written from V2 preview. */
export function isV2ProductionPricing(card: ScannedCard): boolean {
  return (
    (card.pricingJson as { source?: string } | undefined)?.source ===
    "v2_offer_influence"
  );
}

/** Guarded policy — apply V2 preview to production only when safe. */
export function canApplyV2OfferInfluence(
  preview?: V2OfferPreview,
): boolean {
  if (!isCardFlowV2OfferInfluenceEnabled()) return false;
  if (!preview?.enabled) return false;
  if (preview.previewMarketValue == null) return false;
  if (
    preview.previewCashOffer == null &&
    preview.previewTradeOffer == null
  ) {
    return false;
  }

  const md = preview.marketDecision;
  if (md.blockers.some((b) => HARD_BLOCKERS.includes(b))) return false;
  if (md.basis === "none" && !preview.eligible) return false;

  if (
    preview.identityBasis !== "staff_confirmed" &&
    preview.identityBasis !== "vision_locked"
  ) {
    return false;
  }

  if (md.blockers.includes("variant_uncertainty")) {
    const resolved =
      preview.variantUncertaintyStatus === "resolved_by_staff_confirmation" ||
      preview.variantUncertaintyStatus === "resolved_by_vision_lock";
    if (!resolved) return false;
  }

  if (
    md.blockers.includes("sports_parallel_uncertainty") ||
    md.blockers.includes("raw_graded_uncertainty") ||
    md.blockers.includes("high_value_requires_stronger_evidence") ||
    md.blockers.includes("manual_review_required")
  ) {
    return false;
  }

  return preview.eligible || preview.previewMarketValue != null;
}

function influenceBlockReason(preview?: V2OfferPreview): string {
  if (!isCardFlowV2OfferInfluenceEnabled()) {
    return "CARD_FLOW_V2_OFFER_INFLUENCE disabled";
  }
  if (!preview?.enabled) return "V2 offer preview missing";
  if (preview.previewMarketValue == null) return "No V2 market value";
  const md = preview.marketDecision;
  if (md.blockers.includes("source_disagreement")) {
    return "Pricing sources disagree — keep V1 until manager review";
  }
  if (md.blockers.includes("identity_not_locked_or_confirmed")) {
    return "Confirm printing before V2 can own the offer";
  }
  if (md.blockers.includes("no_market_data")) {
    return "Insufficient V2 market data";
  }
  if (
    preview.identityBasis !== "staff_confirmed" &&
    preview.identityBasis !== "vision_locked"
  ) {
    return "Identity not locked or staff-confirmed";
  }
  return "V2 preview not eligible for production influence";
}

function resolveStatusAfterInfluence(
  card: ScannedCard,
  preview: V2OfferPreview,
): ScannedCard["status"] {
  if (card.staffDecision === "no") return "do_not_buy";
  if (card.staffDecision === "yes") return "approved";

  if (preview.recommendedAction === "store_rule_rejected") {
    return "do_not_buy";
  }

  const cash = preview.previewCashOffer ?? 0;
  const trade = preview.previewTradeOffer ?? 0;

  if (cash === 0 && trade === 0) {
    return "do_not_buy";
  }

  if (
    preview.recommendedAction === "staff_review_required" ||
    preview.recommendedAction === "manual_price_required"
  ) {
    return "manual_review";
  }

  if (card.status === "manual_review") return "manual_review";
  return "processed";
}

/** Write V2 preview market/cash/trade onto production fields when guarded policy allows. */
export function applyV2OfferInfluenceToCard(
  card: ScannedCard,
): V2OfferInfluenceResult {
  const preview = card.cardFlowV2OfferPreview;
  if (!canApplyV2OfferInfluence(preview)) {
    return {
      applied: false,
      reason: influenceBlockReason(preview),
      card,
    };
  }

  const previousProduction = snapshotProductionFields(card);
  const market = preview!.previewMarketValue!;
  const cash = preview!.previewCashOffer ?? 0;
  const trade = preview!.previewTradeOffer ?? 0;
  const status = resolveStatusAfterInfluence(card, preview!);

  const priorPricing =
    (card.pricingJson as Record<string, unknown> | undefined) ?? {};

  return {
    applied: true,
    previousProduction,
    card: {
      ...card,
      marketPrice: market,
      cashOffer: cash,
      tradeOffer: trade,
      status,
      pricingJson: {
        ...priorPricing,
        source: "v2_offer_influence",
        v2Basis: preview!.marketDecision.basis,
        v2AppliedAt: new Date().toISOString(),
        v2RecommendedAction: preview!.recommendedAction,
        v2PreviousProduction: previousProduction,
      },
    },
  };
}

/** Merge V2 bundles then optionally promote preview → production. */
export function mergeCardWithV2OfferInfluence(
  card: ScannedCard,
  v2Fields: Partial<ScannedCard>,
): V2OfferInfluenceResult {
  return applyV2OfferInfluenceToCard({ ...card, ...v2Fields });
}
