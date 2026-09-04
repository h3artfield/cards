/** Client-safe basic-land name facts. No catalog or Firestore imports. */

const BASIC_LAND_NAME_SET = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
]);

const BASIC_LAND_COLOR_IDENTITY: Record<string, string[]> = {
  plains: ["W"],
  island: ["U"],
  swamp: ["B"],
  mountain: ["R"],
  forest: ["G"],
  wastes: [],
};

export function isBasicLandName(name: string): boolean {
  return BASIC_LAND_NAME_SET.has(name.trim().toLowerCase());
}

/** Catalog color identity is unreliable for basics, so derive it from the name. */
export function basicLandColorIdentity(name: string): string[] {
  const normalized = name.trim().toLowerCase().replace(/^snow-covered /, "");
  return BASIC_LAND_COLOR_IDENTITY[normalized] ?? [];
}
