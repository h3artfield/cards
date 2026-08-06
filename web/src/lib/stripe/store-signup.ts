import { v4 as uuidv4 } from "uuid";
import {
  createAdminSessionToken,
  adminSessionCookieHeader,
} from "@/lib/auth/admin-session";
import { ensureStoreOwnerAccount, validateStoreOwnerEmail } from "@/lib/auth/ensure-store-owner";
import { getAppBaseUrl, getStripeStorePriceId, stripeConfigured, STRIPE_BILLING_CONTACT_EMAIL, SUPPORT_CONTACT_EMAIL } from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";
import { DEFAULT_STORE_SETTINGS } from "@/lib/constants";
import { dataStore } from "@/lib/storage/data-store";
import { normalizeStoreSlug } from "@/lib/store-slug";
import type { AdminSession, StoreSettings } from "@/lib/types";

export type StoreSignupInput = {
  storeName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  website?: string;
  password: string;
  storeSlug?: string;
};

export async function createStoreSignupCheckout(
  input: StoreSignupInput,
): Promise<{ checkoutUrl: string; storeId: string }> {
  if (!stripeConfigured()) {
    throw new Error(
      `Billing is not configured yet. Contact ${SUPPORT_CONTACT_EMAIL}.`,
    );
  }

  const storeName = input.storeName.trim();
  const ownerName = input.ownerName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const address = input.address.trim();
  const website = input.website?.trim() || undefined;
  const password = input.password;
  const storeSlug = normalizeStoreSlug(input.storeSlug, storeName);

  if (!storeName) throw new Error("Store name is required");
  if (!ownerName) throw new Error("Contact name is required");
  if (!email) throw new Error("Email is required");
  if (!phone) throw new Error("Phone is required");
  if (!address) throw new Error("Store address is required");
  if (!password) throw new Error("Password is required");

  const existingSlug = await dataStore.getStoreBySlug(storeSlug);
  if (existingSlug) throw new Error("A store with this URL slug already exists");

  const storeId = uuidv4();
  await validateStoreOwnerEmail(storeId, email);

  const now = new Date().toISOString();
  const store: StoreSettings = {
    ...DEFAULT_STORE_SETTINGS,
    id: storeId,
    storeName,
    storeSlug,
    ownerEmail: email,
    ownerName,
    phone,
    address,
    ...(website ? { website } : {}),
    subscription: {
      provider: "stripe",
      status: "incomplete",
      updatedAt: now,
    },
  };

  await dataStore.saveStore(store);
  try {
    await ensureStoreOwnerAccount(storeId, email, password);
  } catch (err) {
    await dataStore.deleteStore(storeId);
    throw err;
  }

  const stripe = getStripe();
  const priceId = getStripeStorePriceId()!;
  const baseUrl = getAppBaseUrl();

  const customer = await stripe.customers.create({
    email,
    name: ownerName,
    metadata: {
      storeId,
      storeName,
    },
  });

  await dataStore.saveStore({
    ...store,
    subscription: {
      provider: "stripe",
      status: "incomplete",
      stripeCustomerId: customer.id,
      updatedAt: now,
    },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing?canceled=1`,
    metadata: { storeId, platformBillingEmail: STRIPE_BILLING_CONTACT_EMAIL },
    subscription_data: {
      metadata: { storeId },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Could not start checkout session");
  }

  return { checkoutUrl: session.url, storeId };
}

export async function createBillingCheckoutForStore(
  storeId: string,
  email: string,
): Promise<string> {
  if (!stripeConfigured()) {
    throw new Error(
      `Billing is not configured yet. Contact ${SUPPORT_CONTACT_EMAIL}.`,
    );
  }

  const store = await dataStore.getStore(storeId);
  if (!store) throw new Error("Store not found");

  const stripe = getStripe();
  const priceId = getStripeStorePriceId()!;
  const baseUrl = getAppBaseUrl();

  let customerId = store.subscription?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      name: store.ownerName ?? store.storeName,
      metadata: { storeId },
    });
    customerId = customer.id;
    await dataStore.saveStore({
      ...store,
      subscription: {
        provider: "stripe",
        status: store.subscription?.status ?? "incomplete",
        stripeCustomerId: customerId,
        stripeSubscriptionId: store.subscription?.stripeSubscriptionId,
        currentPeriodEnd: store.subscription?.currentPeriodEnd,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing?canceled=1`,
    metadata: { storeId },
    subscription_data: {
      metadata: { storeId },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) throw new Error("Could not start checkout session");
  return session.url;
}

export async function createBillingPortalForStore(storeId: string): Promise<string> {
  const store = await dataStore.getStore(storeId);
  if (!store?.subscription?.stripeCustomerId) {
    throw new Error("No billing account found for this store");
  }

  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const session = await stripe.billingPortal.sessions.create({
    customer: store.subscription.stripeCustomerId,
    return_url: `${baseUrl}/billing`,
  });
  return session.url;
}

export function createStoreOwnerSession(
  storeId: string,
  userId: string,
  email: string,
): string {
  const session: AdminSession = {
    userId,
    email,
    role: "store",
    storeId,
    activeStoreId: storeId,
  };
  return createAdminSessionToken(session);
}

export function attachSessionCookie(response: Response, token: string): Response {
  response.headers.set("Set-Cookie", adminSessionCookieHeader(token));
  return response;
}
