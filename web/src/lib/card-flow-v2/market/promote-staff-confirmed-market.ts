import type { CardSuspect } from "../types";
import type {
  CandidateMarketSnapshot,
  CardFlowV2MarketBundle,
  MarketRefetchReason,
  StaffConfirmedMarketPromotion,
} from "./types";
import { buildSuspectSearchPlan } from "./search-plan-builder";
import { buildCandidateMarketSnapshot } from "./value-calculator";

/** Prepared candidate snapshots are reusable within this window. */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export function findSnapshotForSuspect(
  market: CardFlowV2MarketBundle | undefined,
  suspectId: string,
): CandidateMarketSnapshot | undefined {
  return market?.snapshots.find((s) => s.suspectId === suspectId);
}

function snapshotIdentityMatches(
  snapshot: CandidateMarketSnapshot,
  suspect: CardSuspect,
): boolean {
  if (snapshot.suspectId !== suspect.suspectId) return false;
  const plan = snapshot.searchPlan;
  const finish = plan.identityFinish ?? plan.requiredTerms.find((t) =>
    /foil|holo|reverse|nonfoil|normal/i.test(t),
  );
  if (finish && suspect.finish && finish !== suspect.finish) return false;
  const name = plan.requiredTerms[0];
  if (name && suspect.canonicalName && name !== suspect.canonicalName) {
    return false;
  }
  return true;
}

export function evaluateSnapshotReuse(input: {
  snapshot?: CandidateMarketSnapshot;
  suspect: CardSuspect;
  marketCreatedAt: string;
  now?: Date;
}): {
  canPromote: boolean;
  promotedFromSnapshot: boolean;
  marketRefetchRequired: boolean;
  marketRefetchReason?: MarketRefetchReason;
} {
  const now = input.now ?? new Date();
  const { snapshot, suspect, marketCreatedAt } = input;

  if (!snapshot) {
    return {
      canPromote: false,
      promotedFromSnapshot: false,
      marketRefetchRequired: true,
      marketRefetchReason: "snapshot_missing",
    };
  }

  if (!snapshotIdentityMatches(snapshot, suspect)) {
    return {
      canPromote: false,
      promotedFromSnapshot: false,
      marketRefetchRequired: true,
      marketRefetchReason: "snapshot_missing",
    };
  }

  const snapshotAt = snapshot.createdAt ?? marketCreatedAt;
  const ageMs = now.getTime() - new Date(snapshotAt).getTime();
  const stale = ageMs > SNAPSHOT_TTL_MS;

  const hasAccepted = snapshot.acceptedComps.length > 0;
  const hasPricingSignals =
    (snapshot.marketOutcome?.pricingSignals ?? 0) > 0 ||
    snapshot.tcgplayerMapping?.marketPrice != null ||
    snapshot.priceChartingMapping?.loosePrice != null;
  const clearNoComp =
    !hasAccepted &&
    !hasPricingSignals &&
    (snapshot.pricingMethod === "no_market_data" ||
      snapshot.pricingMethod === "active_listings_only_sanity_check" ||
      snapshot.confidence === "none");

  let marketRefetchRequired = false;
  let marketRefetchReason: MarketRefetchReason | undefined;

  if (stale) {
    marketRefetchRequired = true;
    marketRefetchReason = "snapshot_stale";
  } else if (!hasAccepted && !clearNoComp && !hasPricingSignals) {
    marketRefetchRequired = true;
    marketRefetchReason = "no_accepted_comps";
  } else if (
    snapshot.confidence === "none" ||
    snapshot.confidence === "low"
  ) {
    marketRefetchRequired = true;
    marketRefetchReason = "low_confidence";
  }

  return {
    canPromote: true,
    promotedFromSnapshot: true,
    marketRefetchRequired,
    marketRefetchReason,
  };
}

export async function promoteStaffConfirmedMarket(input: {
  market: CardFlowV2MarketBundle;
  suspect: CardSuspect;
  confirmedBy?: string;
  manualRefresh?: boolean;
  now?: Date;
}): Promise<{
  market: CardFlowV2MarketBundle;
  promotion: StaffConfirmedMarketPromotion;
}> {
  const confirmedAt = (input.now ?? new Date()).toISOString();
  const snapshot = findSnapshotForSuspect(input.market, input.suspect.suspectId);

  if (input.manualRefresh) {
    const refetched = await buildCandidateMarketSnapshot(
      buildSuspectSearchPlan(input.suspect),
    );
    const snapshots = input.market.snapshots.map((s) =>
      s.suspectId === input.suspect.suspectId ? refetched : s,
    );
    if (!snapshots.some((s) => s.suspectId === input.suspect.suspectId)) {
      snapshots.push(refetched);
    }

    const promotion: StaffConfirmedMarketPromotion = {
      confirmedSuspectId: input.suspect.suspectId,
      promotedFromSnapshot: false,
      marketRefetchRequired: false,
      marketRefetchReason: "manual_refresh_requested",
      confirmedAt,
      confirmedBy: input.confirmedBy,
    };

    return {
      market: buildConfirmedBundle(input.market, snapshots, input.suspect, promotion),
      promotion,
    };
  }

  const reuse = evaluateSnapshotReuse({
    snapshot,
    suspect: input.suspect,
    marketCreatedAt: input.market.createdAt,
    now: input.now,
  });

  const needsRefetch =
    reuse.marketRefetchRequired ||
    !reuse.canPromote;

  if (needsRefetch) {
    const refetched = await buildCandidateMarketSnapshot(
      buildSuspectSearchPlan(input.suspect),
    );
    const refetchedWithReason = {
      ...refetched,
      marketSnapshotReason: "staff_confirmed_selected" as const,
    };
    const snapshots = input.market.snapshots.map((s) =>
      s.suspectId === input.suspect.suspectId ? refetchedWithReason : s,
    );
    if (!snapshots.some((s) => s.suspectId === input.suspect.suspectId)) {
      snapshots.push(refetchedWithReason);
    }

    const promotion: StaffConfirmedMarketPromotion = {
      confirmedSuspectId: input.suspect.suspectId,
      promotedFromSnapshot: false,
      promotedSnapshotId: refetchedWithReason.suspectId,
      marketRefetchRequired: false,
      marketRefetchReason: reuse.marketRefetchReason ?? "snapshot_missing",
      confirmedAt,
      confirmedBy: input.confirmedBy,
    };

    return {
      market: buildConfirmedBundle(input.market, snapshots, input.suspect, promotion),
      promotion,
    };
  }

  const promotion: StaffConfirmedMarketPromotion = {
    confirmedSuspectId: input.suspect.suspectId,
    promotedFromSnapshot: true,
    promotedSnapshotId: snapshot!.suspectId,
    marketRefetchRequired: reuse.marketRefetchRequired,
    marketRefetchReason: reuse.marketRefetchReason,
    confirmedAt,
    confirmedBy: input.confirmedBy,
  };

  return {
    market: buildConfirmedBundle(
      input.market,
      input.market.snapshots,
      input.suspect,
      promotion,
    ),
    promotion,
  };
}

/** Reprocess path — promote existing prepared snapshot without refetch. */
export function promotePreparedSnapshotForStaffConfirmation(input: {
  market: CardFlowV2MarketBundle;
  suspect: CardSuspect;
  confirmedBy?: string;
  now?: Date;
}): {
  market: CardFlowV2MarketBundle;
  promotion: StaffConfirmedMarketPromotion;
} | undefined {
  const snapshot = findSnapshotForSuspect(input.market, input.suspect.suspectId);
  if (!snapshot) return undefined;

  const confirmedAt = (input.now ?? new Date()).toISOString();
  const promotion: StaffConfirmedMarketPromotion = {
    confirmedSuspectId: input.suspect.suspectId,
    promotedFromSnapshot: true,
    promotedSnapshotId: snapshot.suspectId,
    marketRefetchRequired: false,
    confirmedAt,
    confirmedBy: input.confirmedBy,
  };

  return {
    market: buildConfirmedBundle(
      input.market,
      input.market.snapshots,
      input.suspect,
      promotion,
    ),
    promotion,
  };
}

function buildConfirmedBundle(
  prior: CardFlowV2MarketBundle,
  snapshots: CandidateMarketSnapshot[],
  suspect: CardSuspect,
  promotion: StaffConfirmedMarketPromotion,
): CardFlowV2MarketBundle {
  const selected = snapshots.find((s) => s.suspectId === suspect.suspectId);
  const warnings = [...prior.warnings];
  if (promotion.promotedFromSnapshot) {
    warnings.push(
      "Staff confirmed — promoted prepared candidate market snapshot (no full re-search).",
    );
  } else {
    warnings.push("Staff confirmed — market snapshot refetched for selected suspect.");
  }
  if (promotion.marketRefetchRequired && promotion.marketRefetchReason) {
    warnings.push(
      `Snapshot reuse flagged: ${promotion.marketRefetchReason.replace(/_/g, " ")}.`,
    );
  }

  return {
    ...prior,
    mode: "staff_confirmed_identity_market",
    identitySource: "staff_confirmed",
    selectedSuspectId: suspect.suspectId,
    staffConfirmedPromotion: promotion,
    snapshots,
    recommendedStaffAction: buildConfirmedStaffAction(suspect, selected, promotion),
    warnings: [...new Set(warnings)],
  };
}

function buildConfirmedStaffAction(
  suspect: CardSuspect,
  snapshot: CandidateMarketSnapshot | undefined,
  promotion: StaffConfirmedMarketPromotion,
): string {
  const lines = [
    "V2 Market: Staff-Confirmed Identity",
    `Selected: ${suspect.label}`,
    promotion.promotedFromSnapshot
      ? "Source: promoted prepared candidate snapshot"
      : "Source: refetched on confirmation",
  ];
  if (snapshot?.valueMedian != null) {
    lines.push(
      `Shadow value: $${snapshot.valueLow?.toFixed(0) ?? "?"}–$${snapshot.valueHigh?.toFixed(0) ?? "?"} (median $${snapshot.valueMedian.toFixed(2)})`,
    );
    lines.push(
      `Accepted comps: ${snapshot.acceptedComps.length} · Confidence: ${snapshot.confidence}`,
    );
  }
  if (promotion.marketRefetchRequired) {
    lines.push(
      `Note: consider refreshing market data (${promotion.marketRefetchReason?.replace(/_/g, " ") ?? "quality flag"}).`,
    );
  }
  return lines.join("\n");
}

export function clearStaffConfirmedMarket(
  market: CardFlowV2MarketBundle,
): CardFlowV2MarketBundle {
  if (market.mode !== "staff_confirmed_identity_market") {
    return market;
  }
  return {
    ...market,
    mode: "candidate_market_comparison",
    identitySource: undefined,
    selectedSuspectId: undefined,
    staffConfirmedPromotion: undefined,
    recommendedStaffAction: market.recommendedStaffAction.replace(
      /^V2 Market: Staff-Confirmed Identity[\s\S]*/,
      "V2 Market: Candidate Comparison — staff confirmation cleared.",
    ),
  };
}

export function getPrimaryMarketSnapshot(
  market?: CardFlowV2MarketBundle,
): CandidateMarketSnapshot | undefined {
  if (!market?.snapshots.length) return undefined;
  if (market.selectedSuspectId) {
    return (
      market.snapshots.find((s) => s.suspectId === market.selectedSuspectId) ??
      market.snapshots[0]
    );
  }
  return market.snapshots[0];
}
