import type { V2OfferPreview } from "./offer/types";
import type { V2ReviewStatus } from "./v2-review-status";
import type { ScannedCard, VisionResult } from "../types";
import { cardDisplayName } from "../processing/card-display-name";
import { friendlyBasisShort } from "./v2-staff-labels";
import {
  conditionOffersForEffectiveGrade,
} from "./staff-edit-condition-ladder";
import { getStaffSelectedSuspect } from "./staff-suspect-selection";
import {
  staffSuspectUsesTcgplayerJapanCatalog,
  suspectBlocksTcgplayerPricing,
} from "./pokemon-japanese-fallback";
import { getPrimaryMarketSnapshot } from "./market/promote-staff-confirmed-market";
import type { CandidateMarketSnapshot } from "./market/types";

/** PriceCharting-only reference — ignores stale English TCG signals on JP cards. */
export function priceChartingReferenceFromSnapshot(
  snapshot?: CandidateMarketSnapshot,
): number | undefined {
  if (!snapshot) return undefined;

  const compPrices = snapshot.acceptedComps
    .filter((a) => a.comp.source === "pricecharting")
    .map((a) => a.comp.price)
    .filter((p) => p > 0);
  if (compPrices.length) {
    const sorted = [...compPrices].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  }

  const signal = snapshot.marketOutcome?.pricingSignalDetails?.find(
    (d) => d.source === "pricecharting",
  );
  return signal?.price != null && signal.price > 0 ? signal.price : undefined;
}

/** Clerk UI uses V2 preview after staff confirms printing — hide V1 sync drift warnings. */
export function clerkUsesV2AsAuthoritative(input: {
  versionConfirmed: boolean;
  reviewStatus: V2ReviewStatus;
}): boolean {
  return (
    input.versionConfirmed && input.reviewStatus === "v2_staff_confirmed_ready"
  );
}

export function clerkShouldShowStaleBuybackWarning(input: {
  card: ScannedCard;
  v2Market?: number;
  versionConfirmed: boolean;
  reviewStatus: V2ReviewStatus;
}): boolean {
  if (clerkUsesV2AsAuthoritative(input)) return false;
  return resaleAnalysisLikelyStale(input.card, input.v2Market);
}

export function clerkShouldShowStoredOfferMismatch(input: {
  storedOfferMismatch: boolean;
  versionConfirmed: boolean;
  reviewStatus: V2ReviewStatus;
}): boolean {
  if (clerkUsesV2AsAuthoritative(input)) return false;
  return input.storedOfferMismatch;
}

/** Store condition label for clerk UI (prices are tied to this grade). */
export function formatStoreCondition(card: ScannedCard): string | null {
  const cond = card.conditionOverride?.condition ?? card.conditionEstimate;
  if (!cond) return null;

  const report = card.conditionReport;
  if (report?.slabCertified) {
    const slab = report.estimatedGrade?.trim();
    return slab ? `${cond} · ${slab}` : cond;
  }
  if (report?.estimatedGrade) {
    const range = report.gradeRange ? ` ${report.gradeRange}` : "";
    return `${cond} · scan ${report.estimatedGrade}${range}`;
  }
  return cond;
}

/** True when V1 buyback report likely predates identity/pricing refresh. */
export function resaleAnalysisLikelyStale(
  card: ScannedCard,
  v2Market?: number,
): boolean {
  const analysis = card.resaleAnalysis;
  if (!analysis) return false;

  const blob = `${analysis.summary ?? ""} ${analysis.liquidityNotes ?? ""}`.toLowerCase();
  const name = cardDisplayName(card).toLowerCase();
  const tokens = name.split(/[\s\-/]+/).filter((t) => t.length > 2);

  if (tokens.length > 0 && blob.length > 24) {
    const primary = tokens[0]!;
    if (!blob.includes(primary)) {
      return true;
    }
  }

  if (v2Market != null && card.marketPrice != null && card.marketPrice > 0) {
    const storedRatio = card.marketPrice / v2Market;
    if (storedRatio < 0.5 || storedRatio > 2) {
      return true;
    }
  }

  if (v2Market != null && v2Market >= 8) {
    const legacy =
      analysis.latestSaleEstimate ??
      (analysis.suggestedCashOffer != null
        ? analysis.suggestedCashOffer * 2
        : undefined);
    if (legacy != null && legacy > 0) {
      const ratio = legacy / v2Market;
      if (ratio < 0.25 || ratio > 4) {
        return true;
      }
    }
  }

  return false;
}

export type ClerkDisplayOffers = {
  market?: number;
  cash?: number;
  trade?: number;
  /** Market shown from V2 decision but cash/trade not yet computed in preview. */
  marketIsEstimateOnly: boolean;
  /** Stored card offer fields disagree with confirmed-printing V2 preview. */
  storedOfferMismatch: boolean;
};

/** True when clerk UI can show market / cash / trade rows. */
export function clerkHasDisplayPricing(offers: ClerkDisplayOffers): boolean {
  return offers.market != null || offers.cash != null || offers.trade != null;
}

/** Source label for clerk pricing row — preview basis or production v2Basis. */
export function resolveClerkMarketSource(input: {
  card: ScannedCard;
  offerPreview?: V2OfferPreview;
  versionConfirmed: boolean;
}): string {
  if (input.versionConfirmed && conditionOffersForEffectiveGrade(input.card)) {
    const staffSuspect = input.card.cardFlowV2Identity
      ? getStaffSelectedSuspect(input.card.cardFlowV2Identity)
      : undefined;
    if (
      !suspectBlocksTcgplayerPricing(staffSuspect) &&
      !staffSuspectUsesTcgplayerJapanCatalog(staffSuspect)
    ) {
      return friendlyBasisShort("tcgplayer_low_listing");
    }
  }
  const previewBasis = input.offerPreview?.marketDecision.basis;
  if (input.versionConfirmed && previewBasis) {
    return friendlyBasisShort(previewBasis);
  }
  const pricingJson = input.card.pricingJson as
    | { v2Basis?: string; source?: string }
    | undefined;
  if (pricingJson?.v2Basis) {
    return friendlyBasisShort(pricingJson.v2Basis);
  }
  if (previewBasis) {
    return friendlyBasisShort(previewBasis);
  }
  const src = pricingJson?.source;
  if (src === "v2_offer_influence") return "V2 offer";
  if (src === "v2_market_only") return "V2 market";
  return "—";
}

/** Market / cash / trade for running totals — matches clerk card face. */
export function resolveClerkRunningOfferAmounts(card: ScannedCard): {
  market: number;
  cash: number;
  trade: number;
} {
  const versionConfirmed = Boolean(
    card.cardFlowV2Identity?.staffSelection?.suspectId,
  );
  const offers = resolveClerkDisplayOffers({
    card,
    offerPreview: card.cardFlowV2OfferPreview,
    versionConfirmed,
  });

  const staffSuspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  const blocksTcg = suspectBlocksTcgplayerPricing(staffSuspect);
  const usesJapanCatalog = staffSuspectUsesTcgplayerJapanCatalog(staffSuspect);

  return {
    market: offers.market ?? (blocksTcg || usesJapanCatalog ? 0 : card.marketPrice ?? 0),
    cash: offers.cash ?? (blocksTcg || usesJapanCatalog ? 0 : card.cashOffer ?? 0),
    trade: offers.trade ?? (blocksTcg || usesJapanCatalog ? 0 : card.tradeOffer ?? 0),
  };
}

/** Coherent clerk-facing market/cash/trade — avoids mixing V2 market with stale stored cash. */
export function resolveClerkDisplayOffers(input: {
  card: ScannedCard;
  offerPreview?: V2OfferPreview;
  versionConfirmed: boolean;
}): ClerkDisplayOffers {
  const preview = input.offerPreview;
  const md = preview?.marketDecision;
  const previewMarket = preview?.previewMarketValue ?? md?.marketValue;
  const previewCash = preview?.previewCashOffer;
  const previewTrade = preview?.previewTradeOffer;
  const hasPreviewOffers = previewCash != null || previewTrade != null;
  const staffSuspect = input.card.cardFlowV2Identity
    ? getStaffSelectedSuspect(input.card.cardFlowV2Identity)
    : undefined;
  const blocksTcgPricing = suspectBlocksTcgplayerPricing(staffSuspect);
  const usesJapanCatalog = staffSuspectUsesTcgplayerJapanCatalog(staffSuspect);

  if (input.versionConfirmed && (blocksTcgPricing || usesJapanCatalog)) {
    if (previewMarket != null && md?.usableForOfferPreview !== false) {
      return {
        market: previewMarket,
        cash: previewCash ?? input.card.cashOffer,
        trade: previewTrade ?? input.card.tradeOffer,
        marketIsEstimateOnly: !hasPreviewOffers,
        storedOfferMismatch: false,
      };
    }

    const snapshot = getPrimaryMarketSnapshot(input.card.cardFlowV2Market);
    const pcReference = priceChartingReferenceFromSnapshot(snapshot);
    if (pcReference != null) {
      return {
        market: pcReference,
        cash: undefined,
        trade: undefined,
        marketIsEstimateOnly: true,
        storedOfferMismatch: false,
      };
    }

    const shadowMedian = snapshot?.valueMedian;
    const pricingMethod = snapshot?.pricingMethod;
    const shadowFromPc =
      shadowMedian != null &&
      pricingMethod != null &&
      !pricingMethod.includes("tcgplayer");

    if (shadowFromPc) {
      return {
        market: shadowMedian,
        cash: undefined,
        trade: undefined,
        marketIsEstimateOnly: true,
        storedOfferMismatch: false,
      };
    }

    return {
      market: undefined,
      cash: undefined,
      trade: undefined,
      marketIsEstimateOnly: true,
      storedOfferMismatch: false,
    };
  }

  if (input.versionConfirmed) {
    if (!blocksTcgPricing && !usesJapanCatalog) {
      const row = conditionOffersForEffectiveGrade(input.card);
      if (row) {
        const previewMarket = preview?.previewMarketValue ?? md?.marketValue;
        const storedOfferMismatch =
          (input.card.marketPrice != null &&
            Math.abs(input.card.marketPrice - row.marketValue) > 0.05) ||
          (previewMarket != null &&
            Math.abs(previewMarket - row.marketValue) > 0.05);

        return {
          market: row.marketValue,
          cash: row.cashOffer,
          trade: row.tradeOffer,
          marketIsEstimateOnly: false,
          storedOfferMismatch,
        };
      }
    }
  }

  if (input.versionConfirmed && previewMarket != null) {
    const staffEditedAfterPreview =
      input.card.lastStaffEdit?.changedAt &&
      preview?.createdAt &&
      new Date(input.card.lastStaffEdit.changedAt) >
        new Date(preview.createdAt);

    if (
      staffEditedAfterPreview &&
      input.card.marketPrice != null &&
      input.card.marketPrice > 0
    ) {
      return {
        market: input.card.marketPrice,
        cash: input.card.cashOffer ?? previewCash,
        trade: input.card.tradeOffer ?? previewTrade,
        marketIsEstimateOnly: false,
        storedOfferMismatch: false,
      };
    }

    const storedOfferMismatch =
      (input.card.marketPrice != null &&
        Math.abs(input.card.marketPrice - previewMarket) > 0.05) ||
      (previewCash != null &&
        input.card.cashOffer != null &&
        Math.abs(input.card.cashOffer - previewCash) > 0.05);

    return {
      market: preview?.previewMarketValue ?? previewMarket,
      cash: previewCash ?? input.card.cashOffer,
      trade: previewTrade ?? input.card.tradeOffer,
      marketIsEstimateOnly: !hasPreviewOffers,
      storedOfferMismatch,
    };
  }

  return {
    market: input.card.marketPrice ?? previewMarket,
    cash: input.card.cashOffer ?? previewCash,
    trade: input.card.tradeOffer ?? previewTrade,
    marketIsEstimateOnly: false,
    storedOfferMismatch: false,
  };
}

export type ClerkCardInsightResult = {
  lines: string[];
  staleBuybackReport: boolean;
};

/** Condition + buyback notes for Reason panel (deduped, stale-safe). */
export function buildClerkCardInsightLines(
  card: ScannedCard,
  opts?: {
    v2Market?: number;
    includeCondition?: boolean;
    versionConfirmed?: boolean;
    reviewStatus?: V2ReviewStatus;
  },
): ClerkCardInsightResult {
  const lines: string[] = [];
  const stale =
    opts?.reviewStatus != null && opts?.versionConfirmed != null
      ? clerkShouldShowStaleBuybackWarning({
          card,
          v2Market: opts.v2Market,
          versionConfirmed: opts.versionConfirmed,
          reviewStatus: opts.reviewStatus,
        })
      : resaleAnalysisLikelyStale(card, opts?.v2Market);
  const analysis = card.resaleAnalysis;

  if (opts?.includeCondition !== false) {
    const cond = formatStoreCondition(card);
    if (cond) {
      lines.push(`Condition: ${cond}`);
    }
  }

  if (!analysis || stale) {
    return { lines, staleBuybackReport: stale && Boolean(analysis) };
  }

  if (analysis.summary?.trim()) {
    lines.push(analysis.summary.trim());
  }

  const liquidity = analysis.liquidityNotes?.trim();
  const freq = analysis.salesFrequency;
  const blob = lines.join(" ").toLowerCase();

  if (liquidity) {
    lines.push(liquidity);
  } else if (freq && freq !== "unknown") {
    lines.push(
      freq === "low"
        ? "Slow mover — lower liquidity"
        : `Sales frequency: ${freq}`,
    );
  }

  if (
    freq &&
    freq !== "unknown" &&
    freq !== "low" &&
    !blob.includes(freq) &&
    !blob.includes("sales frequency")
  ) {
    lines.push(`Sales frequency: ${freq}`);
  }

  for (const risk of analysis.risks ?? []) {
    if (lines.length >= 8) break;
    const r = risk.trim();
    if (!r) continue;
    if (lines.some((l) => l.includes(r) || r.includes(l.slice(0, 24)))) continue;
    lines.push(r);
  }

  return { lines, staleBuybackReport: false };
}
