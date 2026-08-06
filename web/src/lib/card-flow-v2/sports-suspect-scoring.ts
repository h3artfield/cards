import type {
  CardSuspect,
  LockedCardIdentity,
  SportsPrizmStampInspection,
  SuspectAssessment,
} from "./types";
import {
  isSportsParallelSuspect,
  isSportsRawOrBase,
  sportsPlayerKey,
} from "./sports-parallel-utils";
import { cropIsClear, cropIsPoor } from "./variant-inspection-utils";

function stripParallelContradictions(assessment: SuspectAssessment): SuspectAssessment {
  const filtered = assessment.contradictingEvidence.filter(
    (c) => !/parallel|prizm|silver|refractor/i.test(c),
  );
  return {
    ...assessment,
    contradictingEvidence: filtered,
    canEliminate: filtered.length >= 2 || assessment.matchScore < 0.25,
  };
}

export function augmentSportsSuspectAssessments(
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  inspection?: SportsPrizmStampInspection,
): SuspectAssessment[] {
  if (!inspection?.attempted) return assessments;

  const stampYes = inspection.prizmStampVisible === "yes";
  const stampNo = inspection.prizmStampVisible === "no";
  const stampUnknown = !stampYes && !stampNo;
  const clear = cropIsClear(inspection.cropQuality);
  const poor = cropIsPoor(inspection.cropQuality);

  const hasParallelPair = suspects.some((s) => {
    const key = sportsPlayerKey(s);
    if (!key) return false;
    const group = suspects.filter((o) => sportsPlayerKey(o) === key);
    return (
      group.some((o) => isSportsRawOrBase(o) && !isSportsParallelSuspect(o)) &&
      group.some((o) => isSportsParallelSuspect(o))
    );
  });
  if (!hasParallelPair && !stampYes && !stampNo) return assessments;

  return assessments
    .map((assessment) => {
      const suspect = suspects.find((s) => s.suspectId === assessment.suspectId);
      if (!suspect) return assessment;

      const isBase = isSportsRawOrBase(suspect) && !isSportsParallelSuspect(suspect);
      const isParallel = isSportsParallelSuspect(suspect);
      if (!isBase && !isParallel) return assessment;

      let score = assessment.matchScore;
      let next = stripParallelContradictions({ ...assessment });

      if (stampYes && isParallel) {
        score = Math.max(score, 0.92);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          canConfirm: false,
          supportingEvidence: [
            ...next.supportingEvidence,
            "PRIZM stamp visible on card back",
          ],
          reasoning: `${next.reasoning} Prizm back-stamp inspection: parallel.`,
        };
      } else if (stampYes && isBase) {
        score = Math.max(0, score - 0.18);
        next = {
          ...next,
          matchScore: score,
          canConfirm: false,
          variantRisks: [...next.variantRisks, "PRIZM stamp on back — not base card"],
        };
      } else if (stampNo && clear && isBase) {
        score = Math.max(score, 0.9);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          supportingEvidence: [
            ...next.supportingEvidence,
            "No PRIZM stamp on clear back crop",
          ],
          reasoning: `${next.reasoning} Prizm back-stamp: base supported.`,
        };
      } else if (stampNo && clear && isParallel) {
        score = Math.max(0, score - 0.14);
        next = {
          ...next,
          matchScore: score,
          variantRisks: [...next.variantRisks, "No PRIZM stamp — verify parallel"],
        };
      } else if (stampUnknown || poor) {
        next = {
          ...next,
          canEliminate: false,
          canConfirm: false,
          variantRisks: [
            ...next.variantRisks,
            "Base vs Prizm parallel unclear — check back for PRIZM stamp",
          ],
        };
      }

      return next;
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function applySportsPrizmIdentityLockAdjustments(
  locked: LockedCardIdentity,
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  inspection?: SportsPrizmStampInspection,
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

  const samePlayer =
    secondSuspect &&
    sportsPlayerKey(topSuspect) === sportsPlayerKey(secondSuspect);
  const gap = second ? top.matchScore - second.matchScore : 1;
  const topParallel = isSportsParallelSuspect(topSuspect);
  const topBase = isSportsRawOrBase(topSuspect) && !topParallel;

  if (
    locked.locked &&
    samePlayer &&
    inspection.prizmStampVisible === "unknown" &&
    gap < 0.1
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nBase vs parallel scores are close and Prizm stamp inspection was inconclusive.`,
    };
  }

  if (
    topParallel &&
    inspection.prizmStampVisible !== "yes" &&
    secondSuspect &&
    isSportsRawOrBase(secondSuspect)
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nParallel ranks first but PRIZM stamp was not confirmed on back.`,
    };
  }

  if (
    topBase &&
    inspection.prizmStampVisible === "yes" &&
    secondSuspect &&
    isSportsParallelSuspect(secondSuspect)
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nPRIZM stamp detected but base ranked first — review parallel.`,
    };
  }

  return locked;
}
