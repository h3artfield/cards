import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { sanitizeCustomers } from "@/lib/auth/sanitize-customer";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const customers = await dataStore.getCustomers(scope.storeId);
    return jsonOk({ customers: sanitizeCustomers(customers) });
  } catch (err) {
    return handleRouteError(err);
  }
}
