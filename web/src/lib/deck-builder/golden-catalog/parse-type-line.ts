export function parseTypeLine(typeLine: string): {
  supertypes: string[];
  types: string[];
  subtypes: string[];
} {
  const main = typeLine.split("—")[0]?.trim() ?? typeLine;
  const subtypePart = typeLine.split("—")[1]?.trim() ?? "";
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
  const subtypes = subtypePart
    ? subtypePart.split(/\s+/).filter(Boolean)
    : [];
  return { supertypes, types, subtypes };
}
