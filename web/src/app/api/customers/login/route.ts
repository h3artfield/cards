import { NextRequest } from "next/server";
import {
  verifyCustomerPassword,
} from "@/lib/auth/customer-password";
import {
  customerHomeStoreSummary,
  customerSessionResponse,
  resolveStoreForSlug,
  touchCustomerLogin,
} from "@/lib/auth/customer-auth";
import {
  bindCustomerToStore,
  boundStoreName,
  customerCanActAtStore,
  storeMismatchResponse,
} from "@/lib/auth/customer-store-binding";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const storeSlug =
      body.storeSlug != null ? String(body.storeSlug).trim() : undefined;

    if (!email || !password) {
      return jsonError("Email and password are required");
    }

    const store = await resolveStoreForSlug(storeSlug);
    if (storeSlug && !store) {
      return jsonError("Store not found", 404);
    }

    const raw = await dataStore.getCustomerByEmail(email);
    if (!raw?.passwordHash) {
      return jsonError("Invalid email or password", 401);
    }

    const customer = normalizeCustomer(raw);
    const valid = await verifyCustomerPassword(password, customer.passwordHash!);
    if (!valid) {
      return jsonError("Invalid email or password", 401);
    }

    let bound = customer;
    if (store) {
      if (!customerCanActAtStore(customer, store.id)) {
        return storeMismatchResponse(await boundStoreName(customer));
      }
      bound = await bindCustomerToStore(customer, store.id);
    }

    const loggedIn = await touchCustomerLogin(bound);
    return customerSessionResponse(loggedIn, {
      store: await customerHomeStoreSummary(loggedIn),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
