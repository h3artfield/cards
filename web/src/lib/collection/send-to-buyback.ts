import { v4 as uuidv4 } from "uuid";
import { buildOrderCustomerSnapshot } from "../auth/customer-auth";
import { dataStore } from "../storage/data-store";
import type {
  BuybackOrder,
  CollectionCard,
  Customer,
  ScannedCard,
  StoreSettings,
} from "../types";
import { UNIDENTIFIED_COLLECTION_CARD_NAME } from "./collection-intake";

export type SendableSelection = {
  sendable: CollectionCard[];
  /** Ids that were requested but cannot be sent, with the reason. */
  skipped: Array<{ id: string; reason: string }>;
};

/** Only the owner's own, still-owned cards at this store can go to buyback. */
export function selectSendableCollectionCards(
  cards: CollectionCard[],
  requestedIds: string[],
  scope: { storeId: string; customerId: string },
): SendableSelection {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const sendable: CollectionCard[] = [];
  const skipped: SendableSelection["skipped"] = [];
  const seen = new Set<string>();

  for (const id of requestedIds) {
    if (seen.has(id)) continue;
    seen.add(id);

    const card = byId.get(id);
    if (
      !card ||
      card.storeId !== scope.storeId ||
      card.customerId !== scope.customerId
    ) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }
    if (card.status !== "owned") {
      skipped.push({ id, reason: "already_sent" });
      continue;
    }
    sendable.push(card);
  }

  return { sendable, skipped };
}

export function collectionCardToScannedCard(
  card: CollectionCard,
  orderId: string,
  now: string,
): ScannedCard {
  const detectedName =
    card.displayName === UNIDENTIFIED_COLLECTION_CARD_NAME
      ? undefined
      : card.displayName;

  return {
    id: uuidv4(),
    orderId,
    frontImageUrl: card.frontImageUrl,
    backImageUrl: card.backImageUrl ?? "",
    itemType: card.itemType,
    category: card.category,
    detectedName,
    setName: card.setName,
    cardNumber: card.cardNumber,
    conditionEstimate: card.conditionEstimate,
    status: "pending",
    createdAt: now,
  };
}

/**
 * Move chosen binder cards onto a fresh buyback order. Images and identity
 * carry over, so the customer never re-scans; the order still goes through
 * normal submit and staff review.
 */
export async function sendCollectionCardsToBuyback(args: {
  store: StoreSettings;
  customer: Customer;
  cardIds: string[];
}): Promise<{
  order: BuybackOrder;
  cards: ScannedCard[];
  skipped: SendableSelection["skipped"];
}> {
  const { store, customer } = args;
  const owned = await dataStore.getCollectionCards(store.id, customer.id);
  const { sendable, skipped } = selectSendableCollectionCards(
    owned,
    args.cardIds,
    { storeId: store.id, customerId: customer.id },
  );

  if (!sendable.length) {
    throw new Error("Select at least one card from your collection");
  }

  const now = new Date().toISOString();
  const orderNumber = await dataStore.nextOrderNumber(store.id);
  const order: BuybackOrder = {
    id: uuidv4(),
    orderNumber,
    customerId: customer.id,
    storeId: store.id,
    storeSlug: store.storeSlug,
    customer: buildOrderCustomerSnapshot(customer),
    status: "scanning",
    createdAt: now,
    manualReviewCount: 0,
  };
  await dataStore.saveOrder(order);

  const cards: ScannedCard[] = [];
  for (const collectionCard of sendable) {
    const scanned = collectionCardToScannedCard(collectionCard, order.id, now);
    const saved = await dataStore.saveCard(scanned);
    cards.push(saved);
    await dataStore.saveCollectionCard({
      ...collectionCard,
      status: "sent_to_buyback",
      buybackOrderId: order.id,
      buybackCardId: saved.id,
      sentToBuybackAt: now,
      updatedAt: now,
    });
  }

  return { order, cards, skipped };
}
