import type { StoreSettings, StoreSubscriptionStatus } from "./types";

const ACTIVE_STATUSES: StoreSubscriptionStatus[] = ["active", "trialing"];

/** Legacy stores without a subscription record keep full dashboard access. */
export function storeHasActiveSubscription(store: StoreSettings | null): boolean {
  if (!store) return false;
  if (!store.subscription) return true;
  return ACTIVE_STATUSES.includes(store.subscription.status);
}

export function subscriptionStatusLabel(
  status: StoreSubscriptionStatus | undefined,
): string {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trial";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "incomplete":
      return "Incomplete";
    default:
      return "Unknown";
  }
}
