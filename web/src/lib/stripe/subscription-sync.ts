import type Stripe from "stripe";
import { dataStore } from "../storage/data-store";
import type { StoreSubscription, StoreSubscriptionStatus } from "../types";

function mapStripeStatus(status: Stripe.Subscription.Status): StoreSubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
    default:
      return "incomplete";
  }
}

export async function syncStoreSubscriptionFromStripe(
  storeId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const store = await dataStore.getStore(storeId);
  if (!store) return;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  const patch: StoreSubscription = {
    provider: "stripe",
    status: mapStripeStatus(subscription.status),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : undefined,
    updatedAt: new Date().toISOString(),
  };

  await dataStore.saveStore({
    ...store,
    subscription: {
      ...store.subscription,
      ...patch,
    },
  });
}

export async function updateStoreSubscriptionStatus(
  storeId: string,
  status: StoreSubscriptionStatus,
  extras?: Partial<StoreSubscription>,
): Promise<void> {
  const store = await dataStore.getStore(storeId);
  if (!store) return;

  await dataStore.saveStore({
    ...store,
    subscription: {
      provider: "stripe",
      status,
      stripeCustomerId: extras?.stripeCustomerId ?? store.subscription?.stripeCustomerId,
      stripeSubscriptionId:
        extras?.stripeSubscriptionId ?? store.subscription?.stripeSubscriptionId,
      currentPeriodEnd:
        extras?.currentPeriodEnd ?? store.subscription?.currentPeriodEnd,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function resolveStoreIdFromStripeMetadata(
  metadata: Stripe.Metadata | null | undefined,
): Promise<string | null> {
  const storeId = metadata?.storeId?.trim();
  return storeId || null;
}
