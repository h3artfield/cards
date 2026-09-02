/**
 * Deterministic deckObj / decklist card-name key normalization.
 * Structural and serialization repair only — not fuzzy catalog matching.
 */

export type DeckObjKeyNormalization = {
  rawKey: string;
  normalizedKey: string;
  normalizationApplied: string[];
};

const UNSET_UNDERSCORE_PATTERN = /^_{3,}\s*(.+)$/;

/** Normalize Unicode punctuation variants common in TopDeck deckObj keys. */
function normalizePunctuation(key: string): string {
  return key
    .replace(/[\u2018\u2019\u0060]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013|\u2014/g, "-");
}

export function normalizeDeckObjCardKey(rawKey: string): DeckObjKeyNormalization {
  const steps: string[] = [];
  let key = rawKey.trim();

  const nfc = key.normalize("NFC");
  if (nfc !== key) {
    key = nfc;
    steps.push("unicode_nfc");
  }

  const punct = normalizePunctuation(key);
  if (punct !== key) {
    key = punct;
    steps.push("punctuation_normalize");
  }

  const ws = key.replace(/\s+/g, " ");
  if (ws !== key) {
    key = ws;
    steps.push("whitespace_collapse");
  }

  const dfc = key.replace(/\s*\/\/\s*/g, " // ");
  if (dfc !== key) {
    key = dfc;
    steps.push("dfc_delimiter");
  }

  const unsetMatch = key.match(UNSET_UNDERSCORE_PATTERN);
  if (unsetMatch) {
    const canonical = `_____ ${unsetMatch[1].trim()}`;
    if (canonical !== key) {
      key = canonical;
      steps.push("unset_underscore_canonical");
    }
  }

  return { rawKey, normalizedKey: key, normalizationApplied: steps };
}
