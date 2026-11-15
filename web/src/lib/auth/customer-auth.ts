import { NextResponse } from "next/server";
import {
  createCustomerSessionToken,
  customerSessionCookieHeader,
  readCustomerSessionFromRequest,
} from "./customer-session";
import { normalizeCustomer } from "./normalize-customer";
import { sanitizeCustomer } from "./sanitize-customer";
import { jsonOk } from "../api-utils";
import { dataStore } from "../storage/data-store";
import type {
  Customer,
  CustomerEmailVerificationMode,
  CustomerSession,
  OrderCustomerInfo,
  StoreSettings,
} from "../types";

export function getCustomerSession(req: Request): CustomerSession | null {
  return readCustomerSessionFromRequest(req);
}

export function requireCustomerSession(
  req: Request,
): CustomerSession | NextResponse {
  const session = getCustomerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function loadCustomer(id: string): Promise<Customer | null> {
  const raw = await dataStore.getCustomer(id);
  if (!raw) return null;
  return normalizeCustomer(raw);
}

export function buildOrderCustomerSnapshot(customer: Customer): OrderCustomerInfo {
  const authProvider = customer.isGuest
    ? "guest"
    : customer.authProviders[0] ?? "email";
  return {
    customerId: customer.id,
    guestId: customer.guestId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    emailVerified: customer.emailVerified,
    authProvider,
  };
}

export function customerCanSubmit(
  customer: Customer,
  mode: CustomerEmailVerificationMode,
): boolean {
  if (!customer.emailVerified && mode === "required_before_submit") {
    return false;
  }
  return true;
}

export function customerCanViewOrderHistory(
  customer: Customer,
  mode: CustomerEmailVerificationMode,
): boolean {
  if (!customer.emailVerified && mode === "required_before_order_history") {
    return false;
  }
  return true;
}

export function customerSessionResponse(
  customer: Customer,
  extra?: Record<string, unknown>,
): NextResponse {
  const session: CustomerSession = {
    customerId: customer.id,
    email: customer.email,
    role: "customer",
  };
  const token = createCustomerSessionToken(session);
  const response = jsonOk({
    customer: sanitizeCustomer(customer),
    token,
    ...extra,
  });
  response.headers.set("Set-Cookie", customerSessionCookieHeader(token));
  return response;
}

export async function touchCustomerLogin(customer: Customer): Promise<Customer> {
  const now = new Date().toISOString();
  const updated = normalizeCustomer({
    ...customer,
    lastLoginAt: now,
    updatedAt: now,
  });
  await dataStore.upsertCustomer(updated);
  return updated;
}

export function customerOwnsOrder(
  session: CustomerSession,
  order: { customerId: string; customer?: OrderCustomerInfo },
): boolean {
  if (order.customerId === session.customerId) return true;
  if (order.customer?.customerId === session.customerId) return true;
  return false;
}

export type CustomerHomeStoreSummary = {
  id: string;
  slug: string;
  storeName: string;
  storeLogoUrl?: string;
};

export async function customerHomeStoreSummary(
  customer: Customer,
): Promise<CustomerHomeStoreSummary | null> {
  const storeId = customer.storeId?.trim();
  if (!storeId) return null;
  const store = await dataStore.getSettings(storeId);
  if (!store) return null;
  return {
    id: store.id,
    slug: store.storeSlug,
    storeName: store.storeName,
    storeLogoUrl: store.storeLogoUrl,
  };
}

export async function resolveStoreForSlug(
  storeSlug: string | undefined,
): Promise<StoreSettings | null> {
  if (!storeSlug?.trim()) return null;
  const cleaned = storeSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return dataStore.getStoreBySlug(cleaned);
}
