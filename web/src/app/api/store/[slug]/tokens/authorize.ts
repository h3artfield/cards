import type { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api-utils";
import { getCustomerSession, loadCustomer, resolveStoreForSlug } from "@/lib/auth/customer-auth";
import {
  boundStoreName,
  customerCanActAtStore,
  storeMismatchResponse,
} from "@/lib/auth/customer-store-binding";
import type { Customer, StoreSettings } from "@/lib/types";

export type TokenCreatorAuthV1 =
  | { error: NextResponse }
  | { error?: undefined; store: StoreSettings; customer: Customer };

/**
 * Token Creator is for signed-in customers only: every generation costs real
 * money, so there is no guest path. Records are always checked against the
 * caller's id afterwards, so a guessed id returns 404, not someone's art.
 */
export async function authorizeTokenCreatorV1(req: NextRequest, slug: string): Promise<TokenCreatorAuthV1> {
  const store = await resolveStoreForSlug(slug);
  if (!store) return { error: jsonError("Store not found", 404) };
  const session = getCustomerSession(req);
  if (!session) return { error: jsonError("Sign in to use Token Creator", 401) };
  const customer = await loadCustomer(session.customerId);
  if (!customer) return { error: jsonError("Sign in to use Token Creator", 401) };
  if (!customerCanActAtStore(customer, store.id)) {
    return { error: storeMismatchResponse(await boundStoreName(customer)) };
  }
  return { store, customer };
}
