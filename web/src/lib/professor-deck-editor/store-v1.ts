/**
 * Persistence for edited decks.
 *
 * Edits go through a transaction that checks the client's revision against the
 * stored one. Without that check, two tabs open on the same deck quietly
 * overwrite each other: both read revision 4, both write revision 5, and the
 * slower write wins with a card list that never saw the faster one's change.
 * Moxfield handles this by locking the deck to one editor; a revision check
 * gets the same safety without taking the deck away from its owner.
 */
import { COLLECTIONS } from "../firebase/collections";
import { getAdminFirestore } from "../firebase/admin";
import { applyDeckEditOpsV1 } from "./ops-v1";
import type { DeckEditOpV1, DeckEditRejectionV1 } from "./ops-v1";
import type { EditableDeckV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_STORE_V1_VERSION = "professor-deck-editor-store-v1";

const EDITABLE_DECKS_COLLECTION_V1 = COLLECTIONS.customerEditableDecks;

/**
 * Same fallback shape as the rest of the Professor stores: Firestore when
 * credentials are present, memory otherwise, so local development and tests
 * work without a service account.
 */
const memoryDecks = new Map<string, EditableDeckV1>();

function collection() {
  const db = getAdminFirestore();
  return db ? db.collection(EDITABLE_DECKS_COLLECTION_V1) : null;
}

function normalizeEditableDeckV1(deck: EditableDeckV1): EditableDeckV1 {
  return {
    ...deck,
    commander: {
      ...deck.commander,
      colorIdentity: [...(deck.commander?.colorIdentity ?? [])],
    },
    cards: (deck.cards ?? []).map((card) => ({
      ...card,
      markerIds: card.markerIds ?? [],
      professor: card.professor
        ? {
            ...card.professor,
            secondaryRoles: card.professor.secondaryRoles ?? [],
            packageMembership: card.professor.packageMembership ?? [],
          }
        : null,
    })),
    markers: deck.markers ?? [],
    baselineCards: deck.baselineCards ?? [],
  };
}

export async function getEditableDeckV1(deckId: string): Promise<EditableDeckV1 | null> {
  const col = collection();
  if (!col) {
    const deck = memoryDecks.get(deckId);
    return deck ? normalizeEditableDeckV1(deck) : null;
  }

  const snap = await col.doc(deckId).get();
  if (!snap.exists) return null;
  return normalizeEditableDeckV1(snap.data() as EditableDeckV1);
}

/** First write for a deck. Never overwrites, so a re-open cannot wipe edits. */
export async function createEditableDeckIfAbsentV1(
  deck: EditableDeckV1,
): Promise<EditableDeckV1> {
  const col = collection();
  if (!col) {
    const existing = memoryDecks.get(deck.deckId);
    if (existing) return existing;
    memoryDecks.set(deck.deckId, deck);
    return deck;
  }

  const ref = col.doc(deck.deckId);
  const db = getAdminFirestore();
  if (!db) return deck;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data() as EditableDeckV1;
    tx.set(ref, deck);
    return deck;
  });
}

/**
 * Records what the deck measured, which is not an edit to the deck.
 *
 * Deliberately outside `mutateEditableDeckV1`: measuring must not bump the
 * revision or set `editedByUser`, or checking a bracket would itself make the
 * deck look edited and invalidate the very measurement being stored.
 */
export async function recordMeasuredBracketV1(args: {
  deckId: string;
  customerId: string;
  bracket: number;
  /** The revision the measurement was taken against. */
  atRevision: number;
  now?: string;
}): Promise<EditableDeckV1 | null> {
  const measuredBracket = {
    bracket: args.bracket,
    atRevision: args.atRevision,
    measuredAt: args.now ?? new Date().toISOString(),
  };

  const stamp = (current: EditableDeckV1 | null): EditableDeckV1 | null => {
    if (!current || current.customerId !== args.customerId) return null;
    // A measurement of a list that has already moved on is not worth keeping.
    if (current.revision !== args.atRevision) return current;
    return { ...current, measuredBracket };
  };

  const col = collection();
  if (!col) {
    const next = stamp(memoryDecks.get(args.deckId) ?? null);
    if (next) memoryDecks.set(args.deckId, next);
    return next;
  }

  const db = getAdminFirestore();
  if (!db) return null;

  const ref = col.doc(args.deckId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = stamp(snap.exists ? (snap.data() as EditableDeckV1) : null);
    if (next) tx.set(ref, next);
    return next;
  });
}

export type EditableDeckMutationV1 =
  | {
      ok: true;
      deck: EditableDeckV1;
      applied: number;
      rejected: DeckEditRejectionV1[];
    }
  | { ok: false; failure: "NOT_FOUND"; message: string }
  | { ok: false; failure: "FORBIDDEN"; message: string }
  | {
      ok: false;
      failure: "REVISION_CONFLICT";
      message: string;
      /** Returned so a client can reconcile without a second round trip. */
      deck: EditableDeckV1;
    }
  | { ok: false; failure: "ALL_REJECTED"; message: string; rejected: DeckEditRejectionV1[] };

/**
 * Applies an edit batch under a revision check.
 *
 * `expectedRevision` is optional: a client that genuinely does not care — a
 * one-shot marker toggle from a list view, say — can omit it and take
 * last-write-wins. The editor always sends it.
 */
export async function mutateEditableDeckV1(args: {
  deckId: string;
  customerId: string;
  ops: readonly DeckEditOpV1[];
  expectedRevision?: number;
  now?: string;
}): Promise<EditableDeckMutationV1> {
  const now = args.now ?? new Date().toISOString();

  const attempt = (current: EditableDeckV1 | null): EditableDeckMutationV1 => {
    if (!current) {
      return { ok: false, failure: "NOT_FOUND", message: "That deck does not exist" };
    }
    if (current.customerId !== args.customerId) {
      return { ok: false, failure: "FORBIDDEN", message: "That deck belongs to someone else" };
    }
    if (args.expectedRevision !== undefined && args.expectedRevision !== current.revision) {
      return {
        ok: false,
        failure: "REVISION_CONFLICT",
        message: "This deck changed somewhere else. Reload to pick up the latest version.",
        deck: current,
      };
    }

    const outcome = applyDeckEditOpsV1({ deck: current, ops: args.ops, now });
    if (!outcome.changed) {
      return {
        ok: false,
        failure: "ALL_REJECTED",
        message: "None of those changes could be applied",
        rejected: outcome.rejected,
      };
    }
    return {
      ok: true,
      deck: outcome.deck,
      applied: outcome.applied,
      rejected: outcome.rejected,
    };
  };

  const db = getAdminFirestore();
  if (!db) {
    const stored = memoryDecks.get(args.deckId);
    const result = attempt(stored ? normalizeEditableDeckV1(stored) : null);
    if (result.ok) memoryDecks.set(args.deckId, result.deck);
    return result;
  }

  const ref = db.collection(EDITABLE_DECKS_COLLECTION_V1).doc(args.deckId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const result = attempt(
      snap.exists ? normalizeEditableDeckV1(snap.data() as EditableDeckV1) : null,
    );
    if (result.ok) tx.set(ref, result.deck);
    return result;
  });
}

export async function listEditableDecksV1(args: {
  customerId: string;
  storeSlug?: string;
  limit?: number;
}): Promise<EditableDeckV1[]> {
  const limit = args.limit ?? 50;
  const col = collection();

  if (!col) {
    return [...memoryDecks.values()]
      .map(normalizeEditableDeckV1)
      .filter(
        (deck) =>
          deck.customerId === args.customerId &&
          (!args.storeSlug || deck.storeSlug === args.storeSlug),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  // Filtered in memory rather than with a second `where`, to avoid needing a
  // composite index for what is at most a few dozen decks per customer.
  const snap = await col
    .where("customerId", "==", args.customerId)
    .orderBy("updatedAt", "desc")
    .limit(limit * 2)
    .get();

  return snap.docs
    .map((doc) => normalizeEditableDeckV1(doc.data() as EditableDeckV1))
    .filter((deck) => !args.storeSlug || deck.storeSlug === args.storeSlug)
    .slice(0, limit);
}

export async function deleteEditableDeckV1(args: {
  deckId: string;
  customerId: string;
}): Promise<"deleted" | "not_found" | "forbidden"> {
  const col = collection();
  if (!col) {
    const deck = memoryDecks.get(args.deckId);
    if (!deck) return "not_found";
    if (deck.customerId !== args.customerId) return "forbidden";
    memoryDecks.delete(args.deckId);
    return "deleted";
  }

  const ref = col.doc(args.deckId);
  const snap = await ref.get();
  if (!snap.exists) return "not_found";
  const deck = snap.data() as EditableDeckV1;
  if (deck.customerId !== args.customerId) return "forbidden";
  await ref.delete();
  return "deleted";
}

/** Test hook. Firestore-backed runs never touch the memory map. */
export function __resetEditableDeckMemoryV1(): void {
  memoryDecks.clear();
}
