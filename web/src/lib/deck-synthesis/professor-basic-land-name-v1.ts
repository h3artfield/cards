/** Client-safe basic-land name check. No catalog or Firestore imports. */

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

export function isBasicLandName(name: string): boolean {
  return BASIC_LAND_NAME_SET.has(name.trim().toLowerCase());
}
