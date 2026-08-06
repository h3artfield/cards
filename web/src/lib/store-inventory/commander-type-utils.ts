/** Shared type-line parsing for commander eligibility. */
export function parseTypeParts(typeLine: string): {
  supertypes: string[];
  types: string[];
} {
  const main = typeLine.split("—")[0]?.trim() ?? typeLine;
  const parts = main.split(/\s+/).filter(Boolean);
  const knownTypes = new Set([
    "Artifact",
    "Battle",
    "Conspiracy",
    "Creature",
    "Dungeon",
    "Enchantment",
    "Instant",
    "Kindred",
    "Land",
    "Plane",
    "Planeswalker",
    "Scheme",
    "Sorcery",
    "Tribal",
    "Vanguard",
  ]);
  const supertypes: string[] = [];
  const types: string[] = [];
  for (const part of parts) {
    if (knownTypes.has(part)) types.push(part);
    else supertypes.push(part);
  }
  return { supertypes, types };
}
