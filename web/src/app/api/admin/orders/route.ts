import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import { summarizeOrderReports } from "@/lib/reports/store-strategic-report";
import { repairStuckProcessingOrder } from "@/lib/processing/repair-stuck-order";
import { countOrderCardsProcessed } from "@/lib/order-processing-progress";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const orders = await dataStore.getOrders(scope.storeId);
    const enriched = await Promise.all(
      orders.map(async (order) => {
        const customer = await dataStore.getCustomer(order.customerId);
        const cards = await dataStore.getCardsByOrder(order.id);
        const repaired = await repairStuckProcessingOrder(
          order,
          cards,
          (o) => dataStore.saveOrder(o),
        );
        return {
          order: repaired,
          customer,
          cardCount: cards.length,
          cardsProcessedCount: countOrderCardsProcessed(cards),
          reportSummary: summarizeOrderReports(cards),
        };
      }),
    );

    return jsonOk({ orders: enriched });
  } catch (err) {
    return handleRouteError(err);
  }
}
