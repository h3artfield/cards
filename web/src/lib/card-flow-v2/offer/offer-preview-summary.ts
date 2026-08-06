import type { V2MarketDecisionBlocker } from "./types";
import type { V2OfferPreview } from "./types";
import { HIGH_VALUE_THRESHOLD } from "./source-confidence-policy";

export type V2OfferPreviewSummary = {
  eligibleCount: number;
  blockedCount: number;
  topBlockers: Array<{ blocker: V2MarketDecisionBlocker; count: number }>;
  previewMatchesCurrentCount: number;
  previewDisagreesCount: number;
  avgCashDifference?: number;
  avgTradeDifference?: number;
  highValueBlockedCount: number;
  sourceDisagreementBlockedCount: number;
};

function previewAgreesWithCurrent(preview: V2OfferPreview): boolean | undefined {
  const previewVal = preview.previewMarketValue;
  const currentVal = preview.currentMarketPrice;
  if (previewVal == null || currentVal == null || currentVal <= 0) return undefined;
  const diff = Math.abs(previewVal - currentVal) / Math.max(previewVal, currentVal);
  return diff <= 0.2;
}

export function summarizeOfferPreviews(
  previews: V2OfferPreview[],
): V2OfferPreviewSummary {
  const blockerCounts = new Map<V2MarketDecisionBlocker, number>();
  let eligibleCount = 0;
  let blockedCount = 0;
  let previewMatchesCurrentCount = 0;
  let previewDisagreesCount = 0;
  let highValueBlockedCount = 0;
  let sourceDisagreementBlockedCount = 0;
  const cashDiffs: number[] = [];
  const tradeDiffs: number[] = [];

  for (const preview of previews) {
    if (preview.eligible) {
      eligibleCount++;
    } else {
      blockedCount++;
    }

    for (const blocker of preview.marketDecision.blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }

    if (preview.marketDecision.blockers.includes("source_disagreement")) {
      sourceDisagreementBlockedCount++;
    }

    const mv = preview.marketDecision.marketValue;
    if (
      !preview.eligible &&
      mv != null &&
      mv >= HIGH_VALUE_THRESHOLD
    ) {
      highValueBlockedCount++;
    }

    const agrees = previewAgreesWithCurrent(preview);
    if (agrees === true) previewMatchesCurrentCount++;
    else if (agrees === false) previewDisagreesCount++;

    if (preview.cashDifference != null) cashDiffs.push(preview.cashDifference);
    if (preview.tradeDifference != null) tradeDiffs.push(preview.tradeDifference);
  }

  const topBlockers = [...blockerCounts.entries()]
    .map(([blocker, count]) => ({ blocker, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    eligibleCount,
    blockedCount,
    topBlockers,
    previewMatchesCurrentCount,
    previewDisagreesCount,
    avgCashDifference:
      cashDiffs.length > 0
        ? cashDiffs.reduce((s, v) => s + v, 0) / cashDiffs.length
        : undefined,
    avgTradeDifference:
      tradeDiffs.length > 0
        ? tradeDiffs.reduce((s, v) => s + v, 0) / tradeDiffs.length
        : undefined,
    highValueBlockedCount,
    sourceDisagreementBlockedCount,
  };
}

export function printOfferPreviewSummary(summary: V2OfferPreviewSummary): void {
  console.log("\nOffer preview:");
  console.log(`  eligible: ${summary.eligibleCount}`);
  console.log(`  blocked: ${summary.blockedCount}`);
  if (summary.topBlockers.length) {
    console.log("\nTop blockers:");
    for (const { blocker, count } of summary.topBlockers) {
      console.log(`  ${blocker}: ${count}`);
    }
  }
  if (summary.previewMatchesCurrentCount || summary.previewDisagreesCount) {
    console.log(
      `\nPreview vs current market — agrees (±20%): ${summary.previewMatchesCurrentCount}, disagrees: ${summary.previewDisagreesCount}`,
    );
  }
  if (summary.avgCashDifference != null) {
    console.log(
      `Avg preview cash difference: $${summary.avgCashDifference.toFixed(2)}`,
    );
  }
  if (summary.avgTradeDifference != null) {
    console.log(
      `Avg preview trade difference: $${summary.avgTradeDifference.toFixed(2)}`,
    );
  }
  if (summary.highValueBlockedCount) {
    console.log(`High-value blocked: ${summary.highValueBlockedCount}`);
  }
  if (summary.sourceDisagreementBlockedCount) {
    console.log(
      `Source disagreement blocked: ${summary.sourceDisagreementBlockedCount}`,
    );
  }
}
