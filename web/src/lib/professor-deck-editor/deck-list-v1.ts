/**
 * One list of a customer's decks, assembled from two collections.
 *
 * Decks the Professor built are recorded in `customerSavedDecks` when the build
 * completes, and carry the grade and the bracket that was asked for. Decks
 * started by hand exist only as editable decks. Reading both and merging here
 * keeps that split out of the page, which should not have to know which
 * collection a deck happens to live in.
 *
 * Only hand-started editable decks are taken, because a Professor deck that has
 * been opened in the editor exists in *both* collections and would otherwise be
 * listed twice.
 */
import { mainboardLibraryCountV1, measuredBracketIsStaleV1 } from "./types-v1";
import type { EditableDeckV1 } from "./types-v1";
import type { CustomerSavedDeck } from "../customer-saved-decks/customer-saved-deck-store";

export const PROFESSOR_DECK_LIST_V1_VERSION = "professor-deck-editor-deck-list-v1";

export type CustomerDeckOriginV1 = "professor" | "hand";

export type CustomerDeckListEntryV1 = {
  /** Unique across both sources, so React keys and lookups are safe. */
  key: string;
  /**
   * The editable deck this row refers to, where one is being read. Null for
   * Professor rows, which are read from the saved-deck record rather than the
   * editable copy — so there is no id here to register or measure against.
   */
  deckId: string | null;
  href: string;
  deckName: string;
  commanderName: string;
  origin: CustomerDeckOriginV1;
  /** The bracket the Professor was asked for. Null for a deck built by hand. */
  requestedBracket: number | null;
  /**
   * The bracket the deck actually measured, if it has ever been checked. This
   * is what tournament eligibility reads: asking for bracket 3 says nothing
   * about what was built.
   */
  measuredBracket: number | null;
  /** True when the deck changed after that measurement was taken. */
  measuredBracketStale: boolean;
  grade: string | null;
  /** Mainboard size, known only for decks we hold a card list for. */
  libraryCount: number | null;
  updatedAt: string;
};

export function deckListEntryFromHandDeckV1(deck: EditableDeckV1): CustomerDeckListEntryV1 {
  return {
    key: deck.deckId,
    deckId: deck.deckId,
    href: `/s/${encodeURIComponent(deck.storeSlug)}/decks/${encodeURIComponent(deck.deckId)}`,
    deckName: deck.deckName,
    commanderName: deck.commander.name,
    origin: "hand",
    requestedBracket: deck.bracket,
    measuredBracket: deck.measuredBracket?.bracket ?? null,
    measuredBracketStale: measuredBracketIsStaleV1(deck),
    grade: null,
    libraryCount: mainboardLibraryCountV1(deck),
    updatedAt: deck.updatedAt,
  };
}

export function deckListEntryFromSavedDeckV1(deck: CustomerSavedDeck): CustomerDeckListEntryV1 {
  return {
    key: deck.id,
    deckId: null,
    href:
      `/s/${encodeURIComponent(deck.storeSlug)}/inventory/professor/build` +
      `?buildId=${encodeURIComponent(deck.buildId)}`,
    deckName: deck.deckName,
    commanderName: deck.commanderName,
    origin: "professor",
    requestedBracket: deck.bracket,
    // Saved Professor decks predate measurement being recorded; the editor
    // stamps the editable copy, which this row is not reading.
    measuredBracket: null,
    measuredBracketStale: false,
    grade: deck.grade,
    libraryCount: null,
    updatedAt: deck.updatedAt,
  };
}

export function mergeCustomerDeckListV1(args: {
  editableDecks: readonly EditableDeckV1[];
  savedDecks: readonly CustomerSavedDeck[];
}): CustomerDeckListEntryV1[] {
  const hand = args.editableDecks
    .filter((deck) => deck.buildId === null)
    .map(deckListEntryFromHandDeckV1);
  const professor = args.savedDecks.map(deckListEntryFromSavedDeckV1);

  return [...hand, ...professor].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
