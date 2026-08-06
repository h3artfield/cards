import type { VisionResult } from "../types";

const RECOGNIZED_GRADERS =
  /^(PSA|BGS|Beckett|CGC|SGC|TAG|HGA|GMA|AGS|CSG|ACE)$/i;

function hasNumericGrade(grade?: string | null): boolean {
  if (!grade?.trim()) return false;
  return /\d/.test(grade);
}

function isRecognizedGrader(company?: string | null): boolean {
  if (!company?.trim()) return false;
  return RECOGNIZED_GRADERS.test(company.trim());
}

/** Reject sleeve/top-loader false positives; require visible grader + grade for slabs. */
export function normalizeSlabFields(
  raw: Partial<VisionResult>,
): Pick<
  VisionResult,
  "itemType" | "slabCompany" | "slabGrade" | "slabCertNumber"
> {
  let itemType = raw.itemType ?? "raw";
  let slabCompany = raw.slabCompany?.trim() || undefined;
  let slabGrade = raw.slabGrade?.trim() || undefined;
  let slabCertNumber = raw.slabCertNumber?.trim() || undefined;

  const graderOk = isRecognizedGrader(slabCompany);
  const gradeOk = hasNumericGrade(slabGrade);

  const looksLikeSlab = itemType === "graded" && graderOk && gradeOk;

  if (!looksLikeSlab) {
    itemType = itemType === "graded" ? "raw" : itemType;
    slabCompany = undefined;
    slabGrade = undefined;
    slabCertNumber = undefined;
  }

  if (itemType !== "graded") {
    slabCompany = undefined;
    slabGrade = undefined;
    slabCertNumber = undefined;
  }

  return { itemType, slabCompany, slabGrade, slabCertNumber };
}
