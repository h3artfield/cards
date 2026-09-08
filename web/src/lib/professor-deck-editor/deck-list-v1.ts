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
import { mainboardLibraryCountV1 } from "./types-v1";
import type { EditableDeckV1 } from "./types-v1";
import type { CustomerSavedDeck } from "../customer-saved-decks/customer-saved-deck-store";

export const PROFESSOR_DECK_LIST_V1_VERSION = "professor-deck-editor-deck-list-v1";

export type CustomerDeckOriginV1 = "professor" | "hand";

export type CustomerDeckListEntryV1 = {
  /** Unique across both sources, so React keys and lookups are safe. */
  key: string;
  href: string;
  deckName: string;
  commanderName: string;
  origin: CustomerDeckOriginV1;
  /** The bracket the Professor was asked for. Null for a deck built by hand. */
  requestedBracket: number | null;
  grade: string | null;
  /** Mainboard size, known only for decks we hold a card list for. */
  libraryCount: number | null;
  updatedAt: string;
};

export function deckListEntryFromHandDeckV1(deck: EditableDeckV1): CustomerDeckListEntryV1 {
  return {
    key: deck.deckId,
    href: `/s/${encodeURIComponent(deck.storeSlug)}/decks/${encodeURIComponent(deck.deckId)}`,
    deckName: deck.deckName,
    commanderName: deck.commander.name,
    origin: "hand",
    requestedBracket: deck.bracket,
    grade: null,
    libraryCount: mainboardLibraryCountV1(deck),
    updatedAt: deck.updatedAt,
  };
}

export function deckListEntryFromSavedDeckV1(deck: CustomerSavedDeck): CustomerDeckListEntryV1 {
  return {
    key: deck.id,
    href:
      `/s/${encodeURIComponent(deck.storeSlug)}/inventory/professor/build` +
      `?buildId=${encodeURIComponent(deck.buildId)}`,
    deckName: deck.deckName,
    commanderName: deck.commanderName,
    origin: "professor",
    requestedBracket: deck.bracket,
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
