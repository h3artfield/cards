import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { cancelPickupReservation } from "@/lib/pickup/reservations";
import { formatShopifyApiErrorMessage } from "@/lib/shopify/client";
import { dataStore } from "@/lib/storage/data-store";

/** Deletes the Shopify draft, which puts the held cards back on sale. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const { id } = await params;
    const reservation = await dataStore.getPickupReservation(id);
    if (!reservation || reservation.storeId !== scope.storeId) {
      return jsonError("Pickup order not found", 404);
    }

    try {
      const updated = await cancelPickupReservation(reservation);
      return jsonOk({ reservation: updated });
    } catch (err) {
      return jsonError(formatShopifyApiErrorMessage(err), 409);
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
