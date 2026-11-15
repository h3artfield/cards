import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { TOKEN_PRODUCTION_FLOW_V1 } from "@/lib/token-creator/orders-v1";
import { getTokenOrderV1, updateTokenOrderV1 } from "@/lib/token-creator/store-v1";
import type { TokenProductionStateV1 } from "@/lib/token-creator/types-v1";

const ALLOWED = new Set<TokenProductionStateV1>([...TOKEN_PRODUCTION_FLOW_V1, "cancelled"]);

/**
 * Moves a paid order along Paid → Ready for print → Printing → Printed →
 * Fulfilled. Unpaid orders cannot be released: production only starts once
 * Shopify has confirmed payment.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;
    const { id } = await params;

    const body = (await req.json()) as { productionState?: unknown };
    const state = body.productionState as TokenProductionStateV1;
    if (!ALLOWED.has(state)) return jsonError("Unknown status");

    const existing = await getTokenOrderV1(id);
    if (!existing || existing.storeId !== scope.storeId) return jsonError("Order not found", 404);
    if (existing.paymentState !== "paid" && state !== "cancelled") {
      return jsonError("This order has not been paid in Shopify yet, so it cannot be printed.", 409);
    }

    const by = (auth as { email?: string }).email ?? "staff";
    const order = await updateTokenOrderV1(id, (current) =>
      current.productionState === state
        ? null
        : {
            ...current,
            productionState: state,
            statusHistory: [...current.statusHistory, { at: new Date().toISOString(), state, by }],
          },
    );
    return jsonOk({ order });
  } catch (err) {
    return handleRouteError(err);
  }
}
