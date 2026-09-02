import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getTradeCreditLedger } from "@/lib/trade-credit/trade-credit-ledger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const { customerId } = await params;
    const customer = await dataStore.getCustomer(customerId);
    if (!customer) return jsonError("Customer not found", 404);
    if (customer.storeId && customer.storeId !== scope.storeId) {
      return jsonError("Customer belongs to another store", 403);
    }

    const { balance, entries } = await getTradeCreditLedger(
      scope.storeId,
      customerId,
    );

    return jsonOk({ balance, entries });
  } catch (err) {
    return handleRouteError(err);
  }
}
