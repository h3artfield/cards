import { NextRequest } from "next/server";
import Stripe from "stripe";
import { jsonOk, jsonError } from "@/lib/api-utils";
import { getStripe } from "@/lib/stripe/client";
import { getStripeWebhookSecret } from "@/lib/stripe/config";
import {
  resolveStoreIdFromStripeMetadata,
  syncStoreSubscriptionFromStripe,
  updateStoreSubscriptionStatus,
} from "@/lib/stripe/subscription-sync";
import { ensureSeedData } from "@/lib/storage/ensure-seed";
import { dataStore } from "@/lib/storage/data-store";

export const runtime = "nodejs";

async function storeIdFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = await resolveStoreIdFromStripeMetadata(subscription.metadata);
  if (fromMeta) return fromMeta;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return null;

  const stores = await dataStore.listStores();
  const match = stores.find((s) => s.subscription?.stripeCustomerId === customerId);
  return match?.id ?? null;
}

async function storeIdFromSession(session: Stripe.Checkout.Session): Promise<string | null> {
  const fromMeta = await resolveStoreIdFromStripeMetadata(session.metadata);
  if (fromMeta) return fromMeta;

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) return null;

  const stores = await dataStore.listStores();
  const match = stores.find((s) => s.subscription?.stripeCustomerId === customerId);
  return match?.id ?? null;
}

export async function POST(req: NextRequest) {
  const webhookSecret = getStripeWebhookSecret();
  if (!webhookSecret) {
    return jsonError("Webhook secret not configured", 503);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonError("Missing stripe-signature header", 400);
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook";
    return jsonError(message, 400);
  }

  try {
    await ensureSeedData();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const storeId = await storeIdFromSession(session);
        if (!storeId) break;

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        const store = await dataStore.getStore(storeId);
        if (store) {
          await dataStore.saveStore({
            ...store,
            subscription: {
              provider: "stripe",
              status: "active",
              stripeCustomerId: customerId ?? store.subscription?.stripeCustomerId,
              stripeSubscriptionId:
                subscriptionId ?? store.subscription?.stripeSubscriptionId,
              currentPeriodEnd: store.subscription?.currentPeriodEnd,
              updatedAt: new Date().toISOString(),
            },
          });
        }

        if (subscriptionId) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await syncStoreSubscriptionFromStripe(storeId, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const storeId = await storeIdFromSubscription(subscription);
        if (storeId) {
          await syncStoreSubscriptionFromStripe(storeId, subscription);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const storeId = await storeIdFromSubscription(subscription);
        if (storeId) {
          await updateStoreSubscriptionStatus(storeId, "canceled", {
            stripeSubscriptionId: subscription.id,
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (!subscriptionId) break;

        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const storeId = await storeIdFromSubscription(subscription);
        if (storeId) {
          await updateStoreSubscriptionStatus(storeId, "past_due", {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId:
              typeof subscription.customer === "string"
                ? subscription.customer
                : subscription.customer?.id,
          });
        }
        break;
      }
      default:
        break;
    }

    return jsonOk({ received: true });
  } catch (err) {
    console.error("[stripe webhook]", err);
    return jsonError("Webhook handler failed", 500);
  }
}
