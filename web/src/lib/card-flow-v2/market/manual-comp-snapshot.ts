import type { CardFlowV2MarketBundle, CandidateMarketSnapshot } from "./types";
import {
  filterManualCompsForSuspect,
  manualCompToAssessment,
  type ManualMarketComp,
} from "./manual-market-comp";
import { getPrimaryMarketSnapshot } from "./promote-staff-confirmed-market";

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mergeManualIntoSnapshot(
  snapshot: CandidateMarketSnapshot,
  manualComps: ManualMarketComp[],
): CandidateMarketSnapshot {
  if (!manualComps.length) return snapshot;

  const acceptedManual = manualComps.filter((c) => c.accepted);
  const rejectedManual = manualComps.filter((c) => !c.accepted);

  const manualAcceptedAssessments = acceptedManual.map(manualCompToAssessment);
  const manualRejectedAssessments = rejectedManual.map(manualCompToAssessment);

  const withoutPriorManual = snapshot.compAssessments.filter(
    (a) =>
      a.comp.source !== "manual" &&
      !(a.comp.rawData as { manualCompId?: string } | undefined)?.manualCompId,
  );

  const compAssessments = [
    ...withoutPriorManual,
    ...manualAcceptedAssessments,
    ...manualRejectedAssessments,
  ];

  const withoutPriorManualAccepted = snapshot.acceptedComps.filter(
    (a) => a.comp.source !== "manual",
  );
  const withoutPriorManualRejected = snapshot.rejectedComps.filter(
    (a) =>
      a.comp.source !== "manual" ||
      manualRejectedAssessments.some(
        (m) =>
          (m.comp.rawData as { manualCompId?: string }).manualCompId ===
          (a.comp.rawData as { manualCompId?: string }).manualCompId,
      ),
  );

  const acceptedComps = [
    ...withoutPriorManualAccepted,
    ...manualAcceptedAssessments,
  ];
  const rejectedComps = [
    ...withoutPriorManualRejected.filter((a) => a.comp.source !== "manual"),
    ...manualRejectedAssessments,
  ];

  const soldPrices = acceptedComps
    .filter(
      (a) =>
        a.comp.source === "ebay_sold" ||
        (a.comp.source === "manual" &&
          (a.comp.rawData as { manualSource?: string }).manualSource?.includes(
            "ebay",
          )),
    )
    .map((a) => a.comp.totalPrice ?? a.comp.price)
    .filter((p) => p > 0);

  const valueMedian = soldPrices.length ? median(soldPrices) : snapshot.valueMedian;
  const sorted = soldPrices.length ? [...soldPrices].sort((a, b) => a - b) : [];

  const warnings = [...snapshot.warnings];
  if (acceptedManual.length) {
    warnings.push(
      `${acceptedManual.length} human-reviewed manual comp(s) included in snapshot.`,
    );
  }

  let confidence = snapshot.confidence;
  let pricingMethod = snapshot.pricingMethod;
  if (soldPrices.length >= 2 && valueMedian != null) {
    confidence =
      soldPrices.length >= 3
        ? "medium"
        : confidence === "none"
          ? "low"
          : confidence;
    if (pricingMethod === "active_listings_only_sanity_check") {
      pricingMethod = "sold_comp_median_with_manual";
    } else if (pricingMethod === "no_market_data") {
      pricingMethod = "manual_sold_comp_median";
    }
  }

  return {
    ...snapshot,
    compAssessments,
    acceptedComps,
    rejectedComps,
    valueMedian,
    valueLow: sorted[0] ?? snapshot.valueLow,
    valueHigh: sorted[sorted.length - 1] ?? snapshot.valueHigh,
    confidence,
    pricingMethod,
    warnings,
  };
}

export function applyManualCompsToMarketBundle(
  market: CardFlowV2MarketBundle | undefined,
  manualComps: ManualMarketComp[] | undefined,
  suspectId?: string,
): CardFlowV2MarketBundle | undefined {
  if (!market || !manualComps?.length) return market;

  const relevant = filterManualCompsForSuspect(manualComps, suspectId);
  if (!relevant.length) return market;

  const snapshots = market.snapshots.map((snap) => {
    const sid = snap.suspectId;
    const compsForSnap = filterManualCompsForSuspect(relevant, sid);
    if (!compsForSnap.length && suspectId && sid !== suspectId) {
      return snap;
    }
    const toApply = compsForSnap.length ? compsForSnap : !sid ? relevant : [];
    if (!toApply.length) return snap;
    return mergeManualIntoSnapshot(snap, toApply);
  });

  return { ...market, snapshots };
}

export function getPrimarySnapshotWithManualComps(input: {
  market?: CardFlowV2MarketBundle;
  manualComps?: ManualMarketComp[];
  suspectId?: string;
}): CandidateMarketSnapshot | undefined {
  const market = applyManualCompsToMarketBundle(
    input.market,
    input.manualComps,
    input.suspectId,
  );
  return getPrimaryMarketSnapshot(market);
}
