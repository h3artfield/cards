import { randomUUID } from "node:crypto";
import { COLLECTIONS } from "../firebase/collections";
import { getAdminFirestore } from "../firebase/admin";

export type StockNotifyRequest = {
  id: string;
  customerId: string;
  customerEmail: string;
  storeId: string;
  storeSlug: string;
  cardNames: string[];
  createdAt: string;
};

const memoryRequests = new Map<string, StockNotifyRequest>();

export async function createStockNotifyRequest(args: {
  customerId: string;
  customerEmail: string;
  storeId: string;
  storeSlug: string;
  cardNames: string[];
}): Promise<StockNotifyRequest> {
  const uniqueNames = [...new Set(args.cardNames.map((n) => n.trim()).filter(Boolean))];
  const id = randomUUID();
  const record: StockNotifyRequest = {
    id,
    customerId: args.customerId,
    customerEmail: args.customerEmail,
    storeId: args.storeId,
    storeSlug: args.storeSlug,
    cardNames: uniqueNames,
    createdAt: new Date().toISOString(),
  };
  memoryRequests.set(id, record);
  const db = getAdminFirestore();
  if (db) {
    await db.collection(COLLECTIONS.stockNotifyRequests).doc(id).set(record);
  }
  return record;
}
