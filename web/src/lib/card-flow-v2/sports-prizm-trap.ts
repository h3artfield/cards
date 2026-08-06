import type { CardEvidenceInput, CardSuspect, ImageEvidenceReport } from "./types";
import { getEvidenceSlot, getSlotValue, normalizeText } from "./evidence-utils";
import {
  isSportsParallelSuspect,
  isSportsRawOrBase,
  productLineSuggestsPrizm,
  sportsPlayerKey,
} from "./sports-parallel-utils";

export type SportsPrizmTrap = {
  playerName: string;
  baseSuspect?: CardSuspect;
  parallelSuspect?: CardSuspect;
  requiresBackImage: boolean;
};

function parallelEvidenceUnclear(imageEvidence: ImageEvidenceReport): boolean {
  const slot = getEvidenceSlot(imageEvidence, "parallelName");
  const value = normalizeText(
    slot?.value ?? getSlotValue(imageEvidence, "parallelName") ?? "",
  );
  if (!value || value === "unknown") return true;
  if (slot && slot.confidence < 0.85) return true;
  return false;
}

export function detectSportsPrizmTrap(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
  input?: CardEvidenceInput,
): SportsPrizmTrap | null {
  if (!parallelEvidenceUnclear(imageEvidence)) return null;
  if (!productLineSuggestsPrizm(suspects)) return null;

  const byPlayer = new Map<string, CardSuspect[]>();
  for (const s of suspects) {
    if (s.category !== "sports") continue;
    const key = sportsPlayerKey(s);
    if (!key) continue;
    const list = byPlayer.get(key) ?? [];
    list.push(s);
    byPlayer.set(key, list);
  }

  for (const [player, group] of byPlayer) {
    const base = group.find((s) => isSportsRawOrBase(s) && !isSportsParallelSuspect(s));
    const parallel = group.find((s) => isSportsParallelSuspect(s));
    if (!base && !parallel) {
      if (group.length >= 1 && productLineSuggestsPrizm(group)) {
        return {
          playerName: player,
          baseSuspect: group[0],
          requiresBackImage: !input?.backImageUrl,
        };
      }
      continue;
    }

    return {
      playerName: group[0]?.canonicalName ?? player,
      baseSuspect: base,
      parallelSuspect: parallel,
      requiresBackImage: !input?.backImageUrl,
    };
  }

  return null;
}

export function buildSportsPrizmStaffExplanation(input: {
  trap: SportsPrizmTrap;
  inspection?: {
    prizmStampVisible: string;
    cropQuality: string;
    attempted: boolean;
  };
}): string {
  const { trap, inspection } = input;
  const stampLabel = !inspection?.attempted
    ? trap.requiresBackImage
      ? "not run (back image needed)"
      : "not run"
    : inspection.prizmStampVisible === "yes"
      ? "PRIZM stamp visible on back"
      : inspection.prizmStampVisible === "no"
        ? "no PRIZM stamp on back"
        : "unclear";

  const lines = [
    `${trap.playerName}: Prizm-style product — base chrome and Silver Prizm parallels can look similar on the front.`,
    "Flip check: look for bold \"PRIZM\" text on the upper back of the card (2013+).",
    `Prizm back-stamp inspection: ${stampLabel}${inspection?.attempted ? ` (crop: ${inspection.cropQuality})` : ""}.`,
  ];

  if (inspection?.prizmStampVisible === "yes") {
    lines.push("Result: Parallel/Prizm stamp found — not a base card.");
  } else if (inspection?.prizmStampVisible === "no" && inspection.cropQuality === "clear") {
    lines.push("Result: No PRIZM stamp on clear back crop — likely base card.");
  } else if (trap.requiresBackImage) {
    lines.push("Result: Need a clear back photo to distinguish base vs Silver Prizm.");
  }

  return lines.join(" ");
}
