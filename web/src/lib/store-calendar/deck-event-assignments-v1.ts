import { dataStore } from "@/lib/storage/data-store";

export type DeckEventAssignmentV1 = {
  eventId: string;
  eventTitle: string;
  startAt: string;
  signupId: string;
  registeredBracket: number;
};

/**
 * Upcoming event signups grouped by deck id, for My Decks banners.
 */
export async function deckEventAssignmentsByDeckIdV1(args: {
  storeId: string;
  customerId: string;
  email?: string;
}): Promise<Map<string, DeckEventAssignmentV1[]>> {
  const signups = await dataStore.listEventSignupsForCustomerAtStore(
    args.storeId,
    args.customerId,
    args.email,
  );
  const withDeck = signups.filter((signup) => signup.deck);
  if (!withDeck.length) return new Map();

  const now = Date.now();
  const eventIds = [...new Set(withDeck.map((signup) => signup.eventId))];
  const events = await Promise.all(eventIds.map((id) => dataStore.getStoreEvent(id)));
  const eventById = new Map(
    events.filter((event): event is NonNullable<typeof event> => event != null).map((event) => [event.id, event]),
  );

  const byDeckId = new Map<string, DeckEventAssignmentV1[]>();

  for (const signup of withDeck) {
    const event = eventById.get(signup.eventId);
    if (!event || event.published === false) continue;
    if (new Date(event.endAt).getTime() < now) continue;

    const deckId = signup.deck!.deckId;
    const assignment: DeckEventAssignmentV1 = {
      eventId: event.id,
      eventTitle: event.title,
      startAt: event.startAt,
      signupId: signup.id,
      registeredBracket: signup.deck!.bracket,
    };
    const list = byDeckId.get(deckId) ?? [];
    list.push(assignment);
    byDeckId.set(deckId, list);
  }

  for (const [deckId, list] of byDeckId) {
    list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    byDeckId.set(deckId, list);
  }

  return byDeckId;
}
