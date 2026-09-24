/**
 * Turns "I am bringing deck X" into something an organiser can seat a pod with.
 */
import { deckMatchesEventBracketV1 } from "./event-required-bracket-v1";
import { eventRegistrationBracketV1 } from "@/lib/professor-deck-editor/event-registration-bracket-v1";
import { editableDeckIdV1 } from "@/lib/professor-deck-editor/from-build-v1";
import { getEditableDeckV1 } from "@/lib/professor-deck-editor/store-v1";
import { listCustomerSavedDecks } from "@/lib/customer-saved-decks/customer-saved-deck-store";
import type { StoreEventSignupDeck } from "./types";

export type SignupDeckResolutionV1 =
  | { ok: true; deck: StoreEventSignupDeck }
  | { ok: false; error: string; status: number };

function buildIdFromDeckIdV1(deckId: string, customerId: string): string | null {
  const prefix = `${customerId}_`;
  if (!deckId.startsWith(prefix)) return null;
  const buildId = deckId.slice(prefix.length);
  return buildId || null;
}

function bracketMismatchError(requiredBracket: number, deckBracket: number): SignupDeckResolutionV1 {
  return {
    ok: false,
    error: `This event is bracket ${requiredBracket}. Your deck is bracket ${deckBracket}.`,
    status: 409,
  };
}

export async function resolveSignupDeckV1(args: {
  deckId: string;
  customerId: string;
  storeId: string;
  storeSlug: string;
  requiredBracket?: number | null;
  now?: string;
}): Promise<SignupDeckResolutionV1> {
  const deck = await getEditableDeckV1(args.deckId);

  if (deck) {
    if (deck.customerId !== args.customerId) {
      return { ok: false, error: "That deck was not found", status: 404 };
    }
    if (deck.storeId !== args.storeId) {
      return { ok: false, error: "That deck belongs to a different store", status: 403 };
    }

    const registration = eventRegistrationBracketV1(deck);
    if (registration.stale || registration.bracket == null) {
      return {
        ok: false,
        error: deck.buildId
          ? "This deck changed since the Professor built it. Check its bracket again first."
          : "Check this deck's bracket before registering it for an event",
        status: 409,
      };
    }

    if (
      args.requiredBracket != null &&
      !deckMatchesEventBracketV1({
        deckBracket: registration.bracket,
        requiredBracket: args.requiredBracket as 1 | 2 | 3 | 4 | 5,
      })
    ) {
      return bracketMismatchError(args.requiredBracket, registration.bracket);
    }

    return {
      ok: true,
      deck: {
        deckId: deck.deckId,
        deckName: deck.deckName,
        commanderName: deck.commander.name,
        bracket: registration.bracket,
        atRevision: deck.revision,
        registeredAt: args.now ?? new Date().toISOString(),
      },
    };
  }

  // Professor deck the customer has never opened in the editor — only the saved
  // build record exists, but the id scheme is already stable.
  const buildId = buildIdFromDeckIdV1(args.deckId, args.customerId);
  if (!buildId) {
    return { ok: false, error: "That deck was not found", status: 404 };
  }

  const savedDecks = await listCustomerSavedDecks({
    customerId: args.customerId,
    storeSlug: args.storeSlug,
  });
  const saved = savedDecks.find((row) => row.buildId === buildId);
  if (!saved || saved.storeId !== args.storeId) {
    return { ok: false, error: "That deck was not found", status: 404 };
  }

  if (
    args.requiredBracket != null &&
    !deckMatchesEventBracketV1({
      deckBracket: saved.bracket,
      requiredBracket: args.requiredBracket as 1 | 2 | 3 | 4 | 5,
    })
  ) {
    return bracketMismatchError(args.requiredBracket, saved.bracket);
  }

  return {
    ok: true,
    deck: {
      deckId: editableDeckIdV1({ customerId: args.customerId, buildId }),
      deckName: saved.deckName,
      commanderName: saved.commanderName,
      bracket: saved.bracket,
      atRevision: 0,
      registeredAt: args.now ?? new Date().toISOString(),
    },
  };
}
