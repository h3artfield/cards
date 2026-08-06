import type { BuybackOrder, ScannedCard } from "./types";

/** Customer-safe order fields — no admin/V2 internals. */
export function sanitizeOrderForCustomer(order: BuybackOrder): BuybackOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    storeId: order.storeId,
    storeSlug: order.storeSlug,
    customer: order.customer,
    status: order.status,
    createdAt: order.createdAt,
    submittedAt: order.submittedAt,
    reviewedAt: order.reviewedAt,
    totalCashOffer: order.totalCashOffer,
    totalTradeOffer: order.totalTradeOffer,
    offerType: order.offerType,
    completedAt: order.completedAt,
    purchaseAmount: order.purchaseAmount,
    customerNotes: order.customerNotes,
  };
}

/** Customer-safe card summary — no pricing debug or staff fields. */
export function sanitizeCardsForCustomer(cards: ScannedCard[]): Array<{
  id: string;
  status: ScannedCard["status"];
  detectedName?: string;
  setName?: string;
  cashOffer?: number;
  tradeOffer?: number;
}> {
  return cards.map((c) => ({
    id: c.id,
    status: c.status,
    detectedName: c.detectedName,
    setName: c.setName,
    cashOffer: c.cashOffer,
    tradeOffer: c.tradeOffer,
  }));
}
