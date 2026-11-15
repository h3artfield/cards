import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api-utils";
import {
  syncPickupReservations,
  syncPickupReservationsIfStale,
} from "@/lib/pickup/reservations";
import { dataStore } from "@/lib/storage/data-store";

/** Pickup orders for the store; `?sync=1` checks every open one against Shopify now. */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    let sync = null;
    if (req.nextUrl.searchParams.get("sync") === "1") {
      sync = await syncPickupReservations(scope.storeId);
    } else {
      await syncPickupReservationsIfStale(scope.storeId);
    }

    const [reservations, settings] = await Promise.all([
      dataStore.getPickupReservations(scope.storeId),
      dataStore.getSettings(scope.storeId),
    ]);
    return jsonOk({
      reservations,
      sync,
      shopDomain: settings.shopifyIntegration?.shopDomain ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
