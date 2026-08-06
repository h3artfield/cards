import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "../types";
import type {
  CandidateMarketSnapshot,
  CardFlowV2MarketBundle,
} from "../market/types";
import { getPrimaryMarketSnapshot } from "../market/promote-staff-confirmed-market";
import { tcgConditionLowForGrade } from "../market/tcg-condition-pricing";
import type { ConditionEstimate } from "../../types";
import {
  applyHighValueGuard,
  isSportsCategory,
  isTcgCategory,
  percentDifference,
  resolveSourceDisagreement,
  SOURCE_REVIEW_DISAGREEMENT_PCT,
  slabPreviewAllowed,
  sportsPreviewAllowed,
} from "./source-confidence-policy";
import type {
  V2MarketDecisionBlocker,
  V2MarketDecisionConfidence,
  V2MarketValueBasis,
  V2MarketValueDecision,
} from "./types";
import type { VariantUncertaintyStatus } from "../types";
import {
  historicalVariantUncertaintyNote,
  resolveVariantUncertaintyStatus,
  variantUncertaintyBlocksPreview,
} from "../variant-uncertainty";
import { applyRiftboundPreviewGuards } from "./riftbound-preview-policy";
import {
  scanDerivedPricingStatus,
} from "../pokemon-japanese-fallback";
import { getStaffSelectedSuspect } from "../staff-suspect-selection";

export type MarketValueDecisionInput = {
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  evidence?: CardFlowV2EvidenceBundle;
  itemType?: string;
  /** Card condition — when set, prefer TCG lowest listing for this grade. */
  condition?: ConditionEstimate;
};

function resolveIdentityBasis(
  identity?: CardCandidateBundle,
  market?: CardFlowV2MarketBundle,
): "vision_locked" | "staff_confirmed" | "unlocked_candidates" | "no_candidates" {
  if (
    identity?.staffSelection?.suspectId ||
    market?.mode === "staff_confirmed_identity_market" ||
    market?.staffConfirmedPromotion
  ) {
    return "staff_confirmed";
  }
  if (identity?.lockedIdentity?.locked) return "vision_locked";
  if ((identity?.suspects.length ?? 0) > 0) return "unlocked_candidates";
  return "no_candidates";
}

function identityEligibleForPreview(
  basis: ReturnType<typeof resolveIdentityBasis>,
): boolean {
  return basis === "vision_locked" || basis === "staff_confirmed";
}

function soldCompMedian(snapshot: CandidateMarketSnapshot): number | undefined {
  const prices = snapshot.acceptedComps
    .filter((a) => a.comp.source === "ebay_sold" && a.comp.price > 0)
    .map((a) => a.comp.price);
  if (!prices.length) return undefined;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const REFERENCE_30D_NOTE = "30-day average (reference only)";

function resolvePriceChartingSignal(snapshot: CandidateMarketSnapshot): {
  label: string;
  value: number;
} | undefined {
  const detail = snapshot.marketOutcome?.pricingSignalDetails?.find(
    (d) => d.source === "pricecharting",
  );
  if (detail?.price != null && detail.price > 0) {
    return { label: detail.label, value: detail.price };
  }
  const loose = snapshot.priceChartingMapping?.loosePrice;
  if (loose != null && loose > 0) {
    return {
      label: snapshot.priceChartingMapping?.tierSelected ?? "Ungraded",
      value: loose,
    };
  }
  return undefined;
}

/** TCG lowest listing (primary) and market average (reference) for the matched finish tier. */
export function resolveTcgPriceSignals(snapshot: CandidateMarketSnapshot): {
  variant?: string;
  low?: number;
  market?: number;
} {
  const mapping = snapshot.tcgplayerMapping;
  if (mapping) {
    const variant =
      mapping.selectedVariantName ?? mapping.finishMatched ?? undefined;
    const low =
      mapping.lowPrice != null && mapping.lowPrice > 0
        ? mapping.lowPrice
        : undefined;
    const market =
      mapping.marketPrice != null && mapping.marketPrice > 0
        ? mapping.marketPrice
        : undefined;
    if (low != null || market != null) {
      return { variant, low, market };
    }
  }

  const detail = snapshot.marketOutcome?.pricingSignalDetails?.find(
    (d) => d.source === "tcgplayer",
  );
  if (detail?.price != null && detail.price > 0) {
    return { variant: detail.label, market: detail.price };
  }

  return {};
}

function resolveTcgPriceSignalsForCondition(
  snapshot: CandidateMarketSnapshot,
  condition?: ConditionEstimate,
): ReturnType<typeof resolveTcgPriceSignals> & {
  tcgConditionApplied?: ConditionEstimate;
} {
  const base = resolveTcgPriceSignals(snapshot);
  if (!condition) return base;

  const conditionLow = tcgConditionLowForGrade(
    snapshot.tcgplayerMapping,
    condition,
  );
  if (conditionLow == null) return base;

  return {
    ...base,
    low: conditionLow,
    tcgConditionApplied: condition,
  };
}

function appendTcgLowListingDecision(input: {
  tcgPrices: ReturnType<typeof resolveTcgPriceSignals> & {
    tcgConditionApplied?: ConditionEstimate;
  };
  pc?: { label: string; value: number };
  sourceValues: V2MarketValueDecision["sourceValues"];
  warnings: string[];
  category?: import("../types").CardCategory;
}): {
  basis: V2MarketValueBasis;
  marketValue: number;
  valueLow: number;
  valueHigh: number;
  confidence: V2MarketDecisionConfidence;
  tcgConditionApplied?: ConditionEstimate;
} {
  const low = input.tcgPrices.low!;
  const variant = input.tcgPrices.variant ?? "tcgplayer";
  const market = input.tcgPrices.market;
  const grade = input.tcgPrices.tcgConditionApplied;

  input.sourceValues.push({
    source: "tcgplayer",
    label: grade
      ? `${variant} (${grade} lowest listing)`
      : `${variant} (lowest listing)`,
    value: low,
    used: true,
  });

  if (market != null && Math.abs(market - low) > 0.001) {
    input.sourceValues.push({
      source: "tcgplayer",
      label: `${variant} (market avg 30d)`,
      value: market,
      used: false,
      reason: REFERENCE_30D_NOTE,
    });
  }

  if (input.pc) {
    input.sourceValues.push({
      source: "pricecharting",
      label: input.pc.label,
      value: input.pc.value,
      used: false,
      reason: REFERENCE_30D_NOTE,
    });
    if (market != null) {
      const pct = percentDifference(market, input.pc.value);
      if (pct >= SOURCE_REVIEW_DISAGREEMENT_PCT) {
        input.warnings.push(
          `TCG market avg ($${market.toFixed(2)}) and PriceCharting ($${input.pc.value.toFixed(2)}) differ ${Math.round(pct * 100)}% — offer uses TCG lowest listing $${low.toFixed(2)}.`,
        );
      }
    }
  }

  input.warnings.push(
    grade
      ? `Offer based on TCGplayer lowest ${grade} listing for this finish tier.`
      : "Offer based on TCGplayer lowest listing for this finish tier.",
  );

  return {
    basis: "tcgplayer_low_listing",
    marketValue: low,
    valueLow: low,
    valueHigh: market ?? low,
    confidence: isTcgCategory(input.category) ? "medium" : "low",
    tcgConditionApplied: grade,
  };
}

function ebaySoldBlocked(snapshot: CandidateMarketSnapshot): boolean {
  const h = snapshot.sourceHealth?.find((s) => s.source === "ebay_sold");
  return (
    h?.fatalError === "authorization_or_scope_failure" ||
    h?.httpStatus === 403
  );
}

function hasVariantUncertainty(input: MarketValueDecisionInput): boolean {
  const status = resolveVariantUncertaintyStatus({
    identity: input.identity,
    evidence: input.evidence,
  });
  return variantUncertaintyBlocksPreview(status);
}

export function getVariantUncertaintyStatus(
  input: MarketValueDecisionInput,
): VariantUncertaintyStatus {
  return resolveVariantUncertaintyStatus({
    identity: input.identity,
    evidence: input.evidence,
  });
}

function hasSportsParallelUncertainty(input: MarketValueDecisionInput): boolean {
  const category = input.identity?.category;
  if (!isSportsCategory(category)) return false;
  const risks = input.identity?.lockedIdentity.unresolvedVariantRisks ?? [];
  const tags = input.identity?.suspects[0]?.variantTags ?? [];
  const parallelHints = /prizm|parallel|silver|gold|holo|variant|rookie/i;
  return (
    risks.some((r) => parallelHints.test(r)) ||
    tags.some((t) => parallelHints.test(t)) ||
    hasVariantUncertainty(input)
  );
}

export function buildMarketValueDecision(
  input: MarketValueDecisionInput,
): V2MarketValueDecision {
  const blockers: V2MarketDecisionBlocker[] = [];
  const warnings: string[] = [];
  const sourceValues: V2MarketValueDecision["sourceValues"] = [];

  const identityBasis = resolveIdentityBasis(input.identity, input.market);
  const category = input.identity?.category;
  const staffConfirmed = identityBasis === "staff_confirmed";
  const identityConfirmed = identityEligibleForPreview(identityBasis);
  const staffSuspect = input.identity
    ? getStaffSelectedSuspect(input.identity)
    : undefined;

  if (
    staffSuspect?.catalogSource === "scan_derived_fallback" &&
    scanDerivedPricingStatus(staffSuspect) !== "pricecharting_exact" &&
    scanDerivedPricingStatus(staffSuspect) !== "tcgplayer_japan_exact"
  ) {
    return {
      usableForOfferPreview: false,
      basis: "none",
      confidence: "none",
      blockers: ["manual_review_required", "no_market_data"],
      warnings: [
        "Scan-derived identity without exact PriceCharting match — automatic pricing blocked.",
      ],
      sourceValues: [],
      explanation:
        "Offer preview blocked: scan-derived fallback requires manual price or exact Japanese PriceCharting match.",
    };
  }

  if (!identityConfirmed) {
    return {
      usableForOfferPreview: false,
      basis: "none",
      confidence: "none",
      blockers: ["identity_not_locked_or_confirmed"],
      warnings: [
        `Identity basis is ${identityBasis.replace(/_/g, " ")} — preview requires vision-locked or staff-confirmed identity.`,
      ],
      sourceValues: [],
      explanation:
        "Offer preview blocked: identity is not vision-locked or staff-confirmed.",
    };
  }

  const snapshot = getPrimaryMarketSnapshot(input.market);
  if (!snapshot) {
    return {
      usableForOfferPreview: false,
      basis: "none",
      confidence: "none",
      blockers: ["no_market_data"],
      warnings: ["No V2 market snapshot available."],
      sourceValues: [],
      explanation: "Offer preview blocked: no market snapshot.",
    };
  }

  if (ebaySoldBlocked(snapshot)) {
    warnings.push(
      "eBay sold unavailable (403 authorization/scope failure) — not treated as missing comps.",
    );
    if (!blockers.includes("ebay_sold_unavailable")) {
      blockers.push("ebay_sold_unavailable");
    }
  }

  const soldMedian = soldCompMedian(snapshot);
  const soldCount = snapshot.acceptedComps.filter(
    (a) => a.comp.source === "ebay_sold",
  ).length;
  const pricingSignals = snapshot.marketOutcome?.pricingSignalDetails?.filter(
    (d) => d.source === "scryfall_print_price",
  ) ?? [];
  const tcgPrices = resolveTcgPriceSignalsForCondition(snapshot, input.condition);
  const pcSignal = resolvePriceChartingSignal(snapshot);
  const tcgConditionApplied = tcgPrices.tcgConditionApplied;
  const tcgMarketOnly =
    tcgPrices.market != null && tcgPrices.low == null
      ? tcgPrices.market
      : undefined;

  if (soldMedian != null) {
    sourceValues.push({
      source: "ebay_sold",
      label: `${soldCount} sold comp(s)`,
      value: soldMedian,
      used: false,
    });
  }

  const isGraded =
    input.itemType === "graded" ||
    snapshot.searchPlan.gradeContext === "graded";
  const gradeContextKnown =
    isGraded &&
    Boolean(snapshot.searchPlan.gradingCompany && snapshot.searchPlan.grade);
  const rawPcTier =
    snapshot.priceChartingMapping?.tierSelected?.toLowerCase().includes(
      "ungraded",
    ) ?? false;

  const slabCheck = slabPreviewAllowed({
    isGraded,
    gradeContextKnown,
    rawTierUsed: isGraded && rawPcTier,
  });
  if (!slabCheck.allowed && slabCheck.blocker) {
    blockers.push(slabCheck.blocker);
    if (slabCheck.warning) warnings.push(slabCheck.warning);
  }

  if (hasVariantUncertainty(input)) {
    blockers.push("variant_uncertainty");
    warnings.push("Unresolved variant uncertainty on identity.");
  } else {
    const hist = historicalVariantUncertaintyNote(input.identity);
    if (hist) warnings.push(hist);
  }

  const sportsParallel = hasSportsParallelUncertainty(input);
  const sportsCheck = sportsPreviewAllowed({
    staffConfirmed,
    parallelUnresolved: sportsParallel,
    hasSoldComps: soldCount > 0,
    hasReliablePricingSignal:
      tcgPrices.low != null ||
      tcgPrices.market != null ||
      pcSignal != null,
    priceChartingOnly: Boolean(pcSignal && !tcgPrices.low && !tcgPrices.market && soldCount === 0),
  });

  if (isSportsCategory(category) && !sportsCheck.allowed) {
    if (sportsCheck.blocker) blockers.push(sportsCheck.blocker);
    if (sportsCheck.warning) warnings.push(sportsCheck.warning);
  }

  let basis: V2MarketValueBasis = "none";
  let marketValue: number | undefined;
  let valueLow = snapshot.valueLow;
  let valueHigh = snapshot.valueHigh;
  let confidence: V2MarketDecisionConfidence = "none";
  let usable = true;
  let decisionTcgCondition: ConditionEstimate | undefined = tcgConditionApplied;

  if (snapshot.pricingMethod === "active_listings_only_sanity_check") {
    blockers.push("active_only");
    warnings.push("Only eBay active listings available — not sold value.");
    return {
      usableForOfferPreview: false,
      basis: "active_sanity_only",
      confidence: "none",
      blockers: [...new Set(blockers)],
      warnings,
      sourceValues,
      explanation:
        "Offer preview blocked: active listings only (sanity check, not sold comps).",
    };
  }

  if (tcgPrices.low != null && tcgPrices.low > 0) {
    const decided = appendTcgLowListingDecision({
      tcgPrices,
      pc: pcSignal,
      sourceValues,
      warnings,
      category,
    });
    basis = decided.basis;
    marketValue = decided.marketValue;
    valueLow = decided.valueLow;
    valueHigh = decided.valueHigh;
    confidence = decided.confidence;
    decisionTcgCondition = decided.tcgConditionApplied ?? decisionTcgCondition;
    if (soldMedian != null && soldCount >= 1) {
      warnings.push(
        `${soldCount} eBay sold comp(s) available (reference only) — offer uses TCGplayer lowest listing.`,
      );
    }
  } else if (soldMedian != null && soldCount >= 1) {
    basis = "sold_comp_median";
    marketValue = soldMedian;
    confidence =
      soldCount >= 3 && identityConfirmed && !hasVariantUncertainty(input)
        ? "high"
        : soldCount >= 2
          ? "medium"
          : "low";
    sourceValues.forEach((s) => {
      if (s.source === "ebay_sold") s.used = true;
    });
  } else if (tcgMarketOnly != null && pcSignal) {
    const resolution = resolveSourceDisagreement(tcgMarketOnly, pcSignal.value);
    const variant = tcgPrices.variant ?? "tcgplayer";
    if (resolution.action === "blend") {
      basis = "tcgplayer_pricecharting_blend";
      marketValue = (tcgMarketOnly + pcSignal.value) / 2;
      valueLow = Math.min(tcgMarketOnly, pcSignal.value);
      valueHigh = Math.max(tcgMarketOnly, pcSignal.value);
      confidence = isTcgCategory(category) ? "medium" : "low";
      sourceValues.push(
        {
          source: "tcgplayer",
          label: `${variant} (market avg 30d)`,
          value: tcgMarketOnly,
          used: true,
        },
        {
          source: "pricecharting",
          label: pcSignal.label,
          value: pcSignal.value,
          used: true,
        },
      );
      warnings.push("No TCG lowest listing — blended 30-day averages.");
    } else if (resolution.action === "prefer_tcg") {
      basis = "tcgplayer_market";
      marketValue = tcgMarketOnly;
      valueLow = tcgMarketOnly;
      valueHigh = tcgMarketOnly;
      confidence = "low";
      sourceValues.push(
        {
          source: "tcgplayer",
          label: `${variant} (market avg 30d)`,
          value: tcgMarketOnly,
          used: true,
        },
        {
          source: "pricecharting",
          label: pcSignal.label,
          value: pcSignal.value,
          used: false,
          reason: REFERENCE_30D_NOTE,
        },
      );
      warnings.push(
        `No TCG lowest listing — using TCG market avg $${tcgMarketOnly.toFixed(2)} (${Math.round(resolution.pctDiff * 100)}% from PriceCharting).`,
      );
    } else {
      blockers.push("source_disagreement");
      basis = "none";
      marketValue = undefined;
      confidence = "low";
      usable = false;
      sourceValues.push(
        {
          source: "tcgplayer",
          label: `${variant} (market avg 30d)`,
          value: tcgMarketOnly,
          used: false,
          reason: "excluded due to source disagreement",
        },
        {
          source: "pricecharting",
          label: pcSignal.label,
          value: pcSignal.value,
          used: false,
          reason: "excluded due to source disagreement",
        },
      );
      warnings.push(
        `TCG market avg $${tcgMarketOnly.toFixed(2)} vs PriceCharting $${pcSignal.value.toFixed(2)} — disagreement exceeds 50%; staff review required.`,
      );
    }
  } else if (tcgMarketOnly != null) {
    const variant = tcgPrices.variant ?? "tcgplayer";
    basis = "tcgplayer_market";
    marketValue = tcgMarketOnly;
    confidence = "low";
    sourceValues.push({
      source: "tcgplayer",
      label: `${variant} (market avg 30d)`,
      value: tcgMarketOnly,
      used: true,
    });
    warnings.push(
      "TCGplayer market average only — no lowest listing available for this tier.",
    );
  } else if (pcSignal) {
    basis = "pricecharting_value";
    marketValue = pcSignal.value;
    confidence = "low";
    sourceValues.push({
      source: "pricecharting",
      label: pcSignal.label,
      value: pcSignal.value,
      used: true,
      reason: REFERENCE_30D_NOTE,
    });
    warnings.push("PriceCharting 30-day average — no TCGplayer listing data for this tier.");
    if (isSportsCategory(category) && !staffConfirmed) {
      usable = false;
      if (!blockers.includes("sports_parallel_uncertainty")) {
        blockers.push("sports_parallel_uncertainty");
      }
    }
  } else {
    const scryfall = pricingSignals[0];
    if (scryfall) {
      basis = "scryfall_print_price";
      marketValue = scryfall.price;
      confidence = "low";
      sourceValues.push({
        source: "scryfall_print_price",
        label: scryfall.label,
        value: scryfall.price,
        used: true,
      });
      warnings.push(
        "Scryfall exact-print price — pricing signal, not a sold comp.",
      );
    }
  }

  if (
    marketValue == null &&
    (snapshot.pricingMethod === "no_market_data" || snapshot.confidence === "none")
  ) {
    blockers.push("no_market_data");
    usable = false;
  }

  if (marketValue == null || marketValue <= 0) {
    if (!blockers.includes("no_market_data")) blockers.push("no_market_data");
    return {
      usableForOfferPreview: false,
      basis: "none",
      confidence: "none",
      blockers: [...new Set(blockers)],
      warnings,
      sourceValues,
      explanation: "Offer preview blocked: no usable market value from V2 sources.",
    };
  }

  if (isSportsCategory(category) && !sportsCheck.allowed) {
    usable = false;
  }

  const hv = applyHighValueGuard({
    marketValue,
    confidence,
    blockers,
    warnings,
    identityConfirmed,
    soldCompCount: soldCount,
    pricingSignalCount:
      (tcgPrices.low != null ? 1 : 0) +
      (tcgPrices.market != null ? 1 : 0) +
      (pcSignal != null ? 1 : 0) +
      pricingSignals.length,
    signalsAgree:
      tcgMarketOnly != null && pcSignal
        ? resolveSourceDisagreement(tcgMarketOnly, pcSignal.value).action ===
          "blend"
        : soldCount > 0,
    hasVariantUncertainty: hasVariantUncertainty(input),
  });
  confidence = hv.confidence;
  if (!hv.usableForOfferPreview) usable = false;

  const finalBlockers = [...new Set([...blockers, ...hv.blockers])];
  if (blockers.includes("source_disagreement")) usable = false;

  const explanationParts: string[] = [];
  explanationParts.push(
    `Identity: ${identityBasis.replace(/_/g, " ")}.`,
  );
  explanationParts.push(`Basis: ${basis.replace(/_/g, " ")}.`);
  explanationParts.push(`Market value: $${marketValue.toFixed(2)}.`);
  explanationParts.push(`Confidence: ${confidence}.`);
  if (finalBlockers.length) {
    explanationParts.push(
      `Blockers: ${finalBlockers.map((b) => b.replace(/_/g, " ")).join(", ")}.`,
    );
  }

  const selectedSuspect =
    input.identity?.staffSelection?.suspectId
      ? input.identity.suspects.find(
          (s) => s.suspectId === input.identity!.staffSelection!.suspectId,
        )
      : input.identity?.lockedIdentity.locked
        ? input.identity.suspects.find(
            (s) => s.suspectId === input.identity!.lockedIdentity.winningSuspectId,
          )
        : input.identity?.suspects[0];

  const rbGuard =
    category === "riftbound"
      ? applyRiftboundPreviewGuards({
          suspect: selectedSuspect,
          marketValue,
          blockers: finalBlockers,
          warnings: [...warnings, ...hv.warnings],
        })
      : null;

  const mergedBlockers = rbGuard?.blockers ?? finalBlockers;
  const mergedWarnings = rbGuard
    ? [...new Set(rbGuard.warnings)]
    : [...new Set([...warnings, ...hv.warnings])];
  let finalUsable =
    usable &&
    !mergedBlockers.includes("source_disagreement") &&
    (rbGuard?.usableForOfferPreview ?? true);

  return {
    usableForOfferPreview: finalUsable,
    basis,
    tcgConditionApplied: decisionTcgCondition,
    marketValue,
    valueLow,
    valueHigh,
    confidence,
    blockers: mergedBlockers,
    warnings: mergedWarnings,
    sourceValues,
    explanation: explanationParts.join(" "),
  };
}

export { resolveIdentityBasis };
