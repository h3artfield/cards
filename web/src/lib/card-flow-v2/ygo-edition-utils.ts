import type { CardSuspect } from "./types";
import { normalizeText } from "./evidence-utils";

export function ygoPrintingKey(suspect: CardSuspect): string | null {
  const set = suspect.setCode?.trim().toUpperCase();
  const name = normalizeText(suspect.canonicalName);
  if (!set || !name) return null;
  return `${set}#${name}`;
}

export function isYgoFirstEdition(suspect: CardSuspect): boolean {
  const ed = normalizeText(suspect.edition ?? "");
  return ed.includes("1st") || ed.includes("first");
}

export function isYgoUnlimitedEdition(suspect: CardSuspect): boolean {
  const ed = normalizeText(suspect.edition ?? "");
  if (!ed) return true;
  return ed.includes("unlimited") || ed === "ue";
}

export function suspectsShareYgoPrinting(a: CardSuspect, b: CardSuspect): boolean {
  const ka = ygoPrintingKey(a);
  const kb = ygoPrintingKey(b);
  return Boolean(ka && kb && ka === kb);
}
