import { v4 as uuidv4 } from "uuid";
import type {
  BuybackOrder,
  BuybackTransaction,
  InventoryItem,
  OrderReopenRecord,
  PurchaseType,
  ScannedCard,
  TradeCreditEntry,
} from "../types";
import {
  issueTradeCreditForBuyback,
  reverseTradeCreditForOrder,
} from "../trade-credit/trade-credit-ledger";
import { cardDisplayName } from "./card-display-name";
import { isCardIncludedInClerkOffer } from "./card-buy-decision";
import { resolveClerkRunningOfferAmounts } from "../card-flow-v2/clerk-card-insights";
import { dataStore } from "../storage/data-store";

export interface CompleteBuybackResult {
  order: BuybackOrder;
  transaction: BuybackTransaction;
  inventory: InventoryItem[];
  /** Set when the order was completed as trade. */
  tradeCredit?: TradeCreditEntry;
}

function cardPurchasePrice(
  card: ScannedCard,
  type: "cash" | "trade",
): number {
  const amounts = resolveClerkRunningOfferAmounts(card);
  return type === "cash" ? amounts.cash : amounts.trade;
}

export async function completeBuybackPurchase(
  order: BuybackOrder,
  cards: ScannedCard[],
  offerType: "cash" | "trade",
  storeId: string,
): Promise<CompleteBuybackResult> {
  if (order.status === "paid" || order.status === "cancelled") {
    throw new Error("Order is already finalized");
  }

  const rules = await dataStore.getActiveRules(storeId);
  const purchased = cards.filter((c) => isCardIncludedInClerkOffer(c, rules));
  if (!purchased.length) {
    throw new Error("Select at least one card (Yes) before completing the purchase");
  }

  const now = new Date().toISOString();
  const amount = purchased.reduce(
    (sum, c) => sum + cardPurchasePrice(c, offerType),
    0,
  );

  const transaction: BuybackTransaction = {
    id: uuidv4(),
    storeId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    type: offerType,
    amount,
    cardCount: purchased.length,
    createdAt: now,
  };

  await dataStore.saveTransaction(transaction);

  const inventory: InventoryItem[] = [];
  for (const card of purchased) {
    const item: InventoryItem = {
      id: uuidv4(),
      storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      cardId: card.id,
      displayName: cardDisplayName(card),
      category: card.category,
      setName: card.setName,
      cardNumber: card.cardNumber,
      playerName: card.playerName,
      condition: card.conditionOverride?.condition ?? card.conditionEstimate,
      itemType: card.itemType,
      slabCompany: card.slabCompany,
      slabGrade: card.slabGrade,
      frontImageUrl: card.frontImageUrl,
      marketPrice: resolveClerkRunningOfferAmounts(card).market,
      purchaseType: offerType,
      purchasePrice: cardPurchasePrice(card, offerType),
      acquiredAt: now,
      transactionId: transaction.id,
      status: "on_hand",
    };
    await dataStore.saveInventoryItem(item);
    inventory.push(item);
    await dataStore.saveCard({ ...card, status: "approved", buyDecision: offerType });
  }

  const updatedOrder: BuybackOrder = {
    ...order,
    status: "paid",
    offerType,
    purchaseAmount: amount,
    completedAt: now,
    reviewedAt: now,
    totalCashOffer: purchased.reduce(
      (s, c) => s + resolveClerkRunningOfferAmounts(c).cash,
      0,
    ),
    totalTradeOffer: purchased.reduce(
      (s, c) => s + resolveClerkRunningOfferAmounts(c).trade,
      0,
    ),
    totalMarketEstimate: purchased.reduce(
      (s, c) => s + resolveClerkRunningOfferAmounts(c).market,
      0,
    ),
  };

  await dataStore.saveOrder(updatedOrder);

  const tradeCredit = await issueTradeCreditForBuyback({
    order: updatedOrder,
    transaction,
    storeId,
  });

  return {
    order: updatedOrder,
    transaction,
    inventory,
    ...(tradeCredit ? { tradeCredit } : {}),
  };
}

export async function cancelBuybackSale(
  order: BuybackOrder,
  storeId: string,
): Promise<{ order: BuybackOrder; transaction: BuybackTransaction }> {
  if (order.status === "paid" || order.status === "cancelled") {
    throw new Error("Order is already finalized");
  }

  const now = new Date().toISOString();
  const transaction: BuybackTransaction = {
    id: uuidv4(),
    storeId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    type: "cancelled",
    amount: 0,
    cardCount: 0,
    createdAt: now,
  };

  await dataStore.saveTransaction(transaction);
  const updatedOrder: BuybackOrder = {
    ...order,
    status: "cancelled",
    completedAt: now,
    purchaseAmount: 0,
  };
  await dataStore.saveOrder(updatedOrder);

  return { order: updatedOrder, transaction };
}

export function isOrderFinalized(order: BuybackOrder): boolean {
  return order.status === "paid" || order.status === "cancelled";
}

export async function reopenBuybackOrder(
  order: BuybackOrder,
  cards: ScannedCard[],
  employeeName: string,
  storeId: string,
): Promise<BuybackOrder> {
  if (!isOrderFinalized(order)) {
    throw new Error("Only finalized orders can be reopened");
  }

  const name = employeeName.trim();
  if (!name) {
    throw new Error("Employee name is required to reopen an order");
  }

  const record: OrderReopenRecord = {
    reopenedByName: name,
    reopenedAt: new Date().toISOString(),
    previousStatus: order.status,
    previousCompletedAt: order.completedAt,
    previousOfferType: order.offerType,
    previousPurchaseAmount: order.purchaseAmount,
  };

  if (order.status === "paid") {
    await dataStore.deleteInventoryByOrderId(order.id);
    await reverseTradeCreditForOrder({
      orderId: order.id,
      storeId,
      note: `Order reopened by ${name}`,
    });
  }

  const manualReviewCount = cards.filter(
    (c) => c.status === "manual_review" || c.status === "do_not_buy",
  ).length;

  const updatedOrder: BuybackOrder = {
    ...order,
    status:
      manualReviewCount > 0 ? "under_review" : "offer_ready",
    completedAt: undefined,
    purchaseAmount: undefined,
    offerType: undefined,
    reviewedAt: new Date().toISOString(),
    reopenHistory: [...(order.reopenHistory ?? []), record],
  };

  await dataStore.saveOrder(updatedOrder);
  await dataStore.logAdminAction({
    action: "reopen_order",
    orderId: order.id,
    storeId,
    employeeName: name,
    previousStatus: record.previousStatus,
  });

  return updatedOrder;
}
