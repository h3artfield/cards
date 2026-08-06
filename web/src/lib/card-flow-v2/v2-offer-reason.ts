import type { ScannedCard } from "../types";
import type { CardCandidateBundle, CardFlowV2EvidenceBundle } from "./types";
import type { CardFlowV2MarketBundle, CandidateMarketSnapshot } from "./market/types";
import type { CardFlowV2AuditRecord } from "./audit/types";
import type { V2OfferPreview } from "./offer/types";
import type { V2ReviewStatus } from "./v2-review-status";
import { isV2ProductionPricing } from "./offer/apply-v2-offer-influence";
import { getPrimaryMarketSnapshot } from "./market/promote-staff-confirmed-market";
import { buildStaffTrainingExplanation } from "./staff-training-explanation";
import {
  friendlyBasis,
  friendlyBasisShort,
  friendlyBlocker,
  formatPriceDiffPercent,
} from "./v2-staff-labels";

export type V2OfferReasonSource = {
  label: string;
  value: number;
  used: boolean;
  note?: string;
};

export type V2OfferReasonExplanation = {
  heading: string;
  summary: string;
  marketValue?: number;
  marketSource: string;
  cashOffer?: number;
  tradeOffer?: number;
  offerFormula?: string;
  sourceBreakdown: V2OfferReasonSource[];
  priceMovement?: string;
  paragraphs: string[];
  warnings: string[];
  listContext?: string;
  identityLabel?: string;
  isProductionOffer: boolean;
  blocked: boolean;
};

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function topSuspectLabel(identity?: CardCandidateBundle): string | undefined {
  if (!identity) return undefined;
  const staffId = identity.staffSelection?.suspectId;
  if (staffId) {
    return identity.suspects.find((s) => s.suspectId === staffId)?.label;
  }
  const topId = identity.suspectAssessments[0]?.suspectId;
  if (topId) {
    return identity.suspects.find((s) => s.suspectId === topId)?.label;
  }
  return identity.lockedIdentity?.canonicalName;
}

function describeCompTrend(snap?: CandidateMarketSnapshot): string | undefined {
  if (!snap) return undefined;

  const ebaySold = snap.acceptedComps.filter((a) => a.comp.source === "ebay_sold");
  if (ebaySold.length >= 2) {
    const prices = ebaySold.map((a) => a.comp.price).sort((a, b) => a - b);
    const low = prices[0]!;
    const high = prices[prices.length - 1]!;
    const median = snap.valueMedian;
    if (median != null) {
      return `Recent eBay sold comps (${ebaySold.length}): ${money(low)}–${money(high)}, median ${money(median)}.`;
    }
    return `Recent eBay sold comps (${ebaySold.length}): ${money(low)}–${money(high)}.`;
  }

  if (ebaySold.length === 1) {
    return `One recent eBay sold comp at ${money(ebaySold[0]!.comp.price)}.`;
  }

  const signals = snap.marketOutcome?.pricingSignalDetails ?? [];
  if (signals.length >= 2) {
    const parts = signals.map((s) => `${s.label} ${money(s.price)}`);
    return `Pricing signals: ${parts.join(" · ")}.`;
  }

  return undefined;
}

function describeListContext(identity?: CardCandidateBundle): string | undefined {
  if (!identity) return undefined;

  const parts: string[] = [];
  const insp = identity.mtgListMarkInspection;
  if (insp?.attempted) {
    const mark =
      insp.listMarkVisible === "yes"
        ? "The List fork mark detected"
        : insp.listMarkVisible === "no"
          ? "No List fork mark detected"
          : "List fork mark unclear";
    parts.push(`${mark} (${insp.cropQuality} crop).`);
    if (insp.staffSummary) parts.push(insp.staffSummary);
  }

  const listNotes = identity.candidateGenerationNotes?.filter((n) =>
    /list|plst|origin|trap|fork|the_list/i.test(n),
  );
  if (listNotes?.length) {
    parts.push(listNotes[0]!);
  }

  return parts.length ? parts.join(" ") : undefined;
}

function describeOfferFormula(input: {
  market?: number;
  cash?: number;
  trade?: number;
  pricingRuleApplied?: string;
}): string | undefined {
  if (input.pricingRuleApplied) {
    return `Store rule: ${input.pricingRuleApplied}.`;
  }
  if (input.market != null && input.market > 0 && input.cash != null) {
    const cashPct = Math.round((input.cash / input.market) * 100);
    const tradePart =
      input.trade != null
        ? ` · trade ${Math.round((input.trade / input.market) * 100)}% (${money(input.trade)})`
        : "";
    return `Cash is ${cashPct}% of market (${money(input.cash)})${tradePart}.`;
  }
  return undefined;
}

function resolveDisplayOffers(input: {
  card: ScannedCard;
  preview?: V2OfferPreview;
  staffConfirmed?: boolean;
}): {
  market?: number;
  cash?: number;
  trade?: number;
} {
  const { card, preview } = input;
  const previewMarket =
    preview?.previewMarketValue ?? preview?.marketDecision.marketValue;
  const previewCash = preview?.previewCashOffer;
  const previewTrade = preview?.previewTradeOffer;

  if (input.staffConfirmed && previewMarket != null) {
    return {
      market: previewMarket,
      cash: previewCash ?? card.cashOffer,
      trade: previewTrade ?? card.tradeOffer,
    };
  }

  return {
    market:
      card.marketPrice ??
      previewMarket,
    cash: card.cashOffer ?? previewCash,
    trade: card.tradeOffer ?? previewTrade,
  };
}

/** V2-only buyback rationale — market source, offer math, comps, List context. */
export function buildV2OfferReason(input: {
  card: ScannedCard;
  offerPreview?: V2OfferPreview;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  evidence?: CardFlowV2EvidenceBundle;
  audit?: CardFlowV2AuditRecord;
  reviewStatus?: V2ReviewStatus;
}): V2OfferReasonExplanation | null {
  const preview = input.offerPreview ?? input.card.cardFlowV2OfferPreview;
  if (!preview?.enabled && !input.identity && !input.market) {
    return null;
  }

  const md = preview?.marketDecision;
  const blocked = preview ? !preview.eligible : true;
  const isProductionOffer = isV2ProductionPricing(input.card);
  const staffConfirmed = Boolean(
    input.identity?.staffSelection?.suspectId ??
      input.card.cardFlowV2Identity?.staffSelection?.suspectId,
  );
  const offers = resolveDisplayOffers({
    card: input.card,
    preview,
    staffConfirmed,
  });
  const primarySnap = getPrimaryMarketSnapshot(input.market ?? input.card.cardFlowV2Market);
  const identityLabel = topSuspectLabel(input.identity ?? input.card.cardFlowV2Identity);
  const listContext = describeListContext(input.identity ?? input.card.cardFlowV2Identity);

  const sourceBreakdown: V2OfferReasonSource[] =
    md?.sourceValues.map((s) => ({
      label: s.label,
      value: s.value,
      used: s.used,
      note: s.reason,
    })) ?? [];

  const priceMovement = describeCompTrend(primarySnap);
  const offerFormula = describeOfferFormula({
    market: offers.market,
    cash: offers.cash,
    trade: offers.trade,
    pricingRuleApplied: preview?.pricingRuleApplied,
  });

  const paragraphs: string[] = [];
  const warnings: string[] = [];

  if (identityLabel) {
    paragraphs.push(`Printing under review: ${identityLabel}.`);
  }

  if (md?.explanation) {
    paragraphs.push(md.explanation);
  }

  if (md?.basis && md.basis !== "none") {
    paragraphs.push(`Market basis: ${friendlyBasis(md.basis)}.`);
  }

  if (sourceBreakdown.length > 0) {
    const used = sourceBreakdown.filter((s) => s.used);
    const unused = sourceBreakdown.filter((s) => !s.used);
    if (used.length) {
      paragraphs.push(
        `Sources used: ${used.map((s) => `${s.label} ${money(s.value)}`).join(" · ")}.`,
      );
    }
    if (unused.length) {
      paragraphs.push(
        `Not used: ${unused.map((s) => `${s.label} ${money(s.value)}${s.note ? ` (${s.note})` : ""}`).join(" · ")}.`,
      );
    }
  }

  if (priceMovement) {
    paragraphs.push(priceMovement);
  }

  if (offerFormula && !blocked) {
    paragraphs.push(offerFormula);
  }

  if (
    offers.market != null &&
    preview?.previewMarketValue != null &&
    input.card.marketPrice != null &&
    !isProductionOffer
  ) {
    const diff = formatPriceDiffPercent(input.card.marketPrice, preview.previewMarketValue);
    if (diff) {
      paragraphs.push(
        `V2 market ${money(preview.previewMarketValue)} vs production ${money(input.card.marketPrice)} (${diff}).`,
      );
    }
  }

  const topReasoning =
    input.identity?.suspectAssessments[0]?.reasoning ??
    input.card.cardFlowV2Identity?.suspectAssessments[0]?.reasoning;
  if (topReasoning) {
    paragraphs.push(topReasoning);
  }

  const staffTraining = buildStaffTrainingExplanation({
    card: input.card,
    audit: input.audit ?? input.card.cardFlowV2Audit,
    reviewStatus: input.reviewStatus,
  });
  if (staffTraining) {
    paragraphs.push(...staffTraining.paragraphs);
  }

  for (const w of md?.warnings ?? []) {
    warnings.push(w);
  }
  for (const b of md?.blockers ?? []) {
    warnings.push(friendlyBlocker(b));
  }

  const heading = blocked
    ? "Why pricing needs review"
    : isProductionOffer
      ? "Why we offered this price"
      : "V2 offer rationale";

  const summary = blocked
    ? md?.blockers.length
      ? md.blockers.map((b) => friendlyBlocker(b)).join(". ") + "."
      : "V2 could not produce a confident offer preview."
    : offers.market != null && offers.cash != null
      ? `Market ${money(offers.market)} (${friendlyBasisShort(md?.basis)}) → cash ${money(offers.cash)}${offers.trade != null ? `, trade ${money(offers.trade)}` : ""}.`
      : "V2 market and offer breakdown below.";

  return {
    heading,
    summary,
    marketValue: offers.market,
    marketSource: friendlyBasisShort(md?.basis),
    cashOffer: offers.cash,
    tradeOffer: offers.trade,
    offerFormula,
    sourceBreakdown,
    priceMovement,
    paragraphs: paragraphs.filter(Boolean),
    warnings,
    listContext,
    identityLabel,
    isProductionOffer,
    blocked,
  };
}
