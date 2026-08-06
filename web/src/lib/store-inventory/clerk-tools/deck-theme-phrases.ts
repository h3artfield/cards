const THEME_WORDS =
  /\b(birds?|goblins?|elves?|zombies?|dragons?|artifacts?|enchantments?|planeswalkers?|tokens?|counters?|politics?|group hug|group-hug|voltron|stax|aristocrats|tribal|typal|sacrifice|reanimator|spellslinger|landfall|treasure|vehicles?|equip|mill|lifegain|infect|proliferate|blink|flicker|combo|ramp|control|aggro|midrange|superfriends|energy)\b/i;

/** Theme/archetype phrases — not valid commander names when parsed from "deck based on X". */
export function isDeckThemePhrase(phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (!p || p.length > 80) return false;
  if (THEME_WORDS.test(p)) return true;
  if (
    /\b(politics|theme|archetype|strategy|style|vibe|tribe|tribal|typal|based on|focused on|around the theme)\b/i.test(
      p,
    )
  ) {
    return true;
  }
  const words = p.split(/\s+/);
  if (words.length <= 3 && THEME_WORDS.test(p)) return true;
  return false;
}
