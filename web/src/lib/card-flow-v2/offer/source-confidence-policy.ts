import type { CardCategory } from "../types";
import type {
  V2MarketDecisionBlocker,
  V2MarketDecisionConfidence,
} from "./types";

/** Within this band TCG + PriceCharting are blended. */
export const SIGNAL_AGREEMENT_PCT = 0.25;
/** Above blend band but below this — prefer TCGplayer (conservative buy side). */
export const SOURCE_REVIEW_DISAGREEMENT_PCT = 0.5;

export type SourceDisagreementResolution =
  | { action: "blend"; pctDiff: number }
  | { action: "prefer_tcg"; pctDiff: number }
  | { action: "review"; pctDiff: number };

/** How to resolve TCGplayer vs PriceCharting when they diverge. */
export function resolveSourceDisagreement(
  tcgValue: number,
  pcValue: number,
): SourceDisagreementResolution {
  const pctDiff = percentDifference(tcgValue, pcValue);
  if (pctDiff <= SIGNAL_AGREEMENT_PCT) {
    return { action: "blend", pctDiff };
  }
  if (pctDiff < SOURCE_REVIEW_DISAGREEMENT_PCT) {
    return { action: "prefer_tcg", pctDiff };
  }
  return { action: "review", pctDiff };
}

export const HIGH_VALUE_THRESHOLD = 25;
export const VERY_HIGH_VALUE_THRESHOLD = 100;
export const PREVIEW_ONLY_VALUE_THRESHOLD = 250;

const TCG_CATEGORIES = new Set<CardCategory>([
  "pokemon",
  "mtg",
  "yugioh",
  "lorcana",
  "onepiece",
  "riftbound",
]);

export function percentDifference(a: number, b: number): number {
  const hi = Math.max(a, b);
  if (hi <= 0) return 0;
  return Math.abs(a - b) / hi;
}

export function signalsAgreeWithin(a: number, b: number, pct = SIGNAL_AGREEMENT_PCT): boolean {
  return percentDifference(a, b) <= pct;
}

export function isTcgCategory(category?: CardCategory): boolean {
  return category != null && TCG_CATEGORIES.has(category);
}

export function isSportsCategory(category?: CardCategory): boolean {
  return category === "sports";
}

export function downgradeConfidence(
  current: V2MarketDecisionConfidence,
  floor: V2MarketDecisionConfidence = "low",
): V2MarketDecisionConfidence {
  const order: V2MarketDecisionConfidence[] = ["high", "medium", "low", "none"];
  const curIdx = order.indexOf(current);
  const floorIdx = order.indexOf(floor);
  return order[Math.max(curIdx, floorIdx)] ?? "none";
}

export function applyHighValueGuard(input: {
  marketValue: number;
  confidence: V2MarketDecisionConfidence;
  blockers: V2MarketDecisionBlocker[];
  warnings: string[];
  identityConfirmed: boolean;
  soldCompCount: number;
  pricingSignalCount: number;
  signalsAgree: boolean;
  hasVariantUncertainty: boolean;
}): {
  confidence: V2MarketDecisionConfidence;
  blockers: V2MarketDecisionBlocker[];
  warnings: string[];
  usableForOfferPreview: boolean;
} {
  const blockers = [...input.blockers];
  const warnings = [...input.warnings];
  let confidence = input.confidence;
  let usable = true;

  if (input.marketValue >= PREVIEW_ONLY_VALUE_THRESHOLD) {
    warnings.push(
      `Market value $${input.marketValue.toFixed(0)} ≥ $${PREVIEW_ONLY_VALUE_THRESHOLD} — preview only, staff review recommended.`,
    );
    if (!blockers.includes("manual_review_required")) {
      blockers.push("manual_review_required");
    }
    confidence = downgradeConfidence(confidence, "low");
  }

  if (input.marketValue >= VERY_HIGH_VALUE_THRESHOLD) {
    const strongEvidence =
      input.soldCompCount >= 1 ||
      (input.pricingSignalCount >= 2 && input.signalsAgree);
    if (
      !input.identityConfirmed ||
      !strongEvidence ||
      input.hasVariantUncertainty
    ) {
      blockers.push("high_value_requires_stronger_evidence");
      confidence = "none";
      usable = false;
      warnings.push(
        "High-value card requires locked/confirmed identity and agreeing sold comps or pricing signals.",
      );
    }
  } else if (input.marketValue >= HIGH_VALUE_THRESHOLD) {
    if (
      blockers.includes("source_disagreement") ||
      confidence === "none" ||
      confidence === "low"
    ) {
      blockers.push("high_value_requires_stronger_evidence");
      usable = false;
      warnings.push(
        `Market value $${input.marketValue.toFixed(0)} requires medium+ confidence without source disagreement.`,
      );
    }
  }

  return { confidence, blockers: [...new Set(blockers)], warnings, usableForOfferPreview: usable };
}

export function sportsPreviewAllowed(input: {
  staffConfirmed: boolean;
  parallelUnresolved: boolean;
  hasSoldComps: boolean;
  hasReliablePricingSignal: boolean;
  priceChartingOnly: boolean;
}): { allowed: boolean; blocker?: V2MarketDecisionBlocker; warning?: string } {
  if (input.parallelUnresolved) {
    return {
      allowed: false,
      blocker: "sports_parallel_uncertainty",
      warning: "Sports parallel/variant unresolved — block offer preview.",
    };
  }
  if (
    input.priceChartingOnly &&
    !input.staffConfirmed &&
    !input.hasSoldComps
  ) {
    return {
      allowed: false,
      blocker: "sports_parallel_uncertainty",
      warning:
        "Sports card: PriceCharting alone is insufficient without staff-confirmed identity.",
    };
  }
  if (!input.hasSoldComps && !input.hasReliablePricingSignal) {
    return {
      allowed: false,
      blocker: "no_market_data",
      warning: "Sports card: no accepted sold comps or reliable pricing signal.",
    };
  }
  return { allowed: true };
}

export function slabPreviewAllowed(input: {
  isGraded: boolean;
  gradeContextKnown: boolean;
  rawTierUsed: boolean;
}): { allowed: boolean; blocker?: V2MarketDecisionBlocker; warning?: string } {
  if (!input.isGraded) return { allowed: true };
  if (!input.gradeContextKnown || input.rawTierUsed) {
    return {
      allowed: false,
      blocker: "raw_graded_uncertainty",
      warning: "Graded/slab card requires exact grade tier — raw PriceCharting tier excluded.",
    };
  }
  return { allowed: true };
}
