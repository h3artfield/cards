import type { ScannedCard } from "../types";
import type { CardCandidateBundle } from "./types";
import { resolveVariantUncertaintyStatus } from "./variant-uncertainty";

export type StaffConfirmationQueueReason =
  | "identity_not_locked_or_confirmed"
  | "variant_uncertainty"
  | "source_disagreement"
  | "sports_parallel_uncertainty"
  | "high_value"
  | "pricing_signals_available"
  | "candidate_market_comparison";

export type StaffConfirmationQueueItem = {
  cardId: string;
  orderId: string;
  orderNumber?: string;
  name?: string;
  frontImageUrl: string;
  category?: string;
  currentMarketPrice?: number;
  currentCashOffer?: number;
  suspectCount: number;
  topSuspects: Array<{ suspectId: string; label: string; matchScore: number }>;
  pricingSignalCount: number;
  marketMode?: string;
  reasons: StaffConfirmationQueueReason[];
  recommendedAction?: string;
  missingEvidence: string[];
};

const HIGH_VALUE_THRESHOLD = 25;

function topSuspects(identity: CardCandidateBundle) {
  const byId = new Map(
    identity.suspectAssessments.map((a) => [a.suspectId, a.matchScore]),
  );
  return identity.suspects
    .map((s) => ({
      suspectId: s.suspectId,
      label: s.label,
      matchScore: byId.get(s.suspectId) ?? 0,
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
}

function pricingSignalCount(card: ScannedCard): number {
  return (
    card.cardFlowV2Market?.snapshots.reduce(
      (n, s) => n + (s.marketOutcome?.pricingSignals ?? 0),
      0,
    ) ?? 0
  );
}

export function buildStaffConfirmationQueueItem(
  card: ScannedCard,
  orderNumber?: string,
): StaffConfirmationQueueItem | null {
  const identity = card.cardFlowV2Identity;
  if (!identity) return null;
  if (identity.staffSelection?.suspectId) return null;
  if ((identity.suspects.length ?? 0) === 0) return null;

  const reasons: StaffConfirmationQueueReason[] = [];
  if (!identity.lockedIdentity.locked) {
    reasons.push("identity_not_locked_or_confirmed");
  }
  if (identity.lockedIdentity.lockStatus === "not_locked_variant_uncertainty") {
    reasons.push("variant_uncertainty");
  }
  if (card.cardFlowV2Market?.mode === "candidate_market_comparison") {
    reasons.push("candidate_market_comparison");
  }
  if (pricingSignalCount(card) > 0) {
    reasons.push("pricing_signals_available");
  }
  if ((card.marketPrice ?? 0) >= HIGH_VALUE_THRESHOLD) {
    reasons.push("high_value");
  }
  const preview = card.cardFlowV2OfferPreview;
  if (preview?.marketDecision.blockers.includes("source_disagreement")) {
    reasons.push("source_disagreement");
  }
  if (preview?.marketDecision.blockers.includes("sports_parallel_uncertainty")) {
    reasons.push("sports_parallel_uncertainty");
  }

  if (!reasons.length) return null;

  const missing = identity.suspectAssessments.flatMap((a) => a.missingEvidence).slice(0, 5);

  return {
    cardId: card.id,
    orderId: card.orderId,
    orderNumber,
    name: card.detectedName,
    frontImageUrl: card.frontImageUrl,
    category: card.category ?? identity.category,
    currentMarketPrice: card.marketPrice,
    currentCashOffer: card.cashOffer,
    suspectCount: identity.suspects.length,
    topSuspects: topSuspects(identity),
    pricingSignalCount: pricingSignalCount(card),
    marketMode: card.cardFlowV2Market?.mode,
    reasons: [...new Set(reasons)],
    recommendedAction: card.cardFlowV2Market?.recommendedStaffAction,
    missingEvidence: [...new Set(missing)],
  };
}

export function buildStaffConfirmationQueue(
  cards: ScannedCard[],
  orderNumbers: Record<string, string> = {},
): StaffConfirmationQueueItem[] {
  return cards
    .map((c) => buildStaffConfirmationQueueItem(c, orderNumbers[c.orderId]))
    .filter((x): x is StaffConfirmationQueueItem => x != null)
    .sort((a, b) => {
      const score = (item: StaffConfirmationQueueItem) =>
        (item.reasons.includes("pricing_signals_available") ? 2 : 0) +
        (item.reasons.includes("high_value") ? 1 : 0) +
        item.suspectCount;
      return score(b) - score(a);
    });
}

export type StaffConfirmationCoverageMetrics = ReturnType<
  typeof summarizeStaffConfirmationCoverage
>;

export function summarizeStaffConfirmationCoverage(
  cards: ScannedCard[],
  offerPreviews: Array<{ eligible: boolean; identityBasis?: string; marketDecision: { blockers: string[] } }>,
): {
  staffConfirmedByCategory: Record<string, number>;
  coverageTargets: {
    pokemon: { current: number; target: 10 };
    mtg: { current: number; target: 10 };
    sports: { current: number; target: 5 };
    graded: { current: number; target: 5 };
  };
  variantUnresolved: number;
  variantResolvedByStaff: number;
  previewEligibleStaffConfirmed: number;
  previewBlockedDespiteStaffConfirmed: number;
} {
  const staffConfirmedByCategory: Record<string, number> = {};
  let variantUnresolved = 0;
  let variantResolvedByStaff = 0;
  let previewEligibleStaffConfirmed = 0;
  let previewBlockedDespiteStaffConfirmed = 0;

  const catCount = (cat: string) => staffConfirmedByCategory[cat] ?? 0;

  for (const card of cards) {
    const identity = card.cardFlowV2Identity;
    if (!identity?.staffSelection?.suspectId) continue;
    const cat = identity.category ?? card.category ?? "other";
    staffConfirmedByCategory[cat] = (staffConfirmedByCategory[cat] ?? 0) + 1;

    const vStatus = resolveVariantUncertaintyStatus({
      identity,
      evidence: card.cardFlowV2Evidence,
    });
    if (vStatus === "unresolved" || vStatus === "still_requires_review") {
      variantUnresolved++;
    }
    if (vStatus === "resolved_by_staff_confirmation") {
      variantResolvedByStaff++;
    }
  }

  for (const p of offerPreviews) {
    if (p.identityBasis !== "staff_confirmed") continue;
    if (p.eligible) previewEligibleStaffConfirmed++;
    else previewBlockedDespiteStaffConfirmed++;
  }

  const gradedCount = cards.filter(
    (c) =>
      c.itemType === "graded" &&
      c.cardFlowV2Identity?.staffSelection?.suspectId,
  ).length;

  return {
    staffConfirmedByCategory,
    coverageTargets: {
      pokemon: { current: catCount("pokemon"), target: 10 },
      mtg: { current: catCount("mtg") + catCount("magic"), target: 10 },
      sports: { current: catCount("sports"), target: 5 },
      graded: { current: gradedCount, target: 5 },
    },
    variantUnresolved,
    variantResolvedByStaff,
    previewEligibleStaffConfirmed,
    previewBlockedDespiteStaffConfirmed,
  };
}
