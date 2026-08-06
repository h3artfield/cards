import { NextRequest, NextResponse } from "next/server";
import { readAdminSessionFromRequest } from "@/lib/auth/admin-session";
import {
  customerOwnsOrder,
  getCustomerSession,
  loadCustomer,
} from "@/lib/auth/customer-auth";
import {
  sanitizeCardsForCustomer,
  sanitizeOrderForCustomer,
} from "@/lib/customer-order-view";
import { dataStore } from "@/lib/storage/data-store";
import { jsonOk, jsonError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import { enrichCardClerkPricingIfNeeded } from "@/lib/card-flow-v2/enrich-card-clerk-pricing";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const order = await dataStore.getOrder(id);
  if (!order) return jsonError("Order not found", 404);

  const adminSession = readAdminSessionFromRequest(req);
  const customerSession = getCustomerSession(req);

  if (adminSession) {
    const customer = await dataStore.getCustomer(order.customerId);
    const storeId = order.storeId?.trim() || DEFAULT_STORE_ID;
    const [settings, rules] = await Promise.all([
      dataStore.getSettings(storeId),
      dataStore.getActiveRules(storeId),
    ]);
    const rawCards = await dataStore.getCardsByOrder(id);
    const cards: typeof rawCards = [];
    for (const card of rawCards) {
      const { card: enriched, changed } = await enrichCardClerkPricingIfNeeded({
        card,
        settings,
        rules,
      });
      if (changed) {
        await dataStore.saveCard(enriched);
      }
      cards.push(enriched);
    }
    return jsonOk({ order, customer, cards });
  }

  if (!customerSession || !customerOwnsOrder(customerSession, order)) {
    return jsonError("Forbidden", 403);
  }

  const customer = await loadCustomer(order.customerId);
  const cards = await dataStore.getCardsByOrder(id);

  return jsonOk({
    order: sanitizeOrderForCustomer(order),
    customer: customer ? { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, email: customer.email } : null,
    cards: sanitizeCardsForCustomer(cards),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const order = await dataStore.getOrder(id);
  if (!order) return jsonError("Order not found", 404);

  const adminSession = readAdminSessionFromRequest(req);
  if (!adminSession) {
    return jsonError("Forbidden", 403);
  }

  const body = await req.json();
  const updated = { ...order, ...body, id: order.id };
  await dataStore.saveOrder(updated);
  return jsonOk({ order: updated });
}
