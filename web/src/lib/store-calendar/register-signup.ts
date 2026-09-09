import { dataStore } from "@/lib/storage/data-store";
import { normalizeStoreEventSignupInput } from "@/lib/store-calendar/normalize";
import {
  eventAcceptsSignups,
  spotsRemaining,
} from "@/lib/store-calendar/signup-utils";
import type {
  StoreEvent,
  StoreEventSignup,
  StoreEventSignupDeck,
} from "@/lib/store-calendar/types";
import { sendEventSignupConfirmationEmail } from "@/lib/store-calendar/event-email";

export type RegisterEventSignupInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  customerId?: string;
  /** Already resolved from the player's own deck by the caller, never trusted
   *  from the request body. */
  deck?: StoreEventSignupDeck;
};

export type RegisterEventSignupResult =
  | { ok: true; signup: StoreEventSignup; spotsRemaining: number | null }
  | { ok: false; error: string; status: number };

export async function registerEventSignup(
  storeId: string,
  storeName: string,
  storeSlug: string,
  event: StoreEvent,
  input: RegisterEventSignupInput,
  timeZone?: string,
): Promise<RegisterEventSignupResult> {
  if (event.storeId !== storeId || event.published === false) {
    return { ok: false, error: "Event not found", status: 404 };
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Valid email is required", status: 400 };
  }
  if (!input.firstName.trim()) {
    return { ok: false, error: "First name is required", status: 400 };
  }

  const existing = await dataStore.getEventSignupByEmail(event.id, email);
  if (existing) {
    return { ok: false, error: "You are already signed up for this event", status: 409 };
  }

  const signupCount = await dataStore.countEventSignups(event.id);
  if (!eventAcceptsSignups(event, signupCount)) {
    return { ok: false, error: "This event is full", status: 409 };
  }

  const signup = normalizeStoreEventSignupInput(
    {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone: input.phone?.trim() || undefined,
      customerId: input.customerId,
      deck: input.deck,
    },
    { storeId, eventId: event.id, customerId: input.customerId },
  );

  await dataStore.saveEventSignup(signup);

  void sendEventSignupConfirmationEmail(
    signup,
    event,
    storeName,
    storeSlug,
    timeZone,
  ).catch((err) => console.error("[event-signup-email]", err));

  const nextCount = signupCount + 1;
  return {
    ok: true,
    signup,
    spotsRemaining: spotsRemaining(event, nextCount),
  };
}
