import type {
  CardSuspect,
  ImageEvidenceReport,
  LockedCardIdentity,
  PokemonReversePatternInspection,
  SuspectAssessment,
} from "./types";
import {
  isPokemonMasterBallFinish,
  isPokemonNormalFinish,
  isPokemonPokeBallFinish,
  isPokemonReverseFinish,
  suspectsSharePokemonPrinting,
} from "./pokemon-finish-utils";
import { cropIsClear, cropIsPoor } from "./variant-inspection-utils";

function stripFinishContradictions(assessment: SuspectAssessment): SuspectAssessment {
  const filtered = assessment.contradictingEvidence.filter(
    (c) => !/finish|foil|reverse|holo/i.test(c),
  );
  return {
    ...assessment,
    contradictingEvidence: filtered,
    canEliminate: filtered.length >= 2 || assessment.matchScore < 0.25,
  };
}

export function augmentPokemonSuspectAssessments(
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  inspection?: PokemonReversePatternInspection,
): SuspectAssessment[] {
  if (!inspection?.attempted) return assessments;

  const pattern = inspection.reversePattern;
  const clear = cropIsClear(inspection.cropQuality);
  const poor = cropIsPoor(inspection.cropQuality);

  return assessments
    .map((assessment) => {
      const suspect = suspects.find((s) => s.suspectId === assessment.suspectId);
      if (!suspect) return assessment;

      const isNormal = isPokemonNormalFinish(suspect.finish);
      const isMaster = isPokemonMasterBallFinish(suspect.finish);
      const isPoke = isPokemonPokeBallFinish(suspect.finish);
      const isStdReverse =
        isPokemonReverseFinish(suspect.finish) && !isMaster && !isPoke;

      if (!isNormal && !isMaster && !isPoke && !isStdReverse) return assessment;

      let score = assessment.matchScore;
      let next = stripFinishContradictions({ ...assessment });

      if (pattern === "master_ball" && isMaster) {
        score = Math.max(score, 0.92);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          canConfirm: false,
          supportingEvidence: [
            ...next.supportingEvidence,
            "Master Ball reverse pattern on text box/border",
          ],
          reasoning: `${next.reasoning} Master Ball pattern micro-vision.`,
        };
      } else if (pattern === "master_ball" && (isPoke || isStdReverse || isNormal)) {
        const penalty = isNormal ? 0.2 : 0.12;
        score = Math.max(0, score - penalty);
        next = { ...next, matchScore: score, canConfirm: false };
      } else if (pattern === "poke_ball" && isPoke) {
        score = Math.max(score, 0.9);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          supportingEvidence: [...next.supportingEvidence, "Poké Ball reverse pattern"],
        };
      } else if (pattern === "poke_ball" && (isMaster || isStdReverse || isNormal)) {
        score = Math.max(0, score - (isNormal ? 0.18 : 0.1));
        next = { ...next, matchScore: score, canConfirm: false };
      } else if (pattern === "standard_reverse" && isStdReverse) {
        score = Math.max(score, 0.88);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          supportingEvidence: [...next.supportingEvidence, "Standard reverse holo pattern"],
        };
      } else if (pattern === "standard_reverse" && isMaster) {
        score = Math.max(0, score - 0.14);
        next = { ...next, matchScore: score };
      } else if (pattern === "none" && clear && isNormal) {
        score = Math.max(score, 0.88);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          reasoning: `${next.reasoning} No reverse pattern on clear crop.`,
        };
      } else if (pattern === "none" && clear && isPokemonReverseFinish(suspect.finish)) {
        score = Math.max(0, score - 0.1);
        next = { ...next, matchScore: score };
      } else if (pattern === "unknown" || poor) {
        next = {
          ...next,
          canEliminate: false,
          canConfirm: false,
          variantRisks: [
            ...next.variantRisks,
            "Reverse pattern unclear — verify Master/Poké Ball vs normal",
          ],
        };
      }

      return next;
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function applyPokemonReversePatternLockAdjustments(
  locked: LockedCardIdentity,
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  inspection?: PokemonReversePatternInspection,
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
    secondSuspect && suspectsSharePokemonPrinting(topSuspect, secondSuspect);
  const gap = second ? top.matchScore - second.matchScore : 1;
  const finishSensitive =
    isPokemonNormalFinish(topSuspect.finish) ||
    isPokemonReverseFinish(topSuspect.finish);

  if (
    locked.locked &&
    samePrinting &&
    finishSensitive &&
    inspection.reversePattern === "unknown" &&
    gap < 0.12
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nNormal vs reverse pattern inconclusive — staff should verify border/text box pattern.`,
    };
  }

  if (
    locked.locked &&
    isPokemonMasterBallFinish(topSuspect.finish) &&
    inspection.reversePattern !== "master_ball"
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nMaster Ball reverse not confirmed by pattern inspection.`,
    };
  }

  return locked;
}
