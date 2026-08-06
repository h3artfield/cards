import type {
  CardFlowV2AuditRecord,
  V2AuditIssue,
  V2AuditRiskLevel,
  V2IdentityBasis,
  V2StaffCorrection,
} from "./types";
import {
  compareV2Pricing,
  isLargePriceDisagreement,
  mapLegacyCategoryToV2,
  type AuditBuildInput,
} from "./compare-pricing";
import { getPrimaryMarketSnapshot } from "../market/promote-staff-confirmed-market";
import type { CandidateMarketSnapshot } from "../market/types";
import { detectStaleV2Metadata } from "../version-metadata";

function marketRangeLabel(snap: CandidateMarketSnapshot): string {
  if (snap.valueMedian != null) {
    return `$${snap.valueLow?.toFixed(0) ?? "?"}–$${snap.valueHigh?.toFixed(0) ?? "?"}`;
  }
  return (
    snap.marketOutcome?.summaryLabel ??
    "No accepted sold comps — see source health"
  );
}

function compCounts(market: AuditBuildInput["market"]) {
  const primary = getPrimaryMarketSnapshot(market);
  if (
    market?.mode === "staff_confirmed_identity_market" ||
    market?.selectedSuspectId
  ) {
    if (!primary) return { accepted: 0, rejected: 0, maybe: 0 };
    return {
      accepted: primary.acceptedComps.length,
      rejected: primary.rejectedComps.length,
      maybe: primary.maybeComps.length,
    };
  }

  let accepted = 0;
  let rejected = 0;
  let maybe = 0;
  for (const snap of market?.snapshots ?? []) {
    accepted += snap.acceptedComps.length;
    rejected += snap.rejectedComps.length;
    maybe += snap.maybeComps.length;
  }
  return { accepted, rejected, maybe };
}

function resolveIdentityBasis(input: AuditBuildInput): V2IdentityBasis {
  const identity = input.identity ?? input.card.cardFlowV2Identity;
  const market = input.market ?? input.card.cardFlowV2Market;

  if (
    identity?.staffSelection?.suspectId ||
    market?.mode === "staff_confirmed_identity_market" ||
    market?.staffConfirmedPromotion
  ) {
    return "staff_confirmed";
  }
  if (identity?.lockedIdentity?.locked) {
    return "vision_locked";
  }
  if ((identity?.suspects.length ?? 0) > 0) {
    return "unlocked_candidates";
  }
  return "no_candidates";
}

function detectIssues(input: AuditBuildInput): V2AuditIssue[] {
  const issues: V2AuditIssue[] = [];
  const identity = input.identity ?? input.card.cardFlowV2Identity;
  const market = input.market ?? input.card.cardFlowV2Market;
  const { card, evidence } = input;
  const locked = identity?.lockedIdentity;
  const comparison = compareV2Pricing({
    card,
    identity,
    market,
  });

  if (!identity?.suspects.length) {
    issues.push("no_candidates");
  }

  if (locked && !locked.locked) {
    issues.push("identity_not_locked");
    if (
      locked.lockStatus === "not_locked_variant_uncertainty" ||
      locked.unresolvedVariantRisks.length > 0
    ) {
      issues.push("variant_uncertainty");
    }
  }

  const { accepted, rejected } = compCounts(market);
  if (accepted === 0) {
    issues.push("no_accepted_comps");
  }

  if (
    card.marketPrice != null &&
    card.marketPrice > 0 &&
    locked &&
    !locked.locked
  ) {
    issues.push("current_price_without_locked_identity");
  }

  if (rejected >= 5 && accepted <= 2) {
    issues.push("v2_rejected_many_current_like_comps");
  }

  if (isLargePriceDisagreement(comparison)) {
    issues.push("large_price_disagreement");
  }

  const identityMsg = locked?.staffMessage.toLowerCase() ?? "";
  if (
    identityMsg.includes("slab") &&
    (identityMsg.includes("mismatch") || identityMsg.includes("manual review"))
  ) {
    issues.push("slab_label_mismatch");
  }

  if (
    locked?.unresolvedVariantRisks.some((r) =>
      /raw|graded|slab|psa|cgc|bgs/i.test(r),
    )
  ) {
    issues.push("raw_graded_mismatch_risk");
  }

  if (
    locked?.unresolvedVariantRisks.some((r) =>
      /foil|parallel|reverse|finish|prizm/i.test(r),
    ) ||
    evidence?.imageEvidence.identificationMode ===
      "continue_with_variant_uncertainty"
  ) {
    issues.push("parallel_or_foil_uncertainty");
  }

  const pcWarning = market?.warnings.some((w) =>
    /pricecharting|tier|manual-only|excluded/i.test(w),
  );
  const snapWarning = market?.snapshots.some((s) =>
    s.warnings.some((w) => /pricecharting|tier|manual-only|excluded/i.test(w)),
  );
  if (pcWarning || snapWarning) {
    issues.push("pricecharting_tier_warning");
  }

  const primarySnapshot = getPrimaryMarketSnapshot(market);
  const pcIdentityRejected =
    primarySnapshot?.priceChartingMapping?.reasonIfSkipped ===
      "pricecharting_product_identity_mismatch" ||
    primarySnapshot?.rejectedComps.some((a) =>
      a.rejectionReasons.includes("pricecharting_product_identity_mismatch"),
    );
  const productionPrice = card.marketPrice;
  const pricingSource = (card.pricingJson as { source?: string } | undefined)?.source ?? "";
  if (
    pcIdentityRejected &&
    productionPrice != null &&
    productionPrice > 15 &&
    /pricecharting|price charting/i.test(pricingSource)
  ) {
    issues.push("v1_possible_wrong_pricecharting_mapping");
  } else if (
    pcIdentityRejected &&
    productionPrice != null &&
    primarySnapshot?.valueMedian != null &&
    productionPrice > primarySnapshot.valueMedian * 3
  ) {
    issues.push("v1_possible_wrong_pricecharting_mapping");
  }

  if (
    issues.includes("identity_not_locked") ||
    issues.includes("variant_uncertainty") ||
    issues.includes("large_price_disagreement") ||
    issues.includes("no_accepted_comps")
  ) {
    issues.push("staff_review_needed");
  }

  const stale = detectStaleV2Metadata(card.cardFlowV2VersionMetadata);
  if (stale.stale) {
    issues.push("stale_v2_reprocess_recommended");
  }

  return [...new Set(issues)];
}

function scoreRisk(
  issues: V2AuditIssue[],
  comparison: ReturnType<typeof compareV2Pricing>,
  input: AuditBuildInput,
): V2AuditRiskLevel {
  if (
    issues.includes("slab_label_mismatch") ||
    issues.includes("raw_graded_mismatch_risk")
  ) {
    return "critical";
  }

  if (
    issues.includes("large_price_disagreement") &&
    (comparison.absoluteDifference ?? 0) > 100
  ) {
    return "critical";
  }

  if (
    issues.includes("current_price_without_locked_identity") &&
    issues.includes("variant_uncertainty")
  ) {
    return "critical";
  }

  if (
    issues.includes("identity_not_locked") ||
    issues.includes("variant_uncertainty") ||
    issues.includes("no_accepted_comps") ||
    issues.includes("parallel_or_foil_uncertainty") ||
    issues.includes("pricecharting_tier_warning") ||
    issues.includes("v1_possible_wrong_pricecharting_mapping") ||
    issues.includes("large_price_disagreement")
  ) {
    return "high";
  }

  const locked = input.identity?.lockedIdentity.locked;
  const { accepted } = compCounts(input.market);
  const v2Conf = input.market?.snapshots[0]?.confidence;

  if (
    locked &&
    v2Conf === "medium" &&
    accepted >= 1 &&
    accepted <= 2
  ) {
    return "medium";
  }

  if (
    comparison.agreement !== "matches_current" &&
    comparison.percentDifference != null &&
    comparison.percentDifference > 0.2 &&
    comparison.percentDifference <= 0.5
  ) {
    return "medium";
  }

  const maybeCount = compCounts(input.market).maybe;
  if (maybeCount >= 3) return "medium";

  if (
    locked &&
    accepted >= 3 &&
    comparison.agreement === "matches_current"
  ) {
    const nonBlocking = new Set([
      "no_candidates",
      "staff_review_needed",
      "stale_v2_reprocess_recommended",
    ]);
    const blocking = issues.filter((i) => !nonBlocking.has(i));
    if (blocking.length === 0) return "low";
  }

  if (issues.includes("staff_review_needed")) return "high";

  const substantiveIssues = issues.filter(
    (i) =>
      i !== "stale_v2_reprocess_recommended" && i !== "no_candidates",
  );
  return substantiveIssues.length ? "medium" : "low";
}

function buildStaffAction(
  issues: V2AuditIssue[],
  risk: V2AuditRiskLevel,
  input: AuditBuildInput,
): string {
  const lines: string[] = [`V2 Audit: ${risk.charAt(0).toUpperCase()}${risk.slice(1)} Risk`];
  const market = input.market ?? input.card.cardFlowV2Market;
  const primarySnapshot = getPrimaryMarketSnapshot(market);

  const comparison = compareV2Pricing({
    card: input.card,
    identity: input.identity,
    market: input.market,
  });

  if (comparison.currentMarketPrice != null) {
    lines.push(`Current price: $${comparison.currentMarketPrice.toFixed(2)}`);
  }
  if (comparison.v2ValueMedian != null) {
    lines.push(
      `V2 shadow value: $${comparison.v2ValueLow?.toFixed(0) ?? "?"}–$${comparison.v2ValueHigh?.toFixed(0) ?? "?"}`,
    );
  }
  if (comparison.percentDifference != null && comparison.agreement !== "not_comparable") {
    const pct = (comparison.percentDifference * 100).toFixed(0);
    lines.push(`Agreement: ${comparison.agreement.replace(/_/g, " ")} (${pct}% diff)`);
  } else if (comparison.agreement === "not_comparable") {
    lines.push("Agreement: not comparable — multiple candidate snapshots");
  }

  if (issues.length) {
    lines.push("", "Issues:", ...issues.map((i) => `- ${i.replace(/_/g, " ")}`));
  }

  if (issues.includes("v1_possible_wrong_pricecharting_mapping")) {
    const mismatch = primarySnapshot?.priceChartingMapping?.identityMismatch;
    lines.push(
      "",
      "Production price appears based on a mismatched PriceCharting product:",
      mismatch
        ? `expected ${mismatch.expectedSetCode ?? "?"} #${mismatch.expectedCollectorNumber ?? "?"}, got "${mismatch.priceChartingTitle}".`
        : "V2 rejected PriceCharting due to collector/set identity mismatch.",
    );
  }

  if (issues.includes("stale_v2_reprocess_recommended")) {
    lines.push(
      "",
      detectStaleV2Metadata(input.card.cardFlowV2VersionMetadata).message ??
        "V2 result may be stale. Re-run shadow V2 reprocess.",
    );
  }

  if (input.market?.mode === "candidate_market_comparison") {
    lines.push("", "Candidate values:");
    input.market.snapshots.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.marketProductName}: ${marketRangeLabel(s)}`);
    });
    lines.push("", "Do not rely on current price until staff confirms variant.");
  } else if (input.market?.mode === "staff_confirmed_identity_market") {
    const snap = getPrimaryMarketSnapshot(input.market);
    const promo = input.market.staffConfirmedPromotion;
    lines.push("", "Staff-confirmed market:");
    if (snap) {
      lines.push(`${snap.marketProductName}: ${marketRangeLabel(snap)}`);
    }
    if (promo) {
      lines.push(
        promo.promotedFromSnapshot
          ? "Promoted prepared snapshot (no full re-search on confirm)."
          : "Market refetched on confirmation.",
      );
      if (promo.marketRefetchRequired) {
        lines.push(
          `Refresh recommended: ${promo.marketRefetchReason?.replace(/_/g, " ") ?? "quality flag"}.`,
        );
      }
    }
  } else if (issues.includes("no_accepted_comps")) {
    lines.push("", "Staff should inspect comps before approving offer.");
  } else if (risk === "low") {
    lines.push("", "V2 and current pricing appear aligned — optional spot check.");
  } else {
    lines.push("", "Staff should inspect accepted/rejected comps before approving offer.");
  }

  return lines.join("\n");
}

export function buildCardFlowV2AuditRecord(
  input: AuditBuildInput,
): CardFlowV2AuditRecord {
  const { card, identity, market, evidence } = input;
  const locked = identity?.lockedIdentity;
  const comparison = compareV2Pricing({ card, identity, market });
  const issues = detectIssues(input);
  const riskLevel = scoreRisk(issues, comparison, input);
  const counts = compCounts(market);

  const category = mapLegacyCategoryToV2(
    card.category,
    identity?.category ?? evidence?.categoryClassification.category,
  );

  const staffCorrection: V2StaffCorrection | undefined =
    input.existingStaffCorrection ??
    card.cardFlowV2Audit?.staffCorrection ??
    undefined;

  const v2IdentityBasis = resolveIdentityBasis(input);
  const primarySnapshot = getPrimaryMarketSnapshot(market);

  return {
    cardId: card.id,
    orderId: card.orderId,
    category,
    currentCardName: card.detectedName,
    currentMarketPrice: card.marketPrice,
    currentCashOffer: card.cashOffer,
    currentTradeOffer: card.tradeOffer,
    currentStatus: card.status,
    v2Locked: locked?.locked ?? false,
    v2LockStatus: locked?.lockStatus ?? "not_locked_no_candidates",
    v2IdentityConfidence: locked?.confidence ?? 0,
    v2IdentityBasis,
    v2MarketMode: market?.mode ?? "no_market_run",
    v2MarketConfidence: primarySnapshot?.confidence ?? "none",
    topV2MarketProductName:
      primarySnapshot?.marketProductName ?? locked?.marketProductName,
    priceComparison: comparison,
    acceptedCompCount: counts.accepted,
    rejectedCompCount: counts.rejected,
    maybeCompCount: counts.maybe,
    issues,
    riskLevel,
    recommendedStaffAction: buildStaffAction(issues, riskLevel, input),
    staffCorrection,
    v2StaffMarketPromotion: market?.staffConfirmedPromotion,
    createdAt: new Date().toISOString(),
  };
}
