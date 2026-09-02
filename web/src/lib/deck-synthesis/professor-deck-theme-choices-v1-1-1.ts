/**
 * Commander deck strategy / theme — optional multi-select preferences to synthesize.
 */
export const PROFESSOR_DECK_THEME_CHOICES_V1_1_1_VERSION = "professor-deck-theme-choices-v1-1-1";

export const MAX_PROFESSOR_DECK_THEME_SELECTIONS_V111 = 3;

export type ProfessorDeckThemeChoiceV111 = {
  id: string;
  label: string;
  userIntentPatch: string;
  featured?: boolean;
};

export const PROFESSOR_DECK_THEME_CHOICES_V111: ProfessorDeckThemeChoiceV111[] = [
  { id: "tokens-go-wide", label: "Tokens / Go-Wide", userIntentPatch: "Tokens / Go-Wide", featured: true },
  { id: "aristocrats-sacrifice", label: "Aristocrats / Sacrifice", userIntentPatch: "Aristocrats / Sacrifice", featured: true },
  { id: "reanimator", label: "Reanimator", userIntentPatch: "Reanimator", featured: true },
  { id: "graveyard-value", label: "Graveyard Value", userIntentPatch: "Graveyard Value", featured: true },
  { id: "spellslinger", label: "Spellslinger", userIntentPatch: "Spellslinger", featured: true },
  { id: "storm", label: "Storm", userIntentPatch: "Storm", featured: true },
  { id: "voltron", label: "Voltron", userIntentPatch: "Voltron", featured: true },
  { id: "equipment", label: "Equipment", userIntentPatch: "Equipment", featured: true },
  { id: "auras", label: "Auras", userIntentPatch: "Auras", featured: true },
  { id: "artifacts", label: "Artifacts", userIntentPatch: "Artifacts", featured: true },
  { id: "enchantress", label: "Enchantments", userIntentPatch: "Enchantments", featured: true },
  { id: "lands-matter", label: "Lands Matter", userIntentPatch: "Lands Matter", featured: true },
  { id: "landfall", label: "Landfall", userIntentPatch: "Landfall", featured: true },
  { id: "plus-one-counters", label: "+1/+1 Counters", userIntentPatch: "+1/+1 Counters", featured: true },
  { id: "blink-flicker-etb", label: "Blink / ETB", userIntentPatch: "Blink / ETB", featured: true },
  { id: "tribal-kindred", label: "Kindred / Tribal", userIntentPatch: "Kindred / Tribal", featured: true },
  { id: "lifegain", label: "Lifegain", userIntentPatch: "Lifegain", featured: true },
  { id: "lifedrain", label: "Lifedrain", userIntentPatch: "Lifedrain", featured: true },
  { id: "treasure", label: "Treasure", userIntentPatch: "Treasure", featured: true },
  { id: "graveyard-toolbox", label: "Toolbox", userIntentPatch: "Graveyard Toolbox", featured: true },
  { id: "big-mana", label: "Big Mana", userIntentPatch: "Big Mana", featured: true },
  { id: "stompy", label: "Stompy", userIntentPatch: "Stompy", featured: true },
  { id: "theft", label: "Theft", userIntentPatch: "Theft", featured: true },
  { id: "clones-copy", label: "Copy / Clones", userIntentPatch: "Copy / Clones", featured: true },
  { id: "exile-matters", label: "Exile Matters", userIntentPatch: "Exile Matters", featured: true },
  { id: "wheels-discard", label: "Wheels / Discard", userIntentPatch: "Wheels / Discard", featured: true },
  { id: "forced-combat-goad", label: "Goad / Forced Combat", userIntentPatch: "Goad / Forced Combat", featured: true },
  { id: "superfriends", label: "Superfriends", userIntentPatch: "Superfriends / Planeswalkers", featured: true },
  { id: "vehicles", label: "Vehicles", userIntentPatch: "Vehicles", featured: true },
  { id: "alternate-win", label: "Alternate Wins", userIntentPatch: "Alternate Win Conditions", featured: true },
  { id: "minus-one-counters", label: "-1/-1 Counters", userIntentPatch: "-1/-1 Counters" },
  { id: "burn-direct-damage", label: "Burn / Direct Damage", userIntentPatch: "Burn / Direct Damage" },
  { id: "group-slug", label: "Group Slug", userIntentPatch: "Group Slug" },
  { id: "mill", label: "Mill", userIntentPatch: "Mill" },
  { id: "self-mill", label: "Self-Mill", userIntentPatch: "Self-Mill" },
  { id: "cascade-discover", label: "Cascade / Discover", userIntentPatch: "Cascade / Discover" },
  { id: "topdeck-library", label: "Topdeck / Library", userIntentPatch: "Topdeck / Library Manipulation" },
  { id: "ramp", label: "Ramp", userIntentPatch: "Ramp" },
  { id: "food-clues", label: "Food / Clues", userIntentPatch: "Food / Clues / artifact tokens" },
  { id: "creature-toolbox", label: "Creature Toolbox", userIntentPatch: "Creature Toolbox" },
  { id: "birthing-pod", label: "Birthing Pod", userIntentPatch: "Birthing Pod / Evolution" },
  { id: "extra-combats", label: "Extra Combats", userIntentPatch: "Extra Combats" },
  { id: "extra-turns", label: "Extra Turns", userIntentPatch: "Extra Turns" },
  { id: "pillow-fort", label: "Pillow Fort", userIntentPatch: "Pillow Fort" },
  { id: "hatebears", label: "Hatebears", userIntentPatch: "Hatebears" },
  { id: "stax", label: "Stax", userIntentPatch: "Stax" },
  { id: "infect-poison-toxic", label: "Infect / Toxic", userIntentPatch: "Infect / Poison / Toxic" },
  { id: "x-spells", label: "X-Spells", userIntentPatch: "X-Spells" },
  { id: "cheat-into-play", label: "Cheat Into Play", userIntentPatch: "Cheat Into Play" },
  { id: "legends-matter", label: "Legends Matter", userIntentPatch: "Legends Matter" },
  { id: "historic", label: "Historic", userIntentPatch: "Historic" },
  { id: "commander-matters", label: "Commander Matters", userIntentPatch: "Commander Matters" },
  { id: "cantrips", label: "Cantrips", userIntentPatch: "Cantrips" },
  { id: "spell-copy", label: "Spell Copy", userIntentPatch: "Spell Copy" },
  { id: "card-draw", label: "Card Draw", userIntentPatch: "Card Draw" },
  { id: "toughness-matters", label: "Toughness Matters", userIntentPatch: "Toughness Matters" },
  { id: "politics", label: "Politics", userIntentPatch: "Politics" },
  { id: "group-hug", label: "Group Hug", userIntentPatch: "Group Hug" },
  { id: "chaos", label: "Chaos", userIntentPatch: "Chaos" },
  { id: "goodstuff", label: "Goodstuff", userIntentPatch: "Goodstuff" },
];

export const PROFESSOR_DECK_THEME_FEATURED_V111 = PROFESSOR_DECK_THEME_CHOICES_V111.filter((c) => c.featured);
export const PROFESSOR_DECK_THEME_MORE_V111 = PROFESSOR_DECK_THEME_CHOICES_V111.filter((c) => !c.featured);

const THEME_SYNTHESIS_GUIDANCE =
  "Selected theme preferences to synthesize — NOT rigid equal buckets. Combine compatible choices into one coherent primary strategy with optional secondary support. When themes compete structurally, prioritize the combination that produces the strongest coherent deck for this commander and bracket, and deemphasize conflicting themes rather than forcing all selections equally.";

export function formatDeckThemesForPipeline(themeIds: string[]): string | undefined {
  if (themeIds.length === 0) return undefined;
  const labels = themeIds
    .map((id) => PROFESSOR_DECK_THEME_CHOICES_V111.find((c) => c.id === id)?.userIntentPatch)
    .filter(Boolean) as string[];
  if (labels.length === 0) return undefined;
  return `${THEME_SYNTHESIS_GUIDANCE} Selected: ${labels.join("; ")}.`;
}
