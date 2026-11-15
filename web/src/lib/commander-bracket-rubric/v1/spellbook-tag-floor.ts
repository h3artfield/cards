import type { CommanderBracket } from "./types";
import type { SpellbookBracketTagV1 } from "./types";

/** WotC-aligned floors from CommanderSpellbook's own speed tags. */
export const SPELLBOOK_TAG_FLOOR_V1: Record<SpellbookBracketTagV1, CommanderBracket | null> = {
  R: 4,
  S: 3,
  P: 3,
  O: 2,
  C: 2,
  E: null,
  B: null,
};

export function spellbookTagFloorV1(tag: SpellbookBracketTagV1 | null | undefined): CommanderBracket | null {
  if (!tag) return null;
  return SPELLBOOK_TAG_FLOOR_V1[tag] ?? null;
}

export function maxSpellbookFloorV1(
  tags: Array<SpellbookBracketTagV1 | null | undefined>,
): CommanderBracket | null {
  let floor: CommanderBracket | null = null;
  for (const tag of tags) {
    const next = spellbookTagFloorV1(tag);
    if (next != null && (floor == null || next > floor)) floor = next;
  }
  return floor;
}
