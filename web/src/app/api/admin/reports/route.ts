import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { ensureSeedData } from "@/lib/storage/ensure-seed";
import { buildStoreStrategicReport } from "@/lib/reports/store-strategic-report";

export async function POST(req: NextRequest) {
  try {
    await ensureSeedData();
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const report = await buildStoreStrategicReport(scope.storeId, {
      getStore: (id) => dataStore.getStore(id),
      getOrders: (id) => dataStore.getOrders(id),
      getCardsByOrder: (id) => dataStore.getCardsByOrder(id),
      getTransactions: (id) => dataStore.getTransactions(id),
      getInventory: (id) => dataStore.getInventory(id),
      getRules: (id) => dataStore.getRules(id),
    });

    if (!report) {
      return jsonError("Store not found", 404);
    }

    await dataStore.logAdminAction({
      action: "generate_strategic_report",
      storeId: scope.storeId,
      adminEmail: auth.email,
    });

    return jsonOk({ report });
  } catch (err) {
    return handleRouteError(err);
  }
}
