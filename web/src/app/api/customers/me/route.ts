import { NextRequest } from "next/server";
import {
  customerCanViewOrderHistory,
  customerHomeStoreSummary,
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

    return jsonOk({
      customer: sanitizeCustomer(customer),
      canViewOrderHistory,
      store: await customerHomeStoreSummary(customer),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
