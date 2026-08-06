import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requirePlatformAdmin,
  requireStoreScope,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { setStoreOwnerPassword } from "@/lib/auth/ensure-store-owner";
import { dataStore } from "@/lib/storage/data-store";

/** Platform admin: set or reset a store owner's /store/login password. */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const forbidden = requirePlatformAdmin(auth);
    if (forbidden) return forbidden;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = await req.json();
    const newPassword = String(body.newPassword ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!newPassword) {
      return jsonError("New password is required");
    }
    if (newPassword !== confirmPassword) {
      return jsonError("Passwords do not match");
    }

    try {
      await setStoreOwnerPassword(scope.storeId, newPassword);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not set password";
      return jsonError(message, 400);
    }

    const settings = await dataStore.getSettings(scope.storeId);
    await dataStore.logAdminAction({
      action: "set_store_owner_password",
      storeId: scope.storeId,
      ownerEmail: settings.ownerEmail,
      adminEmail: auth.email,
    });

    return jsonOk({ ok: true, ownerEmail: settings.ownerEmail });
  } catch (err) {
    return handleRouteError(err);
  }
}
