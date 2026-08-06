import type {
  CardSuspect,
  ImageEvidenceReport,
  LockedCardIdentity,
  MtgFoilWashInspection,
  MtgFrameTreatmentInspection,
  MtgListMarkInspection,
  SuspectAssessment,
} from "./types";
import {
  getSlotValue,
  normalizeText,
  numberMatches,
  textMatches,
} from "./evidence-utils";
import {
  evidenceOriginRef,
  isTheListSuspect,
  listOriginRefMatchesEvidence,
} from "./mtg-suspect-scoring-shared";
import {
  isMtgFoilFinish,
  isMtgNonfoilFinish,
  suspectsSharePrinting,
} from "./mtg-finish-utils";
import { classifyMtgFrame, suspectsShareMtgName } from "./mtg-frame-utils";
import { cropIsClear, cropIsPoor } from "./variant-inspection-utils";

function cropInspectionClear(q: MtgListMarkInspection["cropQuality"]): boolean {
  return cropIsClear(q);
}

function cropInspectionPoor(q: MtgListMarkInspection["cropQuality"]): boolean {
  return cropIsPoor(q);
}

function stripListFalseContradictions(assessment: SuspectAssessment): SuspectAssessment {
  const filtered = assessment.contradictingEvidence.filter(
    (c) => !/set code|collector number|collector:/i.test(c),
  );
  return {
    ...assessment,
    contradictingEvidence: filtered,
    canEliminate: filtered.length >= 2 || assessment.matchScore < 0.25,
  };
}

function stripFinishFalseContradictions(assessment: SuspectAssessment): SuspectAssessment {
  const filtered = assessment.contradictingEvidence.filter(
    (c) => !/finish|foil/i.test(c),
  );
  return {
    ...assessment,
    contradictingEvidence: filtered,
    canEliminate: filtered.length >= 2 || assessment.matchScore < 0.25,
  };
}

function stripFrameContradictions(assessment: SuspectAssessment): SuspectAssessment {
  const filtered = assessment.contradictingEvidence.filter(
    (c) => !/frame|borderless|showcase|extended/i.test(c),
  );
  return {
    ...assessment,
    contradictingEvidence: filtered,
    canEliminate: filtered.length >= 2 || assessment.matchScore < 0.25,
  };
}

export function augmentMtgSuspectAssessments(
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  imageEvidence: ImageEvidenceReport,
  listInspection?: MtgListMarkInspection,
  foilInspection?: MtgFoilWashInspection,
  frameInspection?: MtgFrameTreatmentInspection,
): SuspectAssessment[] {
  const ev = evidenceOriginRef(imageEvidence);
  const hasListCandidate = suspects.some(isTheListSuspect);
  const listRefMatchExists = suspects.some(
    (s) => isTheListSuspect(s) && listOriginRefMatchesEvidence(s, imageEvidence),
  );

  const markFromInspection = listInspection?.attempted
    ? listInspection.listMarkVisible
    : undefined;
  const markFromSlot = normalizeText(getSlotValue(imageEvidence, "the_list_mark"));
  const listMarkYes =
    markFromInspection === "yes" ||
    markFromSlot === "yes" ||
    markFromSlot === "present";
  const listMarkNo =
    markFromInspection === "no" ||
    (markFromSlot === "no" && markFromInspection !== "unknown");
  const listMarkUnknown =
    !listMarkYes &&
    !listMarkNo &&
    (markFromInspection === "unknown" || !markFromInspection);

  let adjusted = assessments.map((assessment) => {
    const suspect = suspects.find((s) => s.suspectId === assessment.suspectId);
    if (!suspect) return assessment;

    const originRefMatch = listOriginRefMatchesEvidence(suspect, imageEvidence);
    const isOriginPrinting =
      !isTheListSuspect(suspect) &&
      Boolean(ev.setCode && ev.number) &&
      textMatches(suspect.setCode, ev.setCode) &&
      numberMatches(suspect.collectorNumber ?? suspect.cardNumber, ev.number);

    if (isTheListSuspect(suspect) && originRefMatch) {
      let score = assessment.matchScore;
      let next = stripListFalseContradictions({
        ...assessment,
        supportingEvidence: [
          ...assessment.supportingEvidence,
          "Bottom line origin ref matches The List SET-### format (e.g. AFC-198)",
        ],
      });

      if (listMarkYes) {
        score = Math.max(score, 0.92);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          canConfirm: false,
          reasoning: `${next.reasoning} List mark micro-vision: visible.`,
        };
      } else if (listMarkNo && listInspection && cropInspectionClear(listInspection.cropQuality)) {
        score = Math.max(0, score - 0.1);
        next = {
          ...next,
          matchScore: score,
          variantRisks: [
            ...next.variantRisks,
            "List mark not visible on clear crop — origin printing may be correct",
          ],
          reasoning: `${next.reasoning} Penalized: clear crop shows no List mark.`,
        };
      } else if (listMarkUnknown || (listInspection && cropInspectionPoor(listInspection.cropQuality))) {
        score = Math.max(score, 0.86);
        next = {
          ...next,
          matchScore: score,
          canEliminate: false,
          reasoning: `${next.reasoning} Origin ref match kept — List mark unclear or crop poor.`,
        };
      } else {
        score = Math.max(score, 0.86);
        next = { ...next, matchScore: score, canEliminate: false };
      }
      return next;
    }

    if (isOriginPrinting && hasListCandidate && listRefMatchExists) {
      if (listMarkNo && listInspection && cropInspectionClear(listInspection.cropQuality)) {
        return assessment;
      }

      let penalty = 0.08;
      let cap: number | undefined;
      if (listMarkYes) {
        penalty = 0.2;
        cap = 0.8;
      } else if (listRefMatchExists) {
        penalty = listMarkUnknown ? 0.12 : 0.1;
        cap = 0.84;
      }

      return {
        ...assessment,
        matchScore:
          cap != null
            ? Math.min(cap, Math.max(0, assessment.matchScore - penalty))
            : Math.max(0, assessment.matchScore - penalty),
        canConfirm: false,
        variantRisks: [
          ...assessment.variantRisks,
          listMarkYes
            ? "The List mark visible — origin printing deprioritized"
            : "Origin set matches bottom line but The List reprint may apply",
        ],
      };
    }

    return assessment;
  });

  adjusted = applyMtgFoilFinishScoring(
    suspects,
    adjusted,
    foilInspection,
  );

  adjusted = applyMtgFrameTreatmentScoring(
    suspects,
    adjusted,
    frameInspection,
  );

  return adjusted.sort((a, b) => b.matchScore - a.matchScore);
}

function applyMtgFoilFinishScoring(
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  foilInspection?: MtgFoilWashInspection,
): SuspectAssessment[] {
  if (!foilInspection?.attempted) return assessments;

  const washYes = foilInspection.foilWashVisible === "yes";
  const washNo =
    foilInspection.foilWashVisible === "no" ||
    (foilInspection.stampOnlyShine === "yes" &&
      foilInspection.foilWashVisible !== "yes");
  const washUnknown = !washYes && !washNo;
  const clearCrop = cropInspectionClear(foilInspection.cropQuality);

  const foilIds = new Set(
    suspects.filter((s) => isMtgFoilFinish(s.finish)).map((s) => s.suspectId),
  );
  const nonfoilIds = new Set(
    suspects.filter((s) => isMtgNonfoilFinish(s.finish)).map((s) => s.suspectId),
  );
  const hasPair = suspects.some(
    (s) =>
      isMtgFoilFinish(s.finish) &&
      suspects.some(
        (o) =>
          o.suspectId !== s.suspectId &&
          isMtgNonfoilFinish(o.finish) &&
          suspectsSharePrinting(s, o),
      ),
  );
  if (!hasPair) return assessments;

  return assessments.map((assessment) => {
    const suspect = suspects.find((s) => s.suspectId === assessment.suspectId);
    if (!suspect) return assessment;

    const isFoil = foilIds.has(suspect.suspectId);
    const isNonfoil = nonfoilIds.has(suspect.suspectId);
    if (!isFoil && !isNonfoil) return assessment;

    let score = assessment.matchScore;
    let next = stripFinishFalseContradictions({ ...assessment });

    if (washYes && isFoil) {
      score = Math.max(score, 0.9);
      next = {
        ...next,
        matchScore: score,
        canEliminate: false,
        canConfirm: false,
        supportingEvidence: [
          ...next.supportingEvidence,
          "Foil wash micro-vision: prismatic/metallic wash on art or frame",
        ],
        reasoning: `${next.reasoning} Foil finish supported by wash inspection.`,
      };
    } else if (washYes && isNonfoil) {
      score = Math.min(0.78, Math.max(0, score - 0.18));
      next = {
        ...next,
        matchScore: score,
        canConfirm: false,
        variantRisks: [
          ...next.variantRisks,
          "Foil wash visible — nonfoil deprioritized",
        ],
      };
    } else if (washNo && clearCrop && isNonfoil) {
      score = Math.max(score, 0.88);
      next = {
        ...next,
        matchScore: score,
        canEliminate: false,
        supportingEvidence: [
          ...next.supportingEvidence,
          foilInspection.stampOnlyShine === "yes"
            ? "Stamp-only shine — no broad foil wash"
            : "No broad foil wash on clear crop",
        ],
        reasoning: `${next.reasoning} Nonfoil supported by foil wash inspection.`,
      };
    } else if (washNo && clearCrop && isFoil) {
      score = Math.max(0, score - 0.1);
      next = {
        ...next,
        matchScore: score,
        variantRisks: [
          ...next.variantRisks,
          "No foil wash on clear crop — verify finish",
        ],
      };
    } else if (washUnknown || cropInspectionPoor(foilInspection.cropQuality)) {
      next = {
        ...next,
        canEliminate: false,
        canConfirm: false,
        variantRisks: [
          ...next.variantRisks,
          "Foil vs nonfoil unclear from photo — staff should verify finish",
        ],
      };
    }

    return next;
  });
}

export function applyMtgFoilIdentityLockAdjustments(
  locked: LockedCardIdentity,
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  foilInspection?: MtgFoilWashInspection,
): LockedCardIdentity {
  if (!foilInspection?.attempted) return locked;

  const sorted = [...assessments].sort((a, b) => b.matchScore - a.matchScore);
  const top = sorted[0];
  const second = sorted[1];
  if (!top) return locked;

  const topSuspect = suspects.find((s) => s.suspectId === top.suspectId);
  const secondSuspect = second
    ? suspects.find((s) => s.suspectId === second.suspectId)
    : undefined;
  if (!topSuspect) return locked;

  const topFoil = isMtgFoilFinish(topSuspect.finish);
  const topNonfoil = isMtgNonfoilFinish(topSuspect.finish);
  const secondFoil = secondSuspect ? isMtgFoilFinish(secondSuspect.finish) : false;
  const secondNonfoil = secondSuspect
    ? isMtgNonfoilFinish(secondSuspect.finish)
    : false;
  const samePrinting =
    topSuspect &&
    secondSuspect &&
    suspectsSharePrinting(topSuspect, secondSuspect);
  const gap = second ? top.matchScore - second.matchScore : 1;

  if (
    locked.locked &&
    samePrinting &&
    foilInspection.foilWashVisible === "unknown" &&
    gap < 0.1
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nFoil vs nonfoil scores are close and wash inspection was inconclusive — confirm finish.`,
    };
  }

  if (
    topFoil &&
    foilInspection.foilWashVisible !== "yes" &&
    secondNonfoil &&
    samePrinting
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nFoil printing ranks first but foil wash was not confirmed — verify finish.`,
    };
  }

  if (
    topNonfoil &&
    foilInspection.foilWashVisible === "yes" &&
    secondFoil &&
    samePrinting
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nFoil wash detected but nonfoil ranked first — prefer foil after review.`,
    };
  }

  if (
    locked.locked &&
    samePrinting &&
    (topFoil || topNonfoil) &&
    foilInspection.foilWashVisible === "unknown"
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
    };
  }

  return locked;
}

export function applyMtgListIdentityLockAdjustments(
  locked: LockedCardIdentity,
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  listInspection?: MtgListMarkInspection,
): LockedCardIdentity {
  if (!listInspection?.attempted) return locked;

  const sorted = [...assessments].sort((a, b) => b.matchScore - a.matchScore);
  const top = sorted[0];
  const second = sorted[1];
  const topSuspect = suspects.find((s) => s.suspectId === top?.suspectId);
  if (!topSuspect || !top) return locked;

  const topIsList = isTheListSuspect(topSuspect);
  const secondIsList = second
    ? isTheListSuspect(suspects.find((s) => s.suspectId === second.suspectId)!)
    : false;
  const gap = second ? top.matchScore - second.matchScore : 1;

  if (topIsList && listInspection.listMarkVisible !== "yes") {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nThe List ranks first on origin-reference match, but the List mark was not confirmed — staff verification required.`,
    };
  }

  if (
    !topIsList &&
    listInspection.listMarkVisible === "yes" &&
    second &&
    secondIsList
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nList mark visible but origin printing ranked first — prefer plst after staff review.`,
    };
  }

  if (
    !topIsList &&
    listInspection.listMarkVisible === "unknown" &&
    second &&
    isTheListSuspect(suspects.find((s) => s.suspectId === second.suspectId)!) &&
    gap < 0.12
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nClose scores between origin printing and The List — verify List symbol.`,
    };
  }

  if (topIsList && listInspection.listMarkVisible === "yes" && top.matchScore >= 0.9) {
    return locked;
  }

  if (
    !topIsList &&
    listInspection.listMarkVisible === "no" &&
    listInspection.cropQuality === "clear" &&
    locked.locked
  ) {
    return locked;
  }

  if (locked.locked && topIsList && listInspection.listMarkVisible !== "yes") {
    return { ...locked, locked: false, lockStatus: "not_locked_variant_uncertainty" };
  }

  return locked;
}

function applyMtgFrameTreatmentScoring(
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  frameInspection?: MtgFrameTreatmentInspection,
): SuspectAssessment[] {
  if (!frameInspection?.attempted) return assessments;

  const treatment = frameInspection.frameTreatment;
  const clear = cropInspectionClear(frameInspection.cropQuality);
  const poor = cropInspectionPoor(frameInspection.cropQuality);

  const hasFramePair = suspects.some(
    (s) =>
      classifyMtgFrame(s) !== "unknown" &&
      suspects.some(
        (o) =>
          o.suspectId !== s.suspectId &&
          suspectsShareMtgName(s, o) &&
          classifyMtgFrame(o) !== classifyMtgFrame(s),
      ),
  );
  if (!hasFramePair) return assessments;

  return assessments.map((assessment) => {
    const suspect = suspects.find((s) => s.suspectId === assessment.suspectId);
    if (!suspect) return assessment;

    const frame = classifyMtgFrame(suspect);
    if (frame === "unknown") return assessment;

    let score = assessment.matchScore;
    let next = stripFrameContradictions({ ...assessment });

    const matchesTreatment =
      treatment === frame ||
      (treatment === "extended" && frame === "borderless") ||
      (treatment === "borderless" && frame === "extended");

    if (treatment !== "unknown" && matchesTreatment) {
      score = Math.max(score, 0.9);
      next = {
        ...next,
        matchScore: score,
        canEliminate: false,
        canConfirm: false,
        supportingEvidence: [
          ...next.supportingEvidence,
          `Frame micro-vision: ${treatment} treatment`,
        ],
        reasoning: `${next.reasoning} Frame inspection supports ${frame}.`,
      };
    } else if (treatment === "regular" && clear && frame === "regular") {
      score = Math.max(score, 0.88);
      next = {
        ...next,
        matchScore: score,
        canEliminate: false,
        supportingEvidence: [...next.supportingEvidence, "Standard frame border visible"],
      };
    } else if (treatment !== "unknown" && !matchesTreatment && clear) {
      score = Math.max(0, score - 0.12);
      next = {
        ...next,
        matchScore: score,
        variantRisks: [
          ...next.variantRisks,
          `Frame inspection suggests ${treatment} — ${frame} deprioritized`,
        ],
      };
    } else if (treatment === "unknown" || poor) {
      next = {
        ...next,
        canEliminate: false,
        canConfirm: false,
        variantRisks: [
          ...next.variantRisks,
          "Frame treatment unclear — verify borderless/showcase/regular",
        ],
      };
    }

    return next;
  });
}

export function applyMtgFrameIdentityLockAdjustments(
  locked: LockedCardIdentity,
  suspects: CardSuspect[],
  assessments: SuspectAssessment[],
  frameInspection?: MtgFrameTreatmentInspection,
): LockedCardIdentity {
  if (!frameInspection?.attempted) return locked;

  const sorted = [...assessments].sort((a, b) => b.matchScore - a.matchScore);
  const top = sorted[0];
  const second = sorted[1];
  if (!top) return locked;

  const topSuspect = suspects.find((s) => s.suspectId === top.suspectId);
  const secondSuspect = second
    ? suspects.find((s) => s.suspectId === second.suspectId)
    : undefined;
  if (!topSuspect) return locked;

  const sameName =
    secondSuspect && suspectsShareMtgName(topSuspect, secondSuspect);
  const gap = second ? top.matchScore - second.matchScore : 1;
  const topFrame = classifyMtgFrame(topSuspect);
  const secondFrame = secondSuspect ? classifyMtgFrame(secondSuspect) : "unknown";
  const treatment = frameInspection.frameTreatment;

  if (
    locked.locked &&
    sameName &&
    topFrame !== secondFrame &&
    treatment === "unknown" &&
    gap < 0.1
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nFrame treatment scores are close and inspection was inconclusive.`,
    };
  }

  if (
    locked.locked &&
    sameName &&
    topFrame !== secondFrame &&
    treatment !== "unknown" &&
    topFrame !== treatment &&
    secondFrame === treatment
  ) {
    return {
      ...locked,
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      staffMessage: `${locked.staffMessage}\n\nFrame inspection suggests ${treatment} but ${topFrame} ranked first — review frame.`,
    };
  }

  return locked;
}

export {
  evidenceOriginRef,
  isTheListSuspect,
  listOriginRefMatchesEvidence,
  parseListOriginRef,
} from "./mtg-suspect-scoring-shared";
