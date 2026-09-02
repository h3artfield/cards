import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import type { ShopTicket } from "@/lib/types";

/** Cancel an open ticket. Completed tickets moved money and stay on the books. */
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
    if (ticket.status === "completed") {
      return jsonError(
        `Ticket ${ticket.ticketNumber} is completed — it cannot be voided.`,
      );
    }

    const now = new Date().toISOString();
    const voided: ShopTicket = {
      ...ticket,
      status: "voided",
      voidedAt: now,
      updatedAt: now,
    };
    await dataStore.saveShopTicket(voided);

    await dataStore.logAdminAction({
      action: "shop_ticket_voided",
      adminId: auth.userId,
      metadata: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
    });

    return jsonOk({ ticket: voided });
  } catch (err) {
    return handleRouteError(err);
  }
}
