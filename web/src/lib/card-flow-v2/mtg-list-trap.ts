import type { CardSuspect, ImageEvidenceReport } from "./types";
import {
  evidenceOriginRef,
  isTheListSuspect,
  listOriginRefMatchesEvidence,
} from "./mtg-suspect-scoring-shared";
import { getSlotValue, numberMatches, textMatches } from "./evidence-utils";

export type MtgListOriginRefTrap = {
  listSuspect: CardSuspect;
  originSuspect: CardSuspect;
  originSetCode: string;
  originNumber: string;
};

/** Both an origin printing and a matching PLST SET-NUM suspect exist. */
export function detectMtgListOriginRefTrap(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
): MtgListOriginRefTrap | null {
  const ev = evidenceOriginRef(imageEvidence);
  if (!ev.setCode || !ev.number) return null;

  const listSuspect = suspects.find(
    (s) => isTheListSuspect(s) && listOriginRefMatchesEvidence(s, imageEvidence),
  );
  const originSuspect = suspects.find(
    (s) =>
      !isTheListSuspect(s) &&
      textMatches(s.setCode, ev.setCode) &&
      numberMatches(s.collectorNumber ?? s.cardNumber, ev.number),
  );

  if (!listSuspect || !originSuspect) return null;

  return {
    listSuspect,
    originSuspect,
    originSetCode: ev.setCode,
    originNumber: ev.number,
  };
}

export function buildMtgListStaffExplanation(input: {
  trap: MtgListOriginRefTrap;
  inspection?: {
    listMarkVisible: "yes" | "no" | "unknown";
    cropQuality: string;
    attempted: boolean;
  };
}): string {
  const { trap, inspection } = input;
  const markLabel = !inspection?.attempted
    ? "not run"
    : inspection.listMarkVisible === "yes"
      ? "visible"
      : inspection.listMarkVisible === "no"
        ? "not visible"
        : "unknown";

  const lines = [
    `The bottom line reads ${trap.originSetCode} #${trap.originNumber}.`,
    "On The List reprints this is often the origin reference, not the actual printing set.",
    `Catalog match found: ${trap.listSuspect.label}.`,
    `List mark inspection: ${markLabel}${inspection?.attempted ? ` (crop: ${inspection.cropQuality})` : ""}.`,
  ];

  if (inspection?.listMarkVisible === "yes") {
    lines.push("Result: The List mark detected — prefer the plst printing.");
  } else if (inspection?.listMarkVisible === "no" && inspection.cropQuality === "clear") {
    lines.push(
      "Result: List mark not seen on a clear crop — origin printing may be correct, but verify if unsure.",
    );
  } else {
    lines.push(
      "Result: The List remains a strong candidate due to origin-reference match — staff should verify the small List symbol if visible.",
    );
  }

  return lines.join(" ");
}
