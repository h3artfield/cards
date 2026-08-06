/** Shared helpers for crop-level variant micro-vision passes. */

export type VariantCropQuality =
  | "clear"
  | "usable"
  | "poor"
  | "blocked"
  | "unknown";

export type VariantTriState = "yes" | "no" | "unknown";

export type VariantCropResult = {
  dataUrl: string | null;
  region: string;
  quality: VariantCropQuality;
};

export function normalizeTriState(raw: string | undefined): VariantTriState {
  const m = raw?.trim().toLowerCase() ?? "";
  if (m === "yes" || m === "present" || m === "visible" || m === "true") {
    return "yes";
  }
  if (m === "no" || m === "absent" || m === "not visible" || m === "false") {
    return "no";
  }
  return "unknown";
}

export function normalizeCropQuality(
  raw: string | undefined,
  fallback: VariantCropQuality,
): VariantCropQuality {
  const q = raw?.trim().toLowerCase() ?? "";
  if (q === "clear" || q === "usable" || q === "poor" || q === "blocked") {
    return q;
  }
  return fallback;
}

export function mergeCropQuality(crops: VariantCropResult[]): VariantCropQuality {
  if (!crops.length || crops.every((c) => c.quality === "blocked" || !c.dataUrl)) {
    return "blocked";
  }
  if (crops.some((c) => c.quality === "clear")) return "clear";
  if (crops.some((c) => c.quality === "usable")) return "usable";
  if (crops.some((c) => c.quality === "poor")) return "poor";
  return "unknown";
}

export function cropIsClear(quality: VariantCropQuality): boolean {
  return quality === "clear" || quality === "usable";
}

export function cropIsPoor(quality: VariantCropQuality): boolean {
  return quality === "poor" || quality === "blocked" || quality === "unknown";
}
