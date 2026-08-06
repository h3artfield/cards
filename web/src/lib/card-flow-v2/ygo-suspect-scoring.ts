import type {
  CardSuspect,
  LockedCardIdentity,
  SuspectAssessment,
  YgoEditionInspection,
} from "./types";
import {
  isYgoFirstEdition,
  isYgoUnlimitedEdition,
  suspectsShareYgoPrinting,
} from "./ygo-edition-utils";
import { cropIsClear, cropIsPoor } from "./variant-inspection-utils";

function stripEditionContradictions(assessment: SuspectAssessment): SuspectAssessment {
  const filtered = assessment.contradictingEvidence.filter(
    (c) => !/edition|1st|unlimited/i.test(c),
  );
  return {
    ...assessment,
    contradictingEvidence: filtered,
    canEliminate: filtered.length >= 2 || assessment.matchScore < 0.25,
  };
}

export function augmentYgoSuspectAssessments(
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  inspection?: YgoEditionInspection,
): SuspectAssessment[] {
  if (!inspection?.attempted) return assessments;

  const editionFirst = inspection.edition === "first";
  const editionUnlimited = inspection.edition === "unlimited";
  const editionUnknown = !editionFirst && !editionUnlimited;
  const clear = cropIsClear(inspection.cropQuality);
  const poor = cropIsPoor(inspection.cropQuality);

  const hasEditionPair = suspects.some(
    (s) =>
      isYgoFirstEdition(s) &&
      suspects.some(
        (o) =>
          o.suspectId !== s.suspectId &&
          isYgoUnlimitedEdition(o) &&
          suspectsShareYgoPrinting(s, o),
      ),
  );
  if (!hasEditionPair) return assessments;

  return assessments
    .map((assessment) => {
      const suspect = suspects.find((s) => s.suspectId === assessment.suspectId);
      if (!suspect) return assessment;

      const isFirst = isYgoFirstEdition(suspect);
      const isUnlimited = isYgoUnlimitedEdition(suspect) && !isFirst;
      if (!isFirst && !isUnlimited) return assessment;

      let score = assessment.matchScore;
      let next = stripEditionContradictions({ ...assessment });

      if (editionFirst && isFirst) {
        score = Math.max(score, 0.92);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          canConfirm: false,
          supportingEvidence: [
            ...next.supportingEvidence,
            "1st Edition stamp visible under artwork",
          ],
          reasoning: `${next.reasoning} Edition micro-vision: 1st.`,
        };
      } else if (editionFirst && isUnlimited) {
        score = Math.max(0, score - 0.15);
        next = {
          ...next,
          matchScore: score,
          canConfirm: false,
          variantRisks: [...next.variantRisks, "1st Edition stamp seen — Unlimited deprioritized"],
        };
      } else if (editionUnlimited && clear && isUnlimited) {
        score = Math.max(score, 0.9);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          supportingEvidence: [
            ...next.supportingEvidence,
            "No 1st Edition stamp on clear crop",
          ],
          reasoning: `${next.reasoning} Edition micro-vision: Unlimited.`,
        };
      } else if (editionUnlimited && clear && isFirst) {
        score = Math.max(0, score - 0.12);
        next = {
          ...next,
          matchScore: score,
          variantRisks: [...next.variantRisks, "No edition stamp — verify 1st vs Unlimited"],
        };
      } else if (editionUnknown || poor) {
        next = {
          ...next,
          canEliminate: false,
          canConfirm: false,
          variantRisks: [
            ...next.variantRisks,
            "1st vs Unlimited unclear — check edition line under art",
          ],
        };
      }

      return next;
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function applyYgoEditionIdentityLockAdjustments(
  locked: LockedCardIdentity,
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  inspection?: YgoEditionInspection,
): LockedCardIdentity {
  if (!inspection?.attempted) return locked;

  const sorted = [...assessments].sort((a, b) => b.matchScore - a.matchScore);
  const top = sorted[0];
  const second = sorted[1];
  if (!top) return locked;

  const topSuspect = suspects.find((s) => s.suspectId === top.suspectId);
  const secondSuspect = second
    ? suspects.find((s) => s.suspectId === second.suspectId)
    : undefined;
  if (!topSuspect) return locked;

  const samePrinting =
    secondSuspect && suspectsShareYgoPrinting(topSuspect, secondSuspect);
  const gap = second ? top.matchScore - second.matchScore : 1;
  const topFirst = isYgoFirstEdition(topSuspect);
  const topUnlimited = isYgoUnlimitedEdition(topSuspect) && !topFirst;

  if (
    locked.locked &&
    samePrinting &&
    inspection.edition === "unknown" &&
    gap < 0.1
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\n1st vs Unlimited scores are close and edition inspection was inconclusive.`,
    };
  }

  if (
    topFirst &&
    inspection.edition !== "first" &&
    secondSuspect &&
    isYgoUnlimitedEdition(secondSuspect)
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\n1st Edition ranks first but stamp was not confirmed — verify edition.`,
    };
  }

  if (
    topUnlimited &&
    inspection.edition === "first" &&
    secondSuspect &&
    isYgoFirstEdition(secondSuspect)
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\n1st Edition stamp detected but Unlimited ranked first — review edition.`,
    };
  }

  return locked;
}
