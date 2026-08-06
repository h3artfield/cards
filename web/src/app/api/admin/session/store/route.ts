import { NextRequest } from "next/server";
import {
  createAdminSessionToken,
  adminSessionCookieHeader,
} from "@/lib/auth/admin-session";
import {
  requireAdminSession,
  requirePlatformAdmin,
  sanitizeAdminSession,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import type { AdminSession } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const forbidden = requirePlatformAdmin(auth);
    if (forbidden) return forbidden;

    const body = await req.json();
    const storeId = String(body.storeId ?? "").trim();
    if (!storeId) return jsonError("storeId is required");

    const store = await dataStore.getStore(storeId);
    if (!store) return jsonError("Store not found", 404);

    const session: AdminSession = {
      ...auth,
      activeStoreId: store.id,
    };
    const token = createAdminSessionToken(session);
    const response = jsonOk({
      session: sanitizeAdminSession(session),
      store,
    });
    response.headers.set("Set-Cookie", adminSessionCookieHeader(token));
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
