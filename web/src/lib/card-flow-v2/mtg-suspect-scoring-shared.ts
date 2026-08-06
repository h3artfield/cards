import type { CardSuspect, ImageEvidenceReport } from "./types";
import {
  getSlotValue,
  normalizeText,
  numberMatches,
} from "./evidence-utils";

export function isTheListSuspect(suspect: CardSuspect): boolean {
  if (suspect.setCode?.toLowerCase() === "plst") return true;
  if (normalizeText(suspect.setName) === "the list") return true;
  if (
    suspect.variantTags.some((t) => normalizeText(t) === "the_list")
  ) {
    return true;
  }
  const num = suspect.collectorNumber ?? suspect.cardNumber ?? "";
  return /^[a-z]{2,4}-\d+/i.test(num);
}

export function parseListOriginRef(
  collector: string | undefined | null,
): { setCode: string; number: string } | null {
  if (!collector) return null;
  const match = collector.trim().match(/^([a-z]{2,4})-(\d+)/i);
  if (!match) return null;
  return { setCode: match[1]!.toUpperCase(), number: match[2]! };
}

export function evidenceOriginRef(imageEvidence: ImageEvidenceReport): {
  setCode?: string;
  number?: string;
} {
  const setCode = getSlotValue(imageEvidence, "set_code")?.toUpperCase();
  const number =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number") ??
    undefined;
  return { setCode, number };
}

export function listOriginRefMatchesEvidence(
  suspect: CardSuspect,
  imageEvidence: ImageEvidenceReport,
): boolean {
  if (!isTheListSuspect(suspect)) return false;
  const ref = parseListOriginRef(
    suspect.collectorNumber ?? suspect.cardNumber,
  );
  const ev = evidenceOriginRef(imageEvidence);
  if (!ref || !ev.setCode || !ev.number) return false;
  return (
    ref.setCode === ev.setCode && numberMatches(ev.number, ref.number)
  );
}
