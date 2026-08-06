import type { ScannedCard } from "../../types";
import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "../types";
import type { CardFlowV2MarketBundle } from "../market/types";
import { getPrimaryMarketSnapshot } from "../market/promote-staff-confirmed-market";
import type { V2AuditAgreement, V2PriceComparison } from "./types";

const MATCH_THRESHOLD = 0.2;
const LARGE_DISAGREEMENT_THRESHOLD = 0.5;

export function compareV2Pricing(input: {
  card: Pick<
    ScannedCard,
    "marketPrice" | "pricingJson" | "cardFlowV2Identity" | "cardFlowV2Market"
  >;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
}): V2PriceComparison {
  const identity = input.identity ?? input.card.cardFlowV2Identity;
  const market = input.market ?? input.card.cardFlowV2Market;

  const currentMarketPrice =
    input.card.marketPrice != null && input.card.marketPrice > 0
      ? input.card.marketPrice
      : undefined;
  const pricingJson = input.card.pricingJson as { source?: string } | undefined;
  const currentPricingSource = pricingJson?.source;

  const locked = identity?.lockedIdentity.locked ?? false;
  const primarySnapshot = getPrimaryMarketSnapshot(market);

  if (
    market?.mode === "candidate_market_comparison" &&
    !market.selectedSuspectId
  ) {
    return {
      currentMarketPrice,
      currentPricingSource,
      v2Confidence: primarySnapshot?.confidence ?? "none",
      agreement: "not_comparable",
    };
  }

  if (
    market?.mode === "staff_confirmed_identity_market" ||
    market?.selectedSuspectId
  ) {
    // Fall through — compare using staff-selected prepared snapshot.
  } else if (
    market?.mode === "candidate_market_comparison" ||
    (!locked && (market?.snapshots.length ?? 0) > 0)
  ) {
    return {
      currentMarketPrice,
      currentPricingSource,
      v2Confidence: primarySnapshot?.confidence ?? "none",
      agreement: "not_comparable",
    };
  }

  if (market?.mode === "no_market_run" || !market?.snapshots.length) {
    if (currentMarketPrice != null && currentMarketPrice > 0) {
      return {
        currentMarketPrice,
        currentPricingSource,
        v2Confidence: "none",
        agreement: "current_has_price_v2_none",
      };
    }
    return {
      currentMarketPrice,
      currentPricingSource,
      v2Confidence: "none",
      agreement: "both_no_price",
    };
  }

  const v2ValueLow = primarySnapshot?.valueLow;
  const v2ValueMedian = primarySnapshot?.valueMedian;
  const v2ValueHigh = primarySnapshot?.valueHigh;
  const v2Confidence = primarySnapshot?.confidence ?? "none";

  const v2HasPrice = v2ValueMedian != null && v2ValueMedian > 0;

  if (!v2HasPrice && currentMarketPrice != null) {
    return {
      currentMarketPrice,
      currentPricingSource,
      v2ValueLow,
      v2ValueMedian,
      v2ValueHigh,
      v2Confidence,
      agreement: "current_has_price_v2_none",
    };
  }

  if (v2HasPrice && currentMarketPrice == null) {
    return {
      currentMarketPrice,
      currentPricingSource,
      v2ValueLow,
      v2ValueMedian,
      v2ValueHigh,
      v2Confidence,
      agreement: "v2_has_price_current_none",
    };
  }

  if (!v2HasPrice && currentMarketPrice == null) {
    return {
      currentMarketPrice,
      currentPricingSource,
      v2Confidence,
      agreement: "both_no_price",
    };
  }

  const current = currentMarketPrice!;
  const v2 = v2ValueMedian!;
  const absoluteDifference = Math.abs(v2 - current);
  const percentDifference =
    current > 0 ? absoluteDifference / current : undefined;

  let agreement: V2AuditAgreement = "matches_current";
  if (percentDifference != null) {
    if (percentDifference <= MATCH_THRESHOLD) {
      agreement = "matches_current";
    } else if (v2 > current) {
      agreement = "v2_higher";
    } else {
      agreement = "v2_lower";
    }
  }

  return {
    currentMarketPrice: current,
    currentPricingSource,
    v2ValueLow,
    v2ValueMedian,
    v2ValueHigh,
    v2Confidence,
    absoluteDifference,
    percentDifference,
    agreement,
  };
}

export function isLargePriceDisagreement(comparison: V2PriceComparison): boolean {
  if (comparison.percentDifference == null) return false;
  if (comparison.percentDifference > LARGE_DISAGREEMENT_THRESHOLD) return true;
  if (
    comparison.absoluteDifference != null &&
    comparison.absoluteDifference > 100
  ) {
    return true;
  }
  return false;
}

export function mapLegacyCategoryToV2(
  category?: string,
  v2Category?: string,
): import("../types").CardCategory {
  if (v2Category && v2Category !== "unknown") {
    return v2Category as import("../types").CardCategory;
  }
  switch (category) {
    case "pokemon":
    case "yugioh":
    case "sports":
      return category;
    case "magic":
      return "mtg";
    default:
      return "unknown";
  }
}

export type AuditBuildInput = {
  card: ScannedCard;
  evidence?: CardFlowV2EvidenceBundle;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  existingStaffCorrection?: import("./types").V2StaffCorrection;
};
