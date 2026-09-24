/**
 * One list of a customer's decks, assembled from two collections.
 *
 * Professor builds live in `customerSavedDecks`; their editable copy appears
 * once someone opens the deck editor. Merging here joins the two so the deck
 * list and event registration see one row per build, with the right bracket
 * without making the customer run Check bracket on a list the Professor
 * already graded.
 */
import { professorPlaystyleShortLabelV1 } from "./deck-list-display-v1";
import { eventRegistrationBracketV1 } from "./event-registration-bracket-v1";
import { editableDeckIdV1 } from "./from-build-v1";
import { mainboardLibraryCountV1 } from "./types-v1";
import type { DeckListCosSnapshotV1 } from "./deck-list-cos-v1";
import type { EditableDeckV1 } from "./types-v1";
import type { CustomerSavedDeck } from "../customer-saved-decks/customer-saved-deck-store";
import type { DeckEventAssignmentV1 } from "../store-calendar/deck-event-assignments-v1";

export const PROFESSOR_DECK_LIST_V1_VERSION = "professor-deck-editor-deck-list-v1";

export type CustomerDeckOriginV1 = "professor" | "hand";

export type CustomerDeckListEntryV1 = {
  key: string;
  deckId: string;
  href: string;
  deckName: string;
  commanderName: string;
  origin: CustomerDeckOriginV1;
  requestedBracket: number | null;
  /** Bracket this deck can register for an event with today. */
  registrationBracket: number | null;
  registrationBracketStale: boolean;
  /** @deprecated Prefer registrationBracket — kept for older UI paths. */
  measuredBracket: number | null;
  measuredBracketStale: boolean;
  grade: string | null;
  /** Short playstyle label, e.g. "Balanced / Flexible". */
  playstyleLabel: string | null;
  libraryCount: number | null;
  /** Competitive Strength + ten-axis profile when the full list is scoreable. */
  cosSnapshot: DeckListCosSnapshotV1 | null;
  /** Upcoming events this deck is registered for at this store. */
  eventAssignments?: DeckEventAssignmentV1[];
  createdAt: string;
  updatedAt: string;
};

function listEntryFromEditableV1(
  deck: EditableDeckV1,
  origin: CustomerDeckOriginV1,
  href: string,
  grade: string | null,
  playstyleLabel: string | null,
  cosSnapshot: DeckListCosSnapshotV1 | null,
): CustomerDeckListEntryV1 {
  const registration = eventRegistrationBracketV1(deck);
  return {
    key: deck.deckId,
    deckId: deck.deckId,
    href,
    deckName: deck.deckName,
    commanderName: deck.commander.name,
    origin,
    requestedBracket: deck.bracket,
    registrationBracket: registration.bracket,
    registrationBracketStale: registration.stale,
    measuredBracket: registration.bracket,
    measuredBracketStale: registration.stale,
    grade,
    playstyleLabel,
    libraryCount: mainboardLibraryCountV1(deck),
    cosSnapshot,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
  };
}

export function deckListEntryFromHandDeckV1(deck: EditableDeckV1): CustomerDeckListEntryV1 {
  return listEntryFromEditableV1(
    deck,
    "hand",
    `/s/${encodeURIComponent(deck.storeSlug)}/decks/${encodeURIComponent(deck.deckId)}`,
    null,
    null,
    null,
  );
}

export function deckListEntryFromProfessorV1(
  saved: CustomerSavedDeck,
  editable: EditableDeckV1 | null,
): CustomerDeckListEntryV1 {
  const deckId = editableDeckIdV1({ customerId: saved.customerId, buildId: saved.buildId });
  const href =
    `/s/${encodeURIComponent(saved.storeSlug)}/inventory/professor/build` +
    `?buildId=${encodeURIComponent(saved.buildId)}`;

  const playstyleLabel = professorPlaystyleShortLabelV1(saved.playstyle);

  if (editable) {
    return listEntryFromEditableV1(editable, "professor", href, saved.grade, playstyleLabel, null);
  }

  // Never opened in the editor — the saved build record still carries the
  // Professor's bracket and the list is still sealed.
  return {
    key: saved.id,
    deckId,
    href,
    deckName: saved.deckName,
    commanderName: saved.commanderName,
    origin: "professor",
    requestedBracket: saved.bracket,
    registrationBracket: saved.bracket,
    registrationBracketStale: false,
    measuredBracket: saved.bracket,
    measuredBracketStale: false,
    grade: saved.grade,
    playstyleLabel,
    libraryCount: null,
    cosSnapshot: null,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}

/** @deprecated Use deckListEntryFromProfessorV1 */
export function deckListEntryFromSavedDeckV1(deck: CustomerSavedDeck): CustomerDeckListEntryV1 {
  return deckListEntryFromProfessorV1(deck, null);
}

export function mergeCustomerDeckListV1(args: {
  editableDecks: readonly EditableDeckV1[];
  savedDecks: readonly CustomerSavedDeck[];
  cosByDeckId?: ReadonlyMap<string, DeckListCosSnapshotV1>;
}): CustomerDeckListEntryV1[] {
  const cosByDeckId = args.cosByDeckId ?? new Map();
  const editableByBuildId = new Map(
    args.editableDecks
      .filter((deck): deck is EditableDeckV1 & { buildId: string } => Boolean(deck.buildId))
      .map((deck) => [deck.buildId, deck] as const),
  );

  const hand = args.editableDecks
    .filter((deck) => deck.buildId === null)
    .map((deck) =>
      listEntryFromEditableV1(
        deck,
        "hand",
        `/s/${encodeURIComponent(deck.storeSlug)}/decks/${encodeURIComponent(deck.deckId)}`,
        null,
        null,
        cosByDeckId.get(deck.deckId) ?? null,
      ),
    );

  const professor = args.savedDecks.map((saved) => {
    const editable = editableByBuildId.get(saved.buildId) ?? null;
    if (editable) {
      return listEntryFromEditableV1(
        editable,
        "professor",
        `/s/${encodeURIComponent(saved.storeSlug)}/inventory/professor/build` +
          `?buildId=${encodeURIComponent(saved.buildId)}`,
        saved.grade,
        professorPlaystyleShortLabelV1(saved.playstyle),
        cosByDeckId.get(editable.deckId) ?? null,
      );
    }
    return deckListEntryFromProfessorV1(saved, null);
  });

  return [...hand, ...professor].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function attachDeckEventAssignmentsV1(
  decks: readonly CustomerDeckListEntryV1[],
  byDeckId: ReadonlyMap<string, readonly DeckEventAssignmentV1[]>,
): CustomerDeckListEntryV1[] {
  return decks.map((deck) => ({
    ...deck,
    eventAssignments: [...(byDeckId.get(deck.deckId) ?? [])],
  }));
}
