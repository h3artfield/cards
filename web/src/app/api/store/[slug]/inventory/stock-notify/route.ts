import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  loadCustomer,
  requireCustomerSession,
} from "@/lib/auth/customer-auth";
import {
  boundStoreName,
  customerCanActAtStore,
  storeMismatchResponse,
} from "@/lib/auth/customer-store-binding";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { createStockNotifyRequest } from "@/lib/inventory/stock-notify-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const session = requireCustomerSession(req);
    if (session instanceof Response) return session;

    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const customer = await loadCustomer(session.customerId);
    if (!customer?.email) return jsonError("Customer email required", 400);
    if (!customerCanActAtStore(customer, store.id)) {
      return storeMismatchResponse(await boundStoreName(customer));
    }

    const body = (await req.json()) as { cardNames?: string[] };
    const cardNames = Array.isArray(body.cardNames) ? body.cardNames : [];
    if (cardNames.length === 0) {
      return jsonError("cardNames required", 400);
    }

    const request = await createStockNotifyRequest({
      customerId: session.customerId,
      customerEmail: customer.email,
      storeId: store.id,
      storeSlug: slug,
      cardNames,
    });

    return jsonOk({ ok: true, requestId: request.id, cardCount: request.cardNames.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
