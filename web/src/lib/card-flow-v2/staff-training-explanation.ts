import type { CardFlowV2AuditRecord } from "./audit/types";
import { runCardAuditV2 } from "./audit/run-card-audit-v2";
import { getPrimaryMarketSnapshot } from "./market/promote-staff-confirmed-market";
import type { ScannedCard } from "../types";
import type { V2ReviewStatus } from "./v2-review-status";

export type StaffTrainingExplanation = {
  heading: string;
  paragraphs: string[];
};

export function buildStaffTrainingExplanation(input: {
  card: ScannedCard;
  audit?: CardFlowV2AuditRecord;
  reviewStatus?: V2ReviewStatus;
}): StaffTrainingExplanation | null {
  const audit =
    input.audit ??
    input.card.cardFlowV2Audit ??
    (input.card.cardFlowV2Market || input.card.cardFlowV2Identity
      ? runCardAuditV2({ card: input.card })
      : undefined);

  if (!audit) return null;

  const preview = input.card.cardFlowV2OfferPreview;
  const identity = input.card.cardFlowV2Identity;
  const primarySnap = getPrimaryMarketSnapshot(input.card.cardFlowV2Market);

  if (audit.issues.includes("v1_possible_wrong_pricecharting_mapping")) {
    const suspect = identity?.suspects.find(
      (s) => s.suspectId === identity.staffSelection?.suspectId,
    );
    const confirmedLabel =
      suspect?.label ??
      (identity?.lockedIdentity.setCode && identity?.lockedIdentity.collectorNumber
        ? `${identity.lockedIdentity.setCode} #${identity.lockedIdentity.collectorNumber}`
        : "the confirmed printing");
    const pcTitle =
      primarySnap?.priceChartingMapping?.identityMismatch?.priceChartingTitle ??
      "a different printing";

    return {
      heading: "Why V2 disagrees with production price",
      paragraphs: [
        `The confirmed card is ${confirmedLabel}.`,
        `Production may be priced for a different printing: ${pcTitle}.`,
        "Same card name does not mean same printing.",
        "Staff should review before accepting this offer.",
      ],
    };
  }

  if (preview?.marketDecision.blockers.includes("source_disagreement")) {
    const sources = preview.marketDecision.sourceValues
      .filter((s) => !s.used)
      .map((s) => `${s.label}: $${s.value.toFixed(2)}`);
    const used = preview.marketDecision.sourceValues
      .filter((s) => s.used)
      .map((s) => `${s.label}: $${s.value.toFixed(2)}`);

    return {
      heading: "Why pricing is blocked",
      paragraphs: [
        "Two pricing sources disagree too much.",
        sources.length
          ? `Disagreeing sources: ${sources.join("; ")}.`
          : "Multiple pricing signals could not be reconciled.",
        used.length ? `V2 would not blend: ${used.join("; ")}.` : "",
        "Do not average them automatically.",
        "Staff review required.",
      ].filter(Boolean),
    };
  }

  if (input.reviewStatus === "v2_staff_confirmed_blocked") {
    return {
      heading: "Why preview is blocked after staff confirm",
      paragraphs: [
        preview?.marketDecision.explanation ??
          "Identity was confirmed but market data is insufficient for a shadow preview.",
        preview?.marketDecision.blockers.length
          ? `Blockers: ${preview.marketDecision.blockers.join(", ").replace(/_/g, " ")}.`
          : "",
      ].filter(Boolean),
    };
  }

  if (input.reviewStatus === "v2_needs_identity_confirmation") {
    return {
      heading: "Why staff must confirm identity",
      paragraphs: [
        identity?.lockedIdentity.staffMessage ??
          "V2 could not auto-lock the printing.",
        "Pick the correct suspect before trusting any price comparison.",
      ],
    };
  }

  return null;
}
