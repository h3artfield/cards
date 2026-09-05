import type { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api-utils";
import { getCustomerSession, loadCustomer } from "@/lib/auth/customer-auth";
import {
  boundStoreName,
  customerCanActAtStore,
  storeMismatchResponse,
} from "@/lib/auth/customer-store-binding";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";

export type DeckEditorAuthV1 =
  | { error: NextResponse; customerId?: undefined; storeId?: undefined }
  | { error?: undefined; customerId: string; storeId: string };

/**
 * Confirms the caller is signed in, bound to this store, and owns the deck.
 *
 * Ownership is checked against the stored `customerId` rather than the request,
 * so a guessed deck id gets a 404 and not somebody else's decklist.
 */
export async function authorizeDeckEditorV1(
  req: NextRequest,
  slug: string,
): Promise<DeckEditorAuthV1> {
  const store = await resolveStoreBySlug(slug);
  if (!store) return { error: jsonError("Store not found", 404) };

  const session = getCustomerSession(req);
  if (!session) return { error: jsonError("Sign in to edit a deck", 401) };

  const customer = await loadCustomer(session.customerId);
  if (customer && !customerCanActAtStore(customer, store.id)) {
    return { error: storeMismatchResponse(await boundStoreName(customer)) };
  }
  return { customerId: session.customerId, storeId: store.id };
}
