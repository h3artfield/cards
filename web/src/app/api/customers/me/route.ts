import { NextRequest } from "next/server";
import {
  customerCanViewOrderHistory,
  getCustomerSession,
  loadCustomer,
} from "@/lib/auth/customer-auth";
import { sanitizeCustomer } from "@/lib/auth/sanitize-customer";
import { resolveStoreCustomerSettings } from "@/lib/customer-auth-config";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

export async function GET(req: NextRequest) {
  try {
    const session = getCustomerSession(req);
    if (!session) {
      return jsonError("Unauthorized", 401);
    }

    const customer = await loadCustomer(session.customerId);
    if (!customer || customer.email !== session.email) {
      return jsonError("Unauthorized", 401);
    }

    let canViewOrderHistory = true;
    const storeSlug = req.nextUrl.searchParams.get("store")?.trim();
    if (storeSlug) {
      const store = await dataStore.getStoreBySlug(storeSlug);
      if (store) {
        const settings = resolveStoreCustomerSettings(store);
        canViewOrderHistory = customerCanViewOrderHistory(
          customer,
          settings.emailVerificationMode,
        );
      }
    }

    // Customers are locked to the store they signed up at, so the account
    // pages can rely on this instead of guessing from session storage.
    const homeStore = customer.storeId
      ? await dataStore.getSettings(customer.storeId)
      : null;

    return jsonOk({
      customer: sanitizeCustomer(customer),
      canViewOrderHistory,
      store: homeStore
        ? {
            id: homeStore.id,
            slug: homeStore.storeSlug,
            storeName: homeStore.storeName,
            storeLogoUrl: homeStore.storeLogoUrl,
          }
        : null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
