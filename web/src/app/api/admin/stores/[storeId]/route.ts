import { NextRequest } from "next/server";
import {
  createAdminSessionToken,
  adminSessionCookieHeader,
} from "@/lib/auth/admin-session";
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
import type { AdminSession } from "@/lib/types";

type RouteContext = { params: Promise<{ storeId: string }> };

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const forbidden = requirePlatformAdmin(auth);
    if (forbidden) return forbidden;

    const { storeId } = await context.params;
    const id = storeId?.trim();
    if (!id) return jsonError("Store id is required", 400);

    const body = await req.json().catch(() => ({}));
    if (!isAdminDeleteConfirmed(body.confirm)) {
      return jsonError(`Type "${ADMIN_DELETE_CONFIRM_WORD}" to confirm`, 400);
    }

    const store = await dataStore.getStore(id);
    if (!store) return jsonError("Store not found", 404);

    const result = await dataStore.deleteStoreCompletely(id);

    await dataStore.logAdminAction({
      action: "delete_store",
      adminEmail: auth.email,
      storeId: id,
      storeName: store.storeName,
      counts: {
        orders: result.orders,
        cards: result.cards,
        customers: result.customers,
        inventory: result.inventory,
        transactions: result.transactions,
        feedback: result.feedback,
        rules: result.rules,
      },
      ownerDeleted: result.ownerDeleted,
    });

    const response = jsonOk({ ok: true, result });
    if (auth.activeStoreId === id) {
      const session: AdminSession = { ...auth, activeStoreId: undefined };
      const token = createAdminSessionToken(session);
      response.headers.set("Set-Cookie", adminSessionCookieHeader(token));
    }

    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
