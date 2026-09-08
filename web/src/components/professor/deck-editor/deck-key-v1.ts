/**
 * How the editor names the deck it is looking at.
 *
 * A deck the Professor built is identified by its build id; one started by hand
 * carries its own. Every request the editor makes has to carry whichever it
 * has, so the choice is made once here rather than at each fetch site.
 */
export type DeckEditorKeyV1 = {
  buildId?: string;
  deckId?: string;
};

export function deckEditorKeyQueryV1(key: DeckEditorKeyV1): string {
  return key.deckId
    ? `deckId=${encodeURIComponent(key.deckId)}`
    : `buildId=${encodeURIComponent(key.buildId ?? "")}`;
}

/** True once the key names something, so callers can hold off on fetching. */
export function deckEditorKeyIsSetV1(key: DeckEditorKeyV1): boolean {
  return Boolean(key.deckId || key.buildId);
}
