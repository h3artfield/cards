import type { VisionResult } from "../types";
import { scryfallFetch } from "./scryfall-client";

/** Resolve MTG set code from set name via Scryfall (no local fs cache — safe for server bundles). */
export async function resolveMtgVisionSetCode(
  vision: VisionResult,
): Promise<VisionResult> {
  if (vision.category !== "magic" || vision.setCode?.trim()) return vision;
  const setName = vision.setName?.trim();
  if (!setName) return vision;

  const code = await resolveMtgSetCodeFromName(setName);
  if (code) {
    return { ...vision, setCode: code };
  }
  return vision;
}

async function resolveMtgSetCodeFromName(
  setName: string,
): Promise<string | undefined> {
  const res = await scryfallFetch(
    `https://api.scryfall.com/sets?q=${encodeURIComponent(setName)}`,
  );
  if (!res.ok) return undefined;

  const data = (await res.json()) as {
    data?: Array<{ code: string; name: string }>;
  };
  const target = setName.toLowerCase();
  const exact = data.data?.find((s) => s.name.toLowerCase() === target);
  return (exact ?? data.data?.[0])?.code;
}
