import type { CardSuspect } from "./types";
import { normalizeText } from "./evidence-utils";

const FOIL_FINISH = new Set([
  "foil",
  "traditional foil",
  "foil-etched",
  "etched",
  "textured foil",
  "surge foil",
  "galaxy foil",
]);

const NONFOIL_FINISH = new Set(["nonfoil", "non-foil", "normal"]);

export function normalizeMtgFinish(finish: string | undefined): string {
  return normalizeText(finish ?? "").replace(/_/g, " ");
}

export function isMtgFoilFinish(finish: string | undefined): boolean {
  const f = normalizeMtgFinish(finish);
  if (!f) return false;
  if (NONFOIL_FINISH.has(f)) return false;
  if (FOIL_FINISH.has(f) || f.includes("foil")) return true;
  return false;
}

export function isMtgNonfoilFinish(finish: string | undefined): boolean {
  const f = normalizeMtgFinish(finish);
  if (!f) return false;
  if (FOIL_FINISH.has(f) || (f.includes("foil") && !f.includes("non"))) {
    return false;
  }
  return NONFOIL_FINISH.has(f) || f === "nonfoil" || f.includes("nonfoil");
}

/** Same printing identity — set + collector number (not finish). */
export function mtgPrintingKey(suspect: CardSuspect): string | null {
  const set = suspect.setCode?.trim().toUpperCase();
  const cn = suspect.collectorNumber ?? suspect.cardNumber;
  if (!set || !cn) return null;
  return `${set}#${cn.trim()}`;
}

export function suspectsSharePrinting(a: CardSuspect, b: CardSuspect): boolean {
  const ka = mtgPrintingKey(a);
  const kb = mtgPrintingKey(b);
  return Boolean(ka && kb && ka === kb);
}
