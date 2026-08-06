import { apiFetch } from "./api-client";
import type { BuybackOrder } from "./types";

export async function createCustomerOrder(
  customerId: string,
  storeSlug?: string | null,
): Promise<BuybackOrder> {
  const { order } = await apiFetch<{ order: BuybackOrder }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customerId,
      ...(storeSlug ? { storeSlug } : {}),
    }),
  });
  if (!order?.id) {
    throw new Error("Order was not created. Please try again.");
  }
  return order;
}

export function goToOrderScan(orderId: string) {
  window.location.assign(`/order/${orderId}/scan`);
}
