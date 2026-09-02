import { NextResponse } from "next/server";
import {
  getCustomerSession,
  loadCustomer,
  resolveStoreForSlug,
} from "./customer-auth";
import { normalizeCustomer } from "./normalize-customer";
import { dataStore } from "../storage/data-store";
import type { Customer, StoreSettings } from "../types";

export const STORE_MISMATCH_CODE = "STORE_MISMATCH";

/** One email, one store — set once at signup and never reassigned by the customer. */
export function isCustomerBoundToStore(customer: Customer): boolean {
  return Boolean(customer.storeId?.trim());
}

/** Bound customers act only at their own store; unbound (legacy) accounts adopt the first store they use. */
export function customerCanActAtStore(
  customer: Customer,
  storeId: string,
): boolean {
  const bound = customer.storeId?.trim();
  if (!bound) return true;
  return bound === storeId;
}

export function storeMismatchResponse(boundStoreName?: string): NextResponse {
  const where = boundStoreName ? ` (${boundStoreName})` : "";
  return NextResponse.json(
    {
      error: `This account is registered to a different store${where}. Orders and trade credit stay with the store you signed up at.`,
      code: STORE_MISMATCH_CODE,
    },
    { status: 403 },
  );
}

/** Backfill storeId on accounts created before binding was enforced. */
export async function bindCustomerToStore(
  customer: Customer,
  storeId: string,
): Promise<Customer> {
  if (customer.storeId?.trim()) return customer;

  const bound = normalizeCustomer({
    ...customer,
    storeId,
    updatedAt: new Date().toISOString(),
  });
  await dataStore.upsertCustomer(bound);
  return bound;
}

export type CustomerStoreContext = {
  customer: Customer;
  store: StoreSettings;
};

/**
 * Gate for signed-in customer actions at one store: real account (no guests),
 * store exists, and the account is bound to it.
 */
export async function requireCustomerAtStore(
  req: Request,
  slug: string,
): Promise<CustomerStoreContext | NextResponse> {
  const session = getCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await resolveStoreForSlug(slug);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const customer = await loadCustomer(session.customerId);
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (customer.isGuest || customer.authProviders.includes("guest")) {
    return NextResponse.json(
      { error: "Create an account to scan cards" },
      { status: 403 },
    );
  }

  if (!customerCanActAtStore(customer, store.id)) {
    return storeMismatchResponse(await boundStoreName(customer));
  }

  return { customer, store };
}

/** Store name for a mismatch message — best effort, never throws. */
export async function boundStoreName(
  customer: Customer,
): Promise<string | undefined> {
  const bound = customer.storeId?.trim();
  if (!bound) return undefined;
  try {
    const store = await dataStore.getStore(bound);
    return store?.storeName;
  } catch {
    return undefined;
  }
}
