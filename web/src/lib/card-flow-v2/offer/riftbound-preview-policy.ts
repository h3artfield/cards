import type { CardSuspect } from "../types";
import type { V2MarketDecisionBlocker } from "./types";
import {
  identityFieldsFromSuspect,
  riftboundRequiresStaffReviewForPreview,
} from "../knowledge/riftbound";

export function applyRiftboundPreviewGuards(input: {
  suspect?: CardSuspect;
  marketValue?: number;
  blockers: V2MarketDecisionBlocker[];
  warnings: string[];
}): {
  blockers: V2MarketDecisionBlocker[];
  warnings: string[];
  usableForOfferPreview: boolean;
} {
  if (!input.suspect || input.suspect.category !== "riftbound") {
    return {
      blockers: input.blockers,
      warnings: input.warnings,
      usableForOfferPreview: true,
    };
  }

  const identity = identityFieldsFromSuspect(input.suspect);
  const review = riftboundRequiresStaffReviewForPreview({
    identity,
    marketValue: input.marketValue,
  });

  const blockers = [...input.blockers];
  const warnings = [...input.warnings];
  let usable = true;

  if (review.required) {
    if (!blockers.includes("manual_review_required")) {
      blockers.push("manual_review_required");
    }
    warnings.push(`Riftbound staff review: ${review.reasons.join(", ")}`);
    usable = false;
  }

  if (identity.signatureType === "aftermarket_autograph") {
    if (!blockers.includes("manual_review_required")) {
      blockers.push("manual_review_required");
    }
    warnings.push("Aftermarket autograph — do not use official Signature comps.");
    usable = false;
  }

  return { blockers, warnings, usableForOfferPreview: usable };
}
