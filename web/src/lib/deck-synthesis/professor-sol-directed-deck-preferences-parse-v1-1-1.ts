export type DeckSetRestrictionsV111 = {
  restrictToSetCodes: Set<string>;
  setNamePatterns: RegExp[];
};

const LOTR_SET_CODES = ["ltr", "ltc"];
const HOBBIT_SET_CODES = ["hob"];

export function parseDeckSetRestrictions(deckPreferences: string): DeckSetRestrictionsV111 | null {
  const text = deckPreferences.trim().toLowerCase();
  if (!text) return null;

  const wantsLotr =
    /lord of the rings|middle[- ]earth|tales of middle|tolkien/.test(text) && /set|cards|only|using/.test(text);
  const wantsHobbit = /hobbit/.test(text) && /set|cards|only|using/.test(text);

  if (!wantsLotr && !wantsHobbit) return null;

  const restrictToSetCodes = new Set<string>();
  if (wantsLotr) for (const code of LOTR_SET_CODES) restrictToSetCodes.add(code);
  if (wantsHobbit) for (const code of HOBBIT_SET_CODES) restrictToSetCodes.add(code);

  return {
    restrictToSetCodes,
    setNamePatterns: [/lord of the rings/i, /middle[- ]earth/i, /hobbit/i, /tolkien/i],
  };
}

export function isDeckPreferencesSetConstrained(deckPreferences: string): boolean {
  return parseDeckSetRestrictions(deckPreferences) !== null;
}
