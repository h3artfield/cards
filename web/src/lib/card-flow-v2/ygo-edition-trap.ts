import type { CardSuspect, ImageEvidenceReport } from "./types";
import { getEvidenceSlot, getSlotValue, normalizeText } from "./evidence-utils";
import {
  isYgoFirstEdition,
  isYgoUnlimitedEdition,
  ygoPrintingKey,
} from "./ygo-edition-utils";

export type YgoEditionTrap = {
  printingKey: string;
  setCode: string;
  cardName: string;
  firstSuspect?: CardSuspect;
  unlimitedSuspect?: CardSuspect;
};

function editionEvidenceUnclear(imageEvidence: ImageEvidenceReport): boolean {
  const slot = getEvidenceSlot(imageEvidence, "edition");
  const value = normalizeText(slot?.value ?? getSlotValue(imageEvidence, "edition") ?? "");
  if (!value || value === "unknown") return true;
  if (slot && slot.confidence < 0.85) return true;
  return false;
}

export function detectYgoEditionTrap(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
): YgoEditionTrap | null {
  if (!editionEvidenceUnclear(imageEvidence)) return null;

  const byPrinting = new Map<string, CardSuspect[]>();
  for (const s of suspects) {
    if (s.category !== "yugioh") continue;
    const key = ygoPrintingKey(s);
    if (!key) continue;
    const list = byPrinting.get(key) ?? [];
    list.push(s);
    byPrinting.set(key, list);
  }

  for (const [printingKey, group] of byPrinting) {
    const first = group.find((s) => isYgoFirstEdition(s));
    const unlimited = group.find(
      (s) => isYgoUnlimitedEdition(s) && !isYgoFirstEdition(s),
    );
    if (!first || !unlimited) continue;

    const [setCode] = printingKey.split("#");
    return {
      printingKey,
      setCode: setCode ?? "",
      cardName: group[0]!.canonicalName ?? "",
      firstSuspect: first,
      unlimitedSuspect: unlimited,
    };
  }

  // Single suspect with ambiguous edition + set code match in evidence
  const evSet = getSlotValue(imageEvidence, "set_code")?.toUpperCase();
  if (evSet) {
    const group = [...byPrinting.values()].find((g) =>
      g.some((s) => s.setCode?.toUpperCase() === evSet),
    );
    if (group && group.length === 1 && !group[0]!.edition) {
      return {
        printingKey: ygoPrintingKey(group[0]!) ?? evSet,
        setCode: evSet,
        cardName: group[0]!.canonicalName ?? "",
        unlimitedSuspect: group[0],
      };
    }
  }

  return null;
}

export function buildYgoEditionStaffExplanation(input: {
  trap: YgoEditionTrap;
  inspection?: {
    edition: string;
    holoStampColor?: string;
    cropQuality: string;
    attempted: boolean;
  };
}): string {
  const { trap, inspection } = input;
  const edLabel = !inspection?.attempted
    ? "not run"
    : inspection.edition === "first"
      ? "1st Edition"
      : inspection.edition === "unlimited"
        ? "Unlimited (no edition stamp)"
        : "unclear";

  const lines = [
    `${trap.cardName} · ${trap.setCode} may exist as both 1st Edition and Unlimited printings.`,
    "Check under the artwork for a gold \"1st Edition\" stamp; Unlimited has no edition line.",
    `Edition inspection: ${edLabel}${inspection?.holoStampColor ? ` (Eye of Anubis: ${inspection.holoStampColor})` : ""}${inspection?.attempted ? ` (crop: ${inspection.cropQuality})` : ""}.`,
  ];

  if (inspection?.edition === "first") {
    lines.push("Result: 1st Edition indicators seen — prefer 1st printing.");
  } else if (inspection?.edition === "unlimited" && inspection.cropQuality === "clear") {
    lines.push("Result: No 1st Edition stamp on clear crop — Unlimited may be correct.");
  } else {
    lines.push("Result: Edition unclear — staff should verify before locking.");
  }

  return lines.join(" ");
}
