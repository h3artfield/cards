/**
 * Turns "I am bringing deck X" into something an organiser can seat a pod with.
 *
 * The bracket is read from the player's own stored deck, never from the
 * request. A signup table where anyone can type "bracket 1" beside a cEDH list
 * is worse than having no brackets at all, because it looks authoritative.
 *
 * A deck must have been measured to be registered. The requested bracket is
 * not accepted as a substitute: asking the Professor for bracket 3 says
 * nothing about what actually got built, and that gap is the entire reason
 * measurement is recorded separately.
 */
import { getEditableDeckV1 } from "@/lib/professor-deck-editor/store-v1";
import type { StoreEventSignupDeck } from "./types";

export type SignupDeckResolutionV1 =
  | { ok: true; deck: StoreEventSignupDeck }
  | { ok: false; error: string; status: number };

export async function resolveSignupDeckV1(args: {
  deckId: string;
  customerId: string;
  storeId: string;
  now?: string;
}): Promise<SignupDeckResolutionV1> {
  const deck = await getEditableDeckV1(args.deckId);

  // Same answer for "no such deck" and "not yours", so a guessed id cannot be
  // used to discover that somebody else's deck exists.
  if (!deck || deck.customerId !== args.customerId) {
    return { ok: false, error: "That deck was not found", status: 404 };
  }
  if (deck.storeId !== args.storeId) {
    return { ok: false, error: "That deck belongs to a different store", status: 403 };
  }

  const measured = deck.measuredBracket;
  if (!measured) {
    return {
      ok: false,
      error: "Check this deck's bracket before registering it for an event",
      status: 409,
    };
  }
  if (measured.atRevision !== deck.revision) {
    return {
      ok: false,
      error: "This deck changed since its bracket was measured. Check it again first.",
      status: 409,
    };
  }

  return {
    ok: true,
    deck: {
      deckId: deck.deckId,
      deckName: deck.deckName,
      commanderName: deck.commander.name,
      bracket: measured.bracket,
      atRevision: deck.revision,
      registeredAt: args.now ?? new Date().toISOString(),
    },
  };
}
