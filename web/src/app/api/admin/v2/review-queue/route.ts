import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { buildV2ReviewQueue } from "@/lib/card-flow-v2/v2-review-queue";

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
        if (
          card.cardFlowV2Evidence ||
          card.cardFlowV2Identity ||
          card.cardFlowV2Market
        ) {
          cards.push(card);
        }
      }
    }

    const queue = buildV2ReviewQueue(cards, orderNumbers);
    return jsonOk({ queue, total: queue.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
