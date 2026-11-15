import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

/** Records that a paid-online pickup order was handed to the customer. */
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
    if (reservation.status !== "completed") {
      return jsonError("This order hasn't been paid yet.", 409);
    }

    const now = new Date().toISOString();
    const updated = await dataStore.savePickupReservation({
      ...reservation,
      pickedUpAt: reservation.pickedUpAt ?? now,
      updatedAt: now,
    });
    return jsonOk({ reservation: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
