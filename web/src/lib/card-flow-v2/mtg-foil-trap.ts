import type { CardSuspect, ImageEvidenceReport } from "./types";
import { getEvidenceSlot, getSlotValue, normalizeText } from "./evidence-utils";
import {
  isMtgFoilFinish,
  isMtgNonfoilFinish,
  mtgPrintingKey,
} from "./mtg-finish-utils";

export type MtgFoilFinishTrap = {
  printingKey: string;
  setCode: string;
  collectorNumber: string;
  foilSuspect: CardSuspect;
  nonfoilSuspect: CardSuspect;
};

function finishEvidenceUnclear(imageEvidence: ImageEvidenceReport): boolean {
  const slot = getEvidenceSlot(imageEvidence, "foil_pattern");
  const value = normalizeText(slot?.value ?? getSlotValue(imageEvidence, "foil_pattern"));
  if (!value || value === "unknown") return true;
  if (value.includes("unclear") || value.includes("uncertain")) return true;
  if (slot && slot.confidence < 0.85) return true;
  return false;
}

/** Foil + nonfoil suspects exist for the same set/collector printing. */
export function detectMtgFoilFinishTrap(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
  options?: { requireUnclearFinish?: boolean },
): MtgFoilFinishTrap | null {
  if (options?.requireUnclearFinish !== false && !finishEvidenceUnclear(imageEvidence)) {
    return null;
  }

  const byPrinting = new Map<string, CardSuspect[]>();
  for (const s of suspects) {
    const key = mtgPrintingKey(s);
    if (!key) continue;
    const list = byPrinting.get(key) ?? [];
    list.push(s);
    byPrinting.set(key, list);
  }

  for (const [printingKey, group] of byPrinting) {
    const foil = group.find((s) => isMtgFoilFinish(s.finish));
    const nonfoil = group.find(
      (s) => isMtgNonfoilFinish(s.finish) && s.suspectId !== foil?.suspectId,
    );
    if (!foil || !nonfoil) continue;

    const [setCode, collectorNumber] = printingKey.split("#");
    if (!setCode || !collectorNumber) continue;

    return {
      printingKey,
      setCode,
      collectorNumber,
      foilSuspect: foil,
      nonfoilSuspect: nonfoil,
    };
  }

  return null;
}

export function buildMtgFoilStaffExplanation(input: {
  trap: MtgFoilFinishTrap;
  inspection?: {
    foilWashVisible: "yes" | "no" | "unknown";
    stampOnlyShine?: "yes" | "no" | "unknown";
    cropQuality: string;
    attempted: boolean;
  };
}): string {
  const { trap, inspection } = input;
  const washLabel = !inspection?.attempted
    ? "not run"
    : inspection.foilWashVisible === "yes"
      ? "visible (rainbow/metallic wash on art or frame)"
      : inspection.foilWashVisible === "no"
        ? "not visible"
        : "unclear";

  const lines = [
    `Catalog has both foil and nonfoil for ${trap.setCode} #${trap.collectorNumber}.`,
    "A flat photo cannot be tilted — we look for subtle prismatic/rainbow patches on the artwork and frame border.",
    `Foil wash inspection: ${washLabel}${inspection?.attempted ? ` (crop: ${inspection.cropQuality})` : ""}.`,
  ];

  if (inspection?.stampOnlyShine === "yes" && inspection.foilWashVisible !== "yes") {
    lines.push(
      "Localized shine appears limited to the bottom security stamp — consistent with nonfoil rare, not full-card foil.",
    );
  }

  if (inspection?.foilWashVisible === "yes") {
    lines.push("Result: Broad foil wash detected — prefer the foil printing.");
  } else if (inspection?.foilWashVisible === "no" && inspection.cropQuality === "clear") {
    lines.push("Result: No broad foil wash on clear crops — nonfoil printing may be correct.");
  } else {
    lines.push(
      "Result: Finish remains uncertain from the photo — staff should confirm foil vs nonfoil before locking.",
    );
  }

  return lines.join(" ");
}
