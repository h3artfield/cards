import type { CardSuspect } from "./types";
import { normalizeText } from "./evidence-utils";

export function sportsPlayerKey(suspect: CardSuspect): string {
  return normalizeText(suspect.canonicalName ?? suspect.label.split("·")[0] ?? "");
}

export function isSportsRawOrBase(suspect: CardSuspect): boolean {
  const f = normalizeText(suspect.finish ?? "");
  const tags = suspect.variantTags.join(" ").toLowerCase();
  return f === "raw" || tags.includes("base") || !suspect.finish;
}

export function isSportsParallelSuspect(suspect: CardSuspect): boolean {
  const f = normalizeText(suspect.finish ?? "");
  const label = suspect.label.toLowerCase();
  const tags = suspect.variantTags.join(" ").toLowerCase();
  const parallel = normalizeText(
    (suspect.rawCatalogData as { parallel?: string })?.parallel ?? "",
  );
  if (f.includes("parallel")) return true;
  if (parallel) return true;
  if (tags.includes("parallel") || tags.includes("silver") || tags.includes("refractor")) {
    return true;
  }
  if (label.includes("silver prizm") || label.includes("refractor")) return true;
  // Panini "Prizm" product line name alone does not mean a parallel printing.
  return false;
}

export function productLineSuggestsPrizm(suspects: CardSuspect[]): boolean {
  return suspects.some((s) => {
    const consoleName = String(
      (s.rawCatalogData as { "console-name"?: string })?.["console-name"] ??
        s.setName ??
        "",
    ).toLowerCase();
    return consoleName.includes("prizm");
  });
}
