import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  createAdminSessionToken,
  adminSessionCookieHeader,
} from "@/lib/auth/admin-session";
import {
  ensureStoreOwnerAccount,
  validateStoreOwnerEmail,
} from "@/lib/auth/ensure-store-owner";
import {
  requireAdminSession,
  requirePlatformAdmin,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import { ensureSeedData } from "@/lib/storage/ensure-seed";
import { normalizeStoreSlug } from "@/lib/store-slug";
import { DEFAULT_STORE_SETTINGS } from "@/lib/constants";
import type { AdminSession, StoreSettings } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await ensureSeedData();
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    if (auth.role === "store" && auth.storeId) {
      const store = await dataStore.getStore(auth.storeId);
      return jsonOk({ stores: store ? [store] : [] });
    }

    const forbidden = requirePlatformAdmin(auth);
    if (forbidden) return forbidden;

    const stores = await dataStore.listStores();
    return jsonOk({ stores });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeedData();
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const forbidden = requirePlatformAdmin(auth);
    if (forbidden) return forbidden;

    const body = await req.json();
    const storeName = String(body.storeName ?? "").trim();
    const ownerEmail = String(body.ownerEmail ?? "")
      .trim()
      .toLowerCase();
    const ownerPassword = String(body.ownerPassword ?? "");
    const slugInput = body.storeSlug != null ? String(body.storeSlug) : undefined;

    if (!storeName) return jsonError("Store name is required");
    if (!ownerEmail) return jsonError("Owner email is required");
    if (!ownerPassword) {
      return jsonError("Owner password is required for the store login");
    }

    const storeSlug = normalizeStoreSlug(slugInput, storeName);
    const existing = await dataStore.getStoreBySlug(storeSlug);
    if (existing) return jsonError("A store with this URL slug already exists", 409);

    const storeId = uuidv4();

    try {
      await validateStoreOwnerEmail(storeId, ownerEmail);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid store owner email";
      return jsonError(message, 409);
    }

    const store: StoreSettings = {
      ...DEFAULT_STORE_SETTINGS,
      id: storeId,
      storeName,
      storeSlug,
      ownerEmail,
    };

    await dataStore.saveStore(store);

    try {
      await ensureStoreOwnerAccount(storeId, ownerEmail, ownerPassword);
    } catch (err) {
      await dataStore.deleteStore(storeId);
      const message = err instanceof Error ? err.message : "Could not create store owner";
      return jsonError(message, 409);
    }

    const session: AdminSession = {
      ...auth,
      activeStoreId: store.id,
    };
    const token = createAdminSessionToken(session);
    const response = jsonOk({ store });
    response.headers.set("Set-Cookie", adminSessionCookieHeader(token));
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
