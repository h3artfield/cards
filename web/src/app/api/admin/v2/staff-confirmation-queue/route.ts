import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { buildStaffConfirmationQueue } from "@/lib/card-flow-v2/staff-confirmation-queue";

export async function GET(req: NextRequest) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return auth;

  try {
    const orders = await dataStore.getOrders();
    const orderNumbers: Record<string, string> = {};
    const cards = [];
    for (const order of orders) {
      orderNumbers[order.id] = order.orderNumber ?? order.id;
      const orderCards = await dataStore.getCardsByOrder(order.id);
      for (const card of orderCards) {
        if (card.cardFlowV2Identity?.suspects.length) {
          cards.push(card);
        }
      }
    }

    const queue = buildStaffConfirmationQueue(cards, orderNumbers);
    return jsonOk({ queue, total: queue.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
