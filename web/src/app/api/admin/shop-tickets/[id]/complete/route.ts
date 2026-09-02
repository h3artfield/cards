import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { invalidateStoreInventoryCache } from "@/lib/deck-builder/store-inventory-cache";
import { completeShopTicket } from "@/lib/shop-tickets/complete-ticket";
import { dataStore } from "@/lib/storage/data-store";

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
    const ticket = await dataStore.getShopTicket(id);
    if (!ticket || ticket.storeId !== scope.storeId) {
      return jsonError("Ticket not found", 404);
    }

    const body = (await req.json().catch(() => ({}))) as {
      tradeCredit?: number;
    };

    const store = await dataStore.getSettings(scope.storeId);
    const result = await completeShopTicket({
      ticket,
      store,
      creditRequested: Number(body.tradeCredit ?? 0),
      adminId: auth.userId,
      adminName: auth.email,
    });

    if (!result.ok) {
      return jsonError(result.error, 400, { problems: result.problems });
    }

    invalidateStoreInventoryCache(scope.storeId);

    return jsonOk({
      ticket: result.ticket,
      creditApplied: result.creditApplied,
      creditRemaining: result.creditRemaining,
      soldItemIds: result.soldItemIds,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
