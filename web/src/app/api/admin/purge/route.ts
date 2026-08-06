import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requirePlatformAdmin,
} from "@/lib/admin-auth";
import {
  ADMIN_DELETE_CONFIRM_WORD,
  isAdminDeleteConfirmed,
} from "@/lib/admin-delete-confirm";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const forbidden = requirePlatformAdmin(auth);
    if (forbidden) return forbidden;

    const body = await req.json();
    if (!isAdminDeleteConfirmed(body.confirm)) {
      return jsonError(`Type "${ADMIN_DELETE_CONFIRM_WORD}" to confirm`, 400);
    }

    const storeId =
      body.storeId != null ? String(body.storeId).trim() : undefined;
    if (storeId) {
      const store = await dataStore.getStore(storeId);
      if (!store) return jsonError("Store not found", 404);
    }

    const result = await dataStore.purgeCustomerData(storeId);
    await dataStore.logAdminAction({
      action: "purge_customer_data",
      adminEmail: auth.email,
      storeIds: result.storeIds,
      counts: {
        orders: result.orders,
        cards: result.cards,
        customers: result.customers,
        inventory: result.inventory,
        transactions: result.transactions,
        feedback: result.feedback,
      },
    });

    return jsonOk({ ok: true, result });
  } catch (err) {
    return handleRouteError(err);
  }
}
