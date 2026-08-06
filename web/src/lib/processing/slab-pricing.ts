import type { ScannedCard, VisionResult } from "../types";

/** True when grader + grade are present on a vision payload. */
export function isVisionGradedSlab(vision: {
  itemType?: string;
  slabCompany?: string;
  slabGrade?: string;
}): boolean {
  return Boolean(vision.slabCompany?.trim() && vision.slabGrade?.trim());
}

/** e.g. "CGC 10" for marketplace search strings. */
export function slabSearchTag(
  vision: Pick<VisionResult, "slabCompany" | "slabGrade">,
): string | undefined {
  if (!isVisionGradedSlab(vision)) return undefined;
  return `${vision.slabCompany!.trim()} ${vision.slabGrade!.trim()}`;
}

/** Ensure vision carries slab fields + itemType before pricing / search. */
export function mergeVisionSlabFields(vision: VisionResult): VisionResult {
  if (!isVisionGradedSlab(vision)) return vision;
  return {
    ...vision,
    itemType: "graded",
    conditionEstimate: "NM",
  };
}

/** Merge card-level slab fields onto vision when visionJson lags. */
export function visionForPricing(
  vision: VisionResult,
  card?: Pick<
    ScannedCard,
    "itemType" | "slabCompany" | "slabGrade" | "slabCertNumber"
  >,
): VisionResult {
  const company = vision.slabCompany ?? card?.slabCompany;
  const grade = vision.slabGrade ?? card?.slabGrade;
  if (!company?.trim() || !grade?.trim()) return vision;
  return mergeVisionSlabFields({
    ...vision,
    slabCompany: company,
    slabGrade: grade,
    slabCertNumber: vision.slabCertNumber ?? card?.slabCertNumber,
  });
}

/** True when a recognized grader + grade are present on the card or vision. */
export function isGradedSlab(
  card: Pick<
    ScannedCard,
    "itemType" | "slabCompany" | "slabGrade" | "visionJson"
  >,
): boolean {
  const vision = card.visionJson as VisionResult | undefined;
  const company = vision?.slabCompany ?? card.slabCompany;
  const grade = vision?.slabGrade ?? card.slabGrade;
  return Boolean(company?.trim() && grade?.trim());
}

export function slabLabel(
  card: Pick<ScannedCard, "slabCompany" | "slabGrade" | "visionJson">,
): string | undefined {
  const vision = card.visionJson as VisionResult | undefined;
  const company = vision?.slabCompany ?? card.slabCompany;
  const grade = vision?.slabGrade ?? card.slabGrade;
  if (!company?.trim() || !grade?.trim()) return undefined;
  return `${company.trim()} ${grade.trim()}`;
}

/** Graded comps already reflect slab tier — do not apply raw wear multipliers. */
export function usesSlabGradePricing(
  card: Pick<
    ScannedCard,
    "itemType" | "slabCompany" | "slabGrade" | "visionJson"
  >,
): boolean {
  return isGradedSlab(card);
}

/** Sync slab fields between card record and visionJson (vision itemType can lag). */
export function mergeSlabFields(card: ScannedCard): ScannedCard {
  if (!isGradedSlab(card)) return card;

  const vision = (card.visionJson ?? {}) as unknown as VisionResult;
  const mergedVision: VisionResult = {
    ...vision,
    itemType: "graded",
    slabCompany: vision.slabCompany ?? card.slabCompany,
    slabGrade: vision.slabGrade ?? card.slabGrade,
    slabCertNumber: vision.slabCertNumber ?? card.slabCertNumber,
    conditionEstimate: "NM",
  };

  return {
    ...card,
    itemType: "graded",
    slabCompany: mergedVision.slabCompany,
    slabGrade: mergedVision.slabGrade,
    slabCertNumber: mergedVision.slabCertNumber,
    conditionEstimate: "NM",
    visionJson: mergedVision as unknown as Record<string, unknown>,
  };
}
