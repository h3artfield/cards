import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const transactions = await dataStore.getTransactions(scope.storeId);

    const totals = transactions.reduce(
      (acc, tx) => {
        if (tx.type === "cash") {
          acc.cashTotal += tx.amount;
          acc.cashCount += 1;
        } else if (tx.type === "trade") {
          acc.tradeTotal += tx.amount;
          acc.tradeCount += 1;
        } else if (tx.type === "cancelled") {
          acc.cancelledCount += 1;
        }
        return acc;
      },
      { cashTotal: 0, tradeTotal: 0, cashCount: 0, tradeCount: 0, cancelledCount: 0 },
    );

    return jsonOk({ transactions, totals });
  } catch (err) {
    return handleRouteError(err);
  }
}
