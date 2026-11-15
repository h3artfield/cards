import { measuredBracketIsStaleV1 } from "./types-v1";
import type { EditableDeckV1 } from "./types-v1";

/**
 * Which bracket a deck can register for an event with right now.
 *
 * A Professor build ships with a bracket and a sealed list — asking the owner
 * to run Check bracket again on an unedited deck is busywork. A hand-built deck
 * or a Professor list the owner has changed needs a fresh measurement, because
 * the number on screen no longer describes the cards in the pile.
 */
export function eventRegistrationBracketV1(deck: EditableDeckV1): {
  bracket: number | null;
  stale: boolean;
} {
  const measured = deck.measuredBracket;
  if (measured && measured.atRevision === deck.revision) {
    return { bracket: measured.bracket, stale: false };
  }

  const driftedFromProfessor = deck.editedByUser && deck.baselineCards.length > 0;

  if (deck.buildId && !driftedFromProfessor && deck.bracket != null) {
    return { bracket: deck.bracket, stale: false };
  }

  if (measured) {
    return { bracket: null, stale: measuredBracketIsStaleV1(deck) };
  }

  return { bracket: null, stale: driftedFromProfessor };
}
