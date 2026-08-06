import type { CardSuspect, ImageEvidenceReport, MtgListMarkInspection } from "./types";
import {
  getEvidenceSlot,
  getSlotValue,
  hasBottomCollectorLine,
  hasHighConfidenceSetAndNumber,
  microVisionResolvedSlot,
  normalizeText,
} from "./evidence-utils";
import {
  evidenceOriginRef,
  parseListOriginRef,
} from "./mtg-suspect-scoring-shared";
import { detectMtgListOriginRefTrap } from "./mtg-list-trap";

export type MtgListInvestigationReason =
  | "list_mark_yes"
  | "list_mark_uncertain"
  | "origin_ref_collector_line"
  | "catalog_trap"
  | "guide_collector_line";

export type MtgListInvestigation = {
  investigate: boolean;
  reasons: MtgListInvestigationReason[];
};

function listMarkValue(imageEvidence: ImageEvidenceReport): string {
  return normalizeText(getSlotValue(imageEvidence, "the_list_mark") ?? "");
}

/** Evidence-driven trigger for The List workflow (catalog plst + micro-vision). */
export function assessMtgListInvestigation(
  imageEvidence: ImageEvidenceReport,
  suspects: CardSuspect[],
): MtgListInvestigation {
  const reasons: MtgListInvestigationReason[] = [];
  const markSlot = getEvidenceSlot(imageEvidence, "the_list_mark");
  const mark = listMarkValue(imageEvidence);

  if (mark === "yes" || mark === "true") {
    reasons.push("list_mark_yes");
  }

  const collector =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number");
  if (collector && parseListOriginRef(collector)) {
    reasons.push("origin_ref_collector_line");
  }

  if (detectMtgListOriginRefTrap(suspects, imageEvidence)) {
    reasons.push("catalog_trap");
  }

  if (
    hasHighConfidenceSetAndNumber(imageEvidence) &&
    hasBottomCollectorLine(imageEvidence)
  ) {
    reasons.push("guide_collector_line");
  }

  if (
    mark !== "no" &&
    mark !== "false" &&
    !reasons.includes("list_mark_yes") &&
    hasBottomCollectorLine(imageEvidence) &&
    markSlot?.status !== "not_applicable"
  ) {
    reasons.push("list_mark_uncertain");
  }

  return { investigate: reasons.length > 0, reasons };
}

export function shouldRunMtgListMarkInspection(
  imageEvidence: ImageEvidenceReport,
  investigation: MtgListInvestigation,
): boolean {
  if (!investigation.investigate) return false;
  if (microVisionResolvedSlot(imageEvidence, "the_list_mark")) return false;

  const markSlot = getEvidenceSlot(imageEvidence, "the_list_mark");
  const mark = listMarkValue(imageEvidence);
  const explicitNo =
    (mark === "no" || mark === "false") &&
    markSlot != null &&
    markSlot.confidence >= 0.95 &&
    !markSlot.note?.includes("micro-vision");

  if (
    explicitNo &&
    !investigation.reasons.includes("origin_ref_collector_line") &&
    !investigation.reasons.includes("catalog_trap") &&
    !investigation.reasons.includes("guide_collector_line")
  ) {
    return false;
  }

  return true;
}

export function listInvestigationBlocksSetNumberNarrowing(
  investigation: MtgListInvestigation,
): boolean {
  return investigation.reasons.some((r) =>
    [
      "list_mark_yes",
      "origin_ref_collector_line",
      "catalog_trap",
      "guide_collector_line",
    ].includes(r),
  );
}

export function buildMtgListEvidenceStaffExplanation(input: {
  inspection: MtgListMarkInspection;
  reasons: MtgListInvestigationReason[];
  imageEvidence: ImageEvidenceReport;
}): string {
  const { inspection, reasons, imageEvidence } = input;
  const ev = evidenceOriginRef(imageEvidence);
  const collector =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number");
  const markLabel = !inspection.attempted
    ? "not run"
    : inspection.listMarkVisible === "yes"
      ? "visible"
      : inspection.listMarkVisible === "no"
        ? "not visible"
        : "unknown";

  const lines = [
    "The List investigation triggered from image evidence (not catalog trap alone).",
    `Triggers: ${reasons.join(", ")}.`,
  ];

  if (collector) {
    lines.push(`Bottom collector line read as: ${collector}.`);
  } else if (ev.setCode && ev.number) {
    lines.push(`Bottom line parsed as ${ev.setCode} #${ev.number}.`);
  }

  lines.push(
    `List mark micro-vision: ${markLabel}${inspection.attempted ? ` (crop: ${inspection.cropQuality})` : ""}.`,
  );

  if (inspection.listMarkVisible === "yes") {
    lines.push("Result: fork symbol detected — prefer plst printing.");
  } else if (inspection.listMarkVisible === "no" && inspection.cropQuality === "clear") {
    lines.push(
      "Result: no fork on clear crop — origin printing may be correct; verify if unsure.",
    );
  } else {
    lines.push(
      "Result: fork unclear — keep plst and origin printings in the suspect list for staff.",
    );
  }

  return lines.join(" ");
}
