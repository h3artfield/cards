import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readAdminSessionFromRequest } from "@/lib/auth/admin-session";
import {
  buildOrderCustomerSnapshot,
  customerCanSubmit,
  customerCanViewOrderHistory,
  customerOwnsOrder,
  getCustomerSession,
  loadCustomer,
  requireCustomerSession,
  resolveStoreForSlug,
} from "@/lib/auth/customer-auth";
import {
  bindCustomerToStore,
  boundStoreName,
  customerCanActAtStore,
  storeMismatchResponse,
} from "@/lib/auth/customer-store-binding";
import { resolveStoreCustomerSettings } from "@/lib/customer-auth-config";
import { dataStore } from "@/lib/storage/data-store";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import type { BuybackOrder } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = requireCustomerSession(req);
    if (session instanceof NextResponse) return session;

    const body = await req.json();
    const storeSlug =
      body.storeSlug != null ? String(body.storeSlug).trim() : undefined;

    const customer = await loadCustomer(session.customerId);
    if (!customer) return jsonError("Customer not found", 404);

    if (customer.isGuest || customer.authProviders.includes("guest")) {
      return jsonError("Create an account to scan cards", 403);
    }

    let store = storeSlug ? await resolveStoreForSlug(storeSlug) : null;
    if (storeSlug && !store) return jsonError("Store not found", 404);
    if (store && !customerCanActAtStore(customer, store.id)) {
      return storeMismatchResponse(await boundStoreName(customer));
    }
    if (!store && customer.storeId) {
      store = await dataStore.getStore(customer.storeId);
    }
    if (!store) {
      return jsonError("Start from your store's page to scan cards", 400);
    }

    const bound = await bindCustomerToStore(customer, store.id);
    const storeId = store.id;

    const settings = resolveStoreCustomerSettings(store);
    if (!customerCanSubmit(bound, settings.emailVerificationMode)) {
      return jsonError("Verify your email before scanning cards", 403);
    }

    const now = new Date().toISOString();
    const orderNumber = await dataStore.nextOrderNumber(storeId);

    const order: BuybackOrder = {
      id: uuidv4(),
      orderNumber,
      customerId: bound.id,
      storeId,
      storeSlug: storeSlug ?? store.storeSlug,
      customer: buildOrderCustomerSnapshot(bound),
      status: "draft",
      createdAt: now,
      manualReviewCount: 0,
    };

    await dataStore.saveOrder(order);
    return jsonOk({ order });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const customerIdParam = req.nextUrl.searchParams.get("customerId");
    const adminSession = readAdminSessionFromRequest(req);
    const customerSession = getCustomerSession(req);

    if (adminSession) {
      if (customerIdParam) {
        const orders = await dataStore.getOrdersByCustomer(customerIdParam);
        return jsonOk({ orders });
      }
      return jsonError("customerId is required for admin order lookup", 400);
    }

    if (!customerSession) {
      return jsonError("Unauthorized", 401);
    }

    if (customerIdParam && customerIdParam !== customerSession.customerId) {
      return jsonError("Forbidden", 403);
    }

    const customer = await loadCustomer(customerSession.customerId);
    if (!customer) return jsonError("Unauthorized", 401);

    const storeSlug = req.nextUrl.searchParams.get("store")?.trim();
    if (storeSlug) {
      const store = await resolveStoreForSlug(storeSlug);
      if (store) {
        const settings = resolveStoreCustomerSettings(store);
        if (!customerCanViewOrderHistory(customer, settings.emailVerificationMode)) {
          return jsonError("Verify your email to view order history", 403);
        }
      }
    }

    const orders = await dataStore.getOrdersByCustomer(customerSession.customerId);
    return jsonOk({ orders });
  } catch (err) {
    return handleRouteError(err);
  }
}
