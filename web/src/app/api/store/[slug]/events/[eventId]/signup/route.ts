import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { getCustomerSession, loadCustomer } from "@/lib/auth/customer-auth";
import {
  boundStoreName,
  customerCanActAtStore,
  storeMismatchResponse,
} from "@/lib/auth/customer-store-binding";
import { registerEventSignup } from "@/lib/store-calendar/register-signup";
import { resolveSignupDeckV1 } from "@/lib/store-calendar/signup-deck-v1";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";
import type { StoreEventSignupDeck } from "@/lib/store-calendar/types";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; eventId: string }> },
) {
  try {
    const { slug, eventId } = await context.params;
    const store = await dataStore.getStoreBySlug(slug);
    if (!store) {
      return jsonError("Store not found", 404);
    }

    const calendar = store.calendarSettings;
    if (calendar?.enabled === false || calendar?.published !== true) {
      return jsonError("Calendar not available", 404);
    }

    const event = await dataStore.getStoreEvent(eventId);
    if (!event || event.storeId !== store.id) {
      return jsonError("Event not found", 404);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const session = getCustomerSession(request);
    if (session) {
      const customer = await loadCustomer(session.customerId);
      if (customer && !customerCanActAtStore(customer, store.id)) {
        return storeMismatchResponse(await boundStoreName(customer));
      }
    }

    /**
     * A deck can only be registered by the signed-in owner of that deck. The
     * request supplies an id and nothing else; the commander and the bracket
     * are read from the stored deck, so a player cannot register a cEDH list
     * as bracket 2 by editing the request.
     */
    const requestedDeckId =
      typeof body.deckId === "string" ? body.deckId.trim() : "";
    let signupDeck: StoreEventSignupDeck | undefined;

    if (requestedDeckId) {
      if (!session) {
        return jsonError("Sign in to register a deck for this event", 401);
      }
      const resolved = await resolveSignupDeckV1({
        deckId: requestedDeckId,
        customerId: session.customerId,
        storeId: store.id,
      });
      if (!resolved.ok) {
        return jsonError(resolved.error, resolved.status);
      }
      signupDeck = resolved.deck;
    }

    const timeZone =
      calendar?.timezone ?? DEFAULT_CALENDAR_SETTINGS.timezone;

    const result = await registerEventSignup(
      store.id,
      store.storeName,
      store.storeSlug,
      event,
      {
        firstName: String(body.firstName ?? body.first_name ?? ""),
        lastName: String(body.lastName ?? body.last_name ?? ""),
        email: String(body.email ?? session?.email ?? ""),
        phone: body.phone != null ? String(body.phone) : undefined,
        customerId: session?.customerId,
        deck: signupDeck,
      },
      timeZone,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonOk(
      {
        signup: {
          id: result.signup.id,
          firstName: result.signup.firstName,
          lastName: result.signup.lastName,
          email: result.signup.email,
        },
        spotsRemaining: result.spotsRemaining,
      },
      201,
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
