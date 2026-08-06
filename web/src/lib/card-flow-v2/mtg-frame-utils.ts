import type { CardSuspect } from "./types";
import { normalizeText } from "./evidence-utils";

export type MtgFrameClass =
  | "borderless"
  | "showcase"
  | "extended"
  | "regular"
  | "unknown";

export function classifyMtgFrame(suspect: CardSuspect): MtgFrameClass {
  const raw = suspect.rawCatalogData as {
    frame_effects?: string[];
    border_color?: string;
    promo_types?: string[];
  } | undefined;
  const blob = [
    ...suspect.variantTags,
    ...(raw?.frame_effects ?? []),
    ...(raw?.promo_types ?? []),
    suspect.label,
  ]
    .join(" ")
    .toLowerCase();

  if (blob.includes("borderless")) return "borderless";
  if (blob.includes("showcase")) return "showcase";
  if (blob.includes("extended")) return "extended";
  return "regular";
}

export function suspectsShareMtgName(a: CardSuspect, b: CardSuspect): boolean {
  return (
    normalizeText(a.canonicalName) === normalizeText(b.canonicalName) &&
    Boolean(a.canonicalName)
  );
}
