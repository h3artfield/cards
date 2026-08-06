import type { BuybackOrder, ScannedCard } from "../types";
import { resolveOrderStatus } from "./process-order";
import { handleOrderReadyForReviewTransition } from "./order-ready-customer-email";
import { dataStore } from "../storage/data-store";
import { DEFAULT_STORE_ID } from "../firebase/collections";

const IN_FLIGHT_CARD_STATUSES = new Set<ScannedCard["status"]>([
  "pending",
  "processing",
]);

/** Order submit finished card work but never left processing (common on Cloud Run). */
export function isOrderStuckProcessing(
  order: BuybackOrder,
  cards: ScannedCard[],
): boolean {
  if (order.status !== "processing" && order.status !== "submitted") {
    return false;
  }
  if (!cards.length) return false;
  return !cards.some((c) => IN_FLIGHT_CARD_STATUSES.has(c.status));
}

export function finalizeOrderFromCards(
  order: BuybackOrder,
  cards: ScannedCard[],
): BuybackOrder {
  const eligible = cards.filter((c) => c.status !== "do_not_buy");
  const manualReviewCount = cards.filter(
    (c) => c.status === "manual_review" || c.status === "do_not_buy",
  ).length;

  return {
    ...order,
    status: resolveOrderStatus(manualReviewCount, cards.length),
    reviewedAt: order.reviewedAt ?? new Date().toISOString(),
    totalMarketEstimate: eligible.reduce(
      (sum, c) => sum + (c.marketPrice ?? 0),
      0,
    ),
    totalCashOffer: eligible.reduce((sum, c) => sum + (c.cashOffer ?? 0), 0),
    totalTradeOffer: eligible.reduce((sum, c) => sum + (c.tradeOffer ?? 0), 0),
    manualReviewCount,
  };
}

export async function repairStuckProcessingOrder(
  order: BuybackOrder,
  cards: ScannedCard[],
  save: (order: BuybackOrder) => Promise<BuybackOrder>,
): Promise<BuybackOrder> {
  if (!isOrderStuckProcessing(order, cards)) return order;
  const previousStatus = order.status;
  const finalized = finalizeOrderFromCards(order, cards);
  const saved = await save(finalized);

  if (previousStatus === saved.status) return saved;

  const storeId = saved.storeId?.trim() || DEFAULT_STORE_ID;
  const [customer, settings] = await Promise.all([
    dataStore.getCustomer(saved.customerId),
    dataStore.getSettings(storeId),
  ]);

  const withNotification = await handleOrderReadyForReviewTransition({
    previousStatus,
    order: saved,
    customer,
    storeName: settings.storeName,
    cardCount: cards.length,
  });
  if (withNotification !== saved) {
    return save(withNotification);
  }
  return saved;
}
