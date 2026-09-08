/**
 * Starting a deck from nothing.
 *
 * The other door into the editor. `from-build-v1` hands a sealed build to its
 * owner; this opens an empty list for someone who would rather pick the cards
 * themselves, and the two produce the same `EditableDeckV1` so everything
 * downstream — ops, legality, markers, the panel — is shared.
 *
 * Three fields carry the difference, and every one of them is load-bearing:
 *
 *   buildId       null, because no build produced this list
 *   baselineCards empty, because there is no Professor deck to restore to
 *   bracket       null, because nobody requested one — it gets measured later
 *
 * The empty baseline is what makes `revertToBaseline` refuse and
 * `isProfessorEndorsedV1` return false, both of which are the right answers
 * for a deck the Professor never saw.
 */
import { PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION } from "./types-v1";
import type { EditableDeckCommanderV1, EditableDeckV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_FROM_SCRATCH_V1_VERSION =
  "professor-deck-editor-from-scratch-v1";

/**
 * Hand-deck ids are `{customerId}_hand-{handle}`.
 *
 * The build path keys a deck by `{customerId}_{buildId}`, which gives one
 * editable deck per build for free. A hand deck has no such natural key and a
 * customer may want several for the same commander, so the handle is random.
 * The `hand-` segment keeps the two id spaces from ever colliding.
 */
export function handDeckIdV1(args: { customerId: string; handle: string }): string {
  return `${args.customerId}_hand-${args.handle}`;
}

/**
 * Ownership is always checked against the stored `customerId`, never parsed
 * out of the id — an id arrives from the client and a stored field does not.
 */
export function createEditableDeckFromScratchV1(args: {
  deckId: string;
  customerId: string;
  storeId: string;
  storeSlug: string;
  commander: EditableDeckCommanderV1;
  deckName?: string;
  now: string;
}): EditableDeckV1 {
  return {
    version: PROFESSOR_DECK_EDITOR_TYPES_V1_VERSION,
    deckId: args.deckId,
    buildId: null,
    customerId: args.customerId,
    storeId: args.storeId,
    storeSlug: args.storeSlug,
    deckName: args.deckName?.trim() || args.commander.name,
    bracket: null,
    commander: args.commander,
    cards: [],
    markers: [],
    baselineCards: [],
    editedByUser: false,
    revision: 0,
    createdAt: args.now,
    updatedAt: args.now,
  };
}
