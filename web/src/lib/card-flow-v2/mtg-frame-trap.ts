import type { CardSuspect, ImageEvidenceReport } from "./types";
import { getEvidenceSlot, getSlotValue, normalizeText } from "./evidence-utils";
import {
  classifyMtgFrame,
  suspectsShareMtgName,
  type MtgFrameClass,
} from "./mtg-frame-utils";

export type MtgFrameTreatmentTrap = {
  cardName: string;
  frames: MtgFrameClass[];
  borderlessSuspect?: CardSuspect;
  showcaseSuspect?: CardSuspect;
  extendedSuspect?: CardSuspect;
  regularSuspect?: CardSuspect;
};

function frameEvidenceUnclear(imageEvidence: ImageEvidenceReport): boolean {
  const slot = getEvidenceSlot(imageEvidence, "frameTreatment");
  const value = normalizeText(slot?.value ?? getSlotValue(imageEvidence, "frameTreatment") ?? "");
  if (!value || value === "unknown") return true;
  if (slot && slot.confidence < 0.85) return true;
  return false;
}

/** Same card name with multiple frame treatment suspects. */
export function detectMtgFrameTreatmentTrap(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
): MtgFrameTreatmentTrap | null {
  if (!frameEvidenceUnclear(imageEvidence)) return null;

  const byName = new Map<string, CardSuspect[]>();
  for (const s of suspects) {
    if (s.category !== "mtg") continue;
    const name = normalizeText(s.canonicalName);
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push(s);
    byName.set(name, list);
  }

  for (const [name, group] of byName) {
    const frames = [...new Set(group.map((s) => classifyMtgFrame(s)))];
    const special = frames.filter((f) => f !== "regular" && f !== "unknown");
    if (special.length === 0) continue;
    if (!group.some((s) => classifyMtgFrame(s) === "regular")) continue;

    return {
      cardName: group[0]!.canonicalName ?? name,
      frames,
      borderlessSuspect: group.find((s) => classifyMtgFrame(s) === "borderless"),
      showcaseSuspect: group.find((s) => classifyMtgFrame(s) === "showcase"),
      extendedSuspect: group.find((s) => classifyMtgFrame(s) === "extended"),
      regularSuspect: group.find((s) => classifyMtgFrame(s) === "regular"),
    };
  }

  return null;
}

export function buildMtgFrameStaffExplanation(input: {
  trap: MtgFrameTreatmentTrap;
  inspection?: {
    frameTreatment: string;
    cropQuality: string;
    attempted: boolean;
  };
}): string {
  const { trap, inspection } = input;
  const label = !inspection?.attempted
    ? "not run"
    : inspection.frameTreatment === "borderless"
      ? "borderless (full-bleed art, no standard black border)"
      : inspection.frameTreatment === "showcase"
        ? "showcase frame"
        : inspection.frameTreatment === "extended"
          ? "extended art"
          : inspection.frameTreatment === "regular"
            ? "regular framed printing"
            : "unclear";

  const lines = [
    `${trap.cardName} has multiple frame treatments in catalog (${trap.frames.join(", ")}).`,
    "Frame inspection checks whether art bleeds to the card edge (borderless/extended) or uses a showcase frame.",
    `Frame treatment inspection: ${label}${inspection?.attempted ? ` (crop: ${inspection.cropQuality})` : ""}.`,
  ];

  if (inspection?.frameTreatment === "borderless") {
    lines.push("Result: Borderless/full-bleed art detected — prefer borderless printing.");
  } else if (inspection?.frameTreatment === "regular" && inspection.cropQuality === "clear") {
    lines.push("Result: Standard black border visible — prefer regular framed printing.");
  } else {
    lines.push("Result: Staff should verify frame type before locking.");
  }

  return lines.join(" ");
}

export { suspectsShareMtgName };
