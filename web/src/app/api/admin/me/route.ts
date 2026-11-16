import { NextRequest } from "next/server";
import {
  requireAdminSession,
  sanitizeAdminSession,
} from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import { ensureSeedData } from "@/lib/storage/ensure-seed";
import { storeHasActiveSubscription } from "@/lib/subscription-access";
import { getStaffContext } from "@/lib/staff/owner-access";

export async function GET(req: NextRequest) {
  try {
    await ensureSeedData();
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    let activeStore = auth.activeStoreId
      ? await dataStore.getStore(auth.activeStoreId)
      : null;

    if (auth.role === "store" && auth.storeId) {
      activeStore = await dataStore.getStore(auth.storeId);
    }

    const subscriptionActive =
      auth.role === "platform" || storeHasActiveSubscription(activeStore);

    const staffCtx =
      auth.role === "store" && auth.storeId
        ? await getStaffContext(req, auth.storeId)
        : { setupNeeded: false, staff: null };

    return jsonOk({
      session: sanitizeAdminSession(auth),
      staff: staffCtx.staff,
      staffSetupNeeded: staffCtx.setupNeeded,
      activeStore: activeStore
        ? {
            id: activeStore.id,
            storeName: activeStore.storeName,
            storeSlug: activeStore.storeSlug,
            storeLogoUrl: activeStore.storeLogoUrl ?? null,
          }
        : null,
      subscription: activeStore?.subscription ?? null,
      subscriptionActive,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
