import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type {
  AdminUser,
  BuybackOrder,
  BuybackTransaction,
  CardFeedback,
  CollectionCard,
  Customer,
  InventoryItem,
  ScannedCard,
  ShopTicket,
  StoreRule,
  StoreSettings,
  TradeCreditEntry,
} from "../types";
import type { StoreEvent, StoreEventSignup } from "../store-calendar/types";
import {
  normalizeStoreEvent,
  normalizeStoreEventSignup,
} from "../store-calendar/normalize";
import { DEFAULT_STORE_RULES } from "../default-store-rules";
import { v4 as uuidv4 } from "uuid";
import { COLLECTIONS, DEFAULT_STORE_ID, STORE_SETTINGS_DOC } from "../firebase/collections";
import type { InventoryImportSnapshot } from "../inventory/import-snapshots";
import { isCloudDeployment } from "../cloud-env";
import {
  isAdminConfigured,
  requireFirestore,
  FirestoreUnavailableError,
} from "../firebase/admin";
import {
  activeRules,
  normalizeStoreRule,
  normalizeStoreSettings,
} from "../firebase/normalize";
import {
  mutateDevMemory,
  readDevMemoryState,
} from "./dev-file-store";
import { forFirestore } from "../firebase/for-firestore";
import {
  persistCardImages,
  persistCollectionCardImages,
} from "./card-images";

function dbOrMemory(): Firestore | null {
  if (isAdminConfigured()) {
    return requireFirestore();
  }
  if (isCloudDeployment()) {
    throw new FirestoreUnavailableError(
      "Firestore is required in cloud deployments. Configure Firebase Admin credentials or Cloud Run service account IAM.",
    );
  }
  return null;
}

export function getStorageMode(): "firestore" | "memory" {
  if (isCloudDeployment() && !isAdminConfigured()) {
    throw new FirestoreUnavailableError(
      "Firestore is required in cloud deployments.",
    );
  }
  return isAdminConfigured() ? "firestore" : "memory";
}

function resolveStoreId(storeId?: string): string {
  return storeId?.trim() || DEFAULT_STORE_ID;
}

function orderStoreId(order: BuybackOrder): string {
  return order.storeId?.trim() || DEFAULT_STORE_ID;
}

function parseOrderSequence(orderNumber: string): number {
  const digits = orderNumber.replace(/\D/g, "");
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function maxOrderSequence(orders: BuybackOrder[]): number {
  return orders.reduce(
    (max, order) => Math.max(max, parseOrderSequence(order.orderNumber)),
    0,
  );
}

function formatOrderNumber(sequence: number): string {
  return `BB-${String(sequence).padStart(6, "0")}`;
}

function formatTicketNumber(sequence: number): string {
  return `T-${String(sequence).padStart(5, "0")}`;
}

function maxTicketSequence(tickets: ShopTicket[]): number {
  return tickets.reduce((max, ticket) => {
    const digits = ticket.ticketNumber?.match(/(\d+)\s*$/);
    return Math.max(max, digits ? Number(digits[1]) : 0);
  }, 0);
}

function inventoryStoreId(item: InventoryItem): string {
  return item.storeId?.trim() || DEFAULT_STORE_ID;
}

function transactionStoreId(tx: BuybackTransaction): string {
  return tx.storeId?.trim() || DEFAULT_STORE_ID;
}

function tradeCreditStoreId(entry: TradeCreditEntry): string {
  return entry.storeId?.trim() || DEFAULT_STORE_ID;
}

function shopTicketStoreId(ticket: ShopTicket): string {
  return ticket.storeId?.trim() || DEFAULT_STORE_ID;
}

function collectionCardStoreId(card: CollectionCard): string {
  return card.storeId?.trim() || DEFAULT_STORE_ID;
}

function customerStoreId(customer: Customer): string {
  return customer.storeId?.trim() || DEFAULT_STORE_ID;
}

function ruleStoreId(rule: StoreRule): string {
  return rule.storeId?.trim() || DEFAULT_STORE_ID;
}

export type PurgeCustomerDataResult = {
  storeIds: string[];
  orders: number;
  cards: number;
  customers: number;
  inventory: number;
  transactions: number;
  tradeCreditEntries: number;
  collectionCards: number;
  shopTickets: number;
  feedback: number;
};

export type DeleteStoreResult = PurgeCustomerDataResult & {
  rules: number;
  ownerDeleted: boolean;
};

const FIRESTORE_BATCH_SIZE = 400;

async function deleteFirestoreDocIds(
  db: Firestore,
  collection: string,
  ids: string[],
): Promise<number> {
  if (!ids.length) return 0;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_SIZE) {
    const batch = db.batch();
    const chunk = ids.slice(i, i + FIRESTORE_BATCH_SIZE);
    for (const id of chunk) {
      batch.delete(db.collection(collection).doc(id));
    }
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

export const dataStore = {
  async listStores(): Promise<StoreSettings[]> {
    const byId = new Map<string, StoreSettings>();

    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.stores).get();
      for (const doc of snap.docs) {
        const store = normalizeStoreSettings(
          doc.data() as Record<string, unknown>,
          doc.id,
        );
        byId.set(store.id, store);
      }
    } else {
      const state = await readDevMemoryState();
      if (!state.stores) state.stores = {};
      for (const store of Object.values(state.stores)) {
        byId.set(store.id, store);
      }
    }

    const legacy = await this.getLegacySettingsDoc();
    if (legacy && !byId.has(legacy.id)) {
      byId.set(legacy.id, legacy);
    }

    if (!byId.size) {
      const fallback = normalizeStoreSettings(undefined, DEFAULT_STORE_ID);
      byId.set(fallback.id, fallback);
    }

    return [...byId.values()].sort((a, b) =>
      a.storeName.localeCompare(b.storeName),
    );
  },

  async getStore(storeId: string): Promise<StoreSettings | null> {
    const id = resolveStoreId(storeId);
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.stores).doc(id).get();
      if (snap.exists) {
        return normalizeStoreSettings(
          snap.data() as Record<string, unknown>,
          snap.id,
        );
      }
    } else {
      const state = await readDevMemoryState();
      if (state.stores?.[id]) return state.stores[id];
    }
    if (id === DEFAULT_STORE_ID) {
      const legacy = await this.getLegacySettingsDoc();
      if (legacy) return legacy;
    }
    return null;
  },

  async getStoreBySlug(slug: string): Promise<StoreSettings | null> {
    const stores = await this.listStores();
    const normalized = slug.trim().toLowerCase();
    return (
      stores.find((s) => s.storeSlug.toLowerCase() === normalized) ?? null
    );
  },

  async saveStore(settings: StoreSettings): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.stores)
        .doc(settings.id)
        .set(forFirestore({ ...settings, id: settings.id }), { merge: true });
      return;
    }
    await mutateDevMemory((state) => {
      if (!state.stores) state.stores = {};
      state.stores[settings.id] = settings;
      if (settings.id === DEFAULT_STORE_ID) state.settings = settings;
    });
  },

  async deleteStore(storeId: string): Promise<void> {
    const id = resolveStoreId(storeId);
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.stores).doc(id).delete();
      if (id === DEFAULT_STORE_ID) {
        await db.collection(COLLECTIONS.storeSettings).doc(STORE_SETTINGS_DOC).delete();
      }
      return;
    }
    await mutateDevMemory((state) => {
      if (state.stores) delete state.stores[id];
    });
  },

  async deleteAdminUser(userId: string): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.adminUsers).doc(userId).delete();
      return;
    }
    await mutateDevMemory((state) => {
      if (state.adminUsers) {
        state.adminUsers = state.adminUsers.filter((u) => u.id !== userId);
      }
    });
  },

  /** Remove store, owner account, rules, and all customer/order data. */
  async deleteStoreCompletely(storeId: string): Promise<DeleteStoreResult> {
    const id = resolveStoreId(storeId);
    const store = await this.getStore(id);
    if (!store) {
      throw new Error("Store not found");
    }

    const purgeResult = await this.purgeCustomerData(id);

    const rules = await this.getRules(id);
    for (const rule of rules) {
      await this.deleteRule(rule.id);
    }

    const owner = await this.getStoreAdminUser(id);
    if (owner) {
      await this.deleteAdminUser(owner.id);
    }

    await this.deleteStore(id);

    return {
      ...purgeResult,
      rules: rules.length,
      ownerDeleted: Boolean(owner),
    };
  },

  async getLegacySettingsDoc(): Promise<StoreSettings | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.storeSettings)
        .doc(STORE_SETTINGS_DOC)
        .get();
      if (!snap.exists) return null;
      return normalizeStoreSettings(
        { ...(snap.data() as Record<string, unknown>), id: DEFAULT_STORE_ID },
        DEFAULT_STORE_ID,
      );
    }
    const state = await readDevMemoryState();
    if (state.settings?.storeSlug === "the-game-lodge") {
      return { ...state.settings, id: DEFAULT_STORE_ID };
    }
    return null;
  },

  async getSettings(storeId?: string): Promise<StoreSettings> {
    const id = resolveStoreId(storeId);
    const store = await this.getStore(id);
    if (store) return store;
    return normalizeStoreSettings(undefined, id);
  },

  async saveSettings(settings: StoreSettings): Promise<void> {
    await this.saveStore(settings);
    const db = dbOrMemory();
    if (db && settings.id === DEFAULT_STORE_ID) {
      await db
        .collection(COLLECTIONS.storeSettings)
        .doc(STORE_SETTINGS_DOC)
        .set(forFirestore(settings), { merge: true });
    }
  },

  async listAdminUsers(): Promise<AdminUser[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.adminUsers).get();
      return snap.docs.map((d) => d.data() as AdminUser);
    }
    const state = await readDevMemoryState();
    return state.adminUsers ?? [];
  },

  async getAdminUserByEmail(email: string): Promise<AdminUser | null> {
    const normalized = email.trim().toLowerCase();
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.adminUsers)
        .where("email", "==", normalized)
        .limit(1)
        .get();
      return snap.empty ? null : (snap.docs[0]!.data() as AdminUser);
    }
    const state = await readDevMemoryState();
    return (
      state.adminUsers?.find((u) => u.email.toLowerCase() === normalized) ??
      null
    );
  },

  async getAdminUserById(id: string): Promise<AdminUser | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.adminUsers).doc(id).get();
      return snap.exists ? (snap.data() as AdminUser) : null;
    }
    const state = await readDevMemoryState();
    return state.adminUsers?.find((u) => u.id === id) ?? null;
  },

  async getStoreAdminUser(storeId: string): Promise<AdminUser | null> {
    const users = await this.listAdminUsers();
    return (
      users.find((u) => u.role === "store" && u.storeId === storeId) ?? null
    );
  },

  async saveAdminUser(user: AdminUser): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.adminUsers).doc(user.id).set(user);
      return;
    }
    await mutateDevMemory((state) => {
      if (!state.adminUsers) state.adminUsers = [];
      const idx = state.adminUsers.findIndex((u) => u.id === user.id);
      if (idx >= 0) state.adminUsers[idx] = user;
      else state.adminUsers.push(user);
    });
  },

  async getRules(storeId?: string): Promise<StoreRule[]> {
    const id = resolveStoreId(storeId);
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.storeRules).get();
      return snap.docs
        .map((d) => normalizeStoreRule(d.id, d.data() as Record<string, unknown>))
        .filter((r) => ruleStoreId(r) === id)
        .sort((a, b) => b.priority - a.priority);
    }
    const state = await readDevMemoryState();
    return state.rules
      .filter((r) => ruleStoreId(r) === id)
      .sort((a, b) => b.priority - a.priority);
  },

  async getActiveRules(storeId?: string): Promise<StoreRule[]> {
    await this.ensureDefaultStoreRules(storeId);
    return activeRules(await this.getRules(storeId));
  },

  async ensureDefaultStoreRules(storeId?: string): Promise<void> {
    const id = resolveStoreId(storeId);
    const existing = await this.getRules(id);
    if (existing.length > 0) return;
    const now = new Date().toISOString();
    for (const template of DEFAULT_STORE_RULES) {
      await this.saveRule({
        ...template,
        id: uuidv4(),
        storeId: id,
        createdAt: now,
        updatedAt: now,
      });
    }
  },

  async saveRule(rule: StoreRule): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.storeRules)
        .doc(rule.id)
        .set(forFirestore(rule));
      return;
    }
    await mutateDevMemory((state) => {
      const idx = state.rules.findIndex((r) => r.id === rule.id);
      if (idx >= 0) state.rules[idx] = rule;
      else state.rules.push(rule);
    });
  },

  async deleteRule(id: string): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.storeRules).doc(id).delete();
      return;
    }
    await mutateDevMemory((state) => {
      state.rules = state.rules.filter((r) => r.id !== id);
    });
  },

  async saveRules(rules: StoreRule[]): Promise<void> {
    for (const rule of rules) await this.saveRule(rule);
  },

  async upsertCustomer(customer: Customer): Promise<Customer> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.customers)
        .doc(customer.id)
        .set(forFirestore(customer), { merge: true });
      return customer;
    }
    await mutateDevMemory((state) => {
      const idx = state.customers.findIndex((c) => c.id === customer.id);
      if (idx >= 0) state.customers[idx] = customer;
      else state.customers.push(customer);
    });
    return customer;
  },

  async getCustomer(id: string): Promise<Customer | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.customers).doc(id).get();
      return snap.exists ? (snap.data() as Customer) : null;
    }
    const state = await readDevMemoryState();
    return state.customers.find((c) => c.id === id) ?? null;
  },

  async getCustomerByEmail(email: string): Promise<Customer | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.customers)
        .where("email", "==", email.toLowerCase())
        .limit(1)
        .get();
      return snap.empty ? null : (snap.docs[0]!.data() as Customer);
    }
    const state = await readDevMemoryState();
    return (
      state.customers.find(
        (c) => c.email.toLowerCase() === email.toLowerCase(),
      ) ?? null
    );
  },

  async getCustomers(storeId?: string): Promise<Customer[]> {
    const id = storeId ? resolveStoreId(storeId) : undefined;
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.customers)
        .orderBy("createdAt", "desc")
        .get();
      const all = snap.docs.map((d) => d.data() as Customer);
      if (!id) return all;
      return all.filter((c) => customerStoreId(c) === id);
    }
    const state = await readDevMemoryState();
    if (!id) return state.customers;
    return state.customers.filter((c) => customerStoreId(c) === id);
  },

  async nextOrderNumber(storeId?: string): Promise<string> {
    const id = resolveStoreId(storeId);
    const db = dbOrMemory();
    if (db) {
      const counterRef = db.collection(COLLECTIONS.counters).doc(`orders-${id}`);
      const existingCounter = await counterRef.get();
      if (!existingCounter.exists) {
        const orders = await this.getOrders(id);
        const seeded = maxOrderSequence(orders);
        if (seeded > 0) {
          await counterRef.set({ value: seeded });
        }
      }

      const num = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
        const next = current + 1;
        tx.set(counterRef, { value: next });
        return next;
      });
      return formatOrderNumber(num);
    }

    let num = 0;
    await mutateDevMemory((state) => {
      if (!state.orderCounters) state.orderCounters = {};
      const storeOrders = state.orders.filter((o) => orderStoreId(o) === id);
      const seeded = maxOrderSequence(storeOrders);
      const current = Math.max(state.orderCounters[id] ?? 0, seeded);
      num = current + 1;
      state.orderCounters[id] = num;
    });
    return formatOrderNumber(num);
  },

  async saveOrder(order: BuybackOrder): Promise<BuybackOrder> {
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.orders).doc(order.id).set(forFirestore(order));
      return order;
    }
    await mutateDevMemory((state) => {
      const idx = state.orders.findIndex((o) => o.id === order.id);
      if (idx >= 0) state.orders[idx] = order;
      else state.orders.push(order);
    });
    return order;
  },

  async getOrder(id: string): Promise<BuybackOrder | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.orders).doc(id).get();
      return snap.exists ? (snap.data() as BuybackOrder) : null;
    }
    const state = await readDevMemoryState();
    return state.orders.find((o) => o.id === id) ?? null;
  },

  async getOrders(storeId?: string): Promise<BuybackOrder[]> {
    const id = storeId ? resolveStoreId(storeId) : undefined;
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.orders)
        .orderBy("createdAt", "desc")
        .get();
      const all = snap.docs.map((d) => d.data() as BuybackOrder);
      if (!id) return all;
      return all.filter((o) => orderStoreId(o) === id);
    }
    const state = await readDevMemoryState();
    const sorted = [...state.orders].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (!id) return sorted;
    return sorted.filter((o) => orderStoreId(o) === id);
  },

  async getOrdersByCustomer(customerId: string): Promise<BuybackOrder[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.orders)
        .where("customerId", "==", customerId)
        .get();
      return snap.docs
        .map((d) => d.data() as BuybackOrder)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }
    const state = await readDevMemoryState();
    return state.orders.filter((o) => o.customerId === customerId);
  },

  async saveCard(card: ScannedCard): Promise<ScannedCard> {
    const persisted = await persistCardImages(card);
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.cards)
        .doc(persisted.id)
        .set(forFirestore(persisted));
      return persisted;
    }
    await mutateDevMemory((state) => {
      const idx = state.cards.findIndex((c) => c.id === persisted.id);
      if (idx >= 0) state.cards[idx] = persisted;
      else state.cards.push(persisted);
    });
    return persisted;
  },

  async getCard(id: string): Promise<ScannedCard | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.cards).doc(id).get();
      return snap.exists ? (snap.data() as ScannedCard) : null;
    }
    const state = await readDevMemoryState();
    return state.cards.find((c) => c.id === id) ?? null;
  },

  async deleteCard(id: string): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.cards).doc(id).delete();
      return;
    }
    await mutateDevMemory((state) => {
      state.cards = state.cards.filter((c) => c.id !== id);
    });
  },

  async getCardsByOrder(orderId: string): Promise<ScannedCard[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.cards)
        .where("orderId", "==", orderId)
        .get();
      return snap.docs
        .map((d) => d.data() as ScannedCard)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
    }
    const state = await readDevMemoryState();
    return state.cards.filter((c) => c.orderId === orderId);
  },

  async logAdminAction(entry: Record<string, unknown>): Promise<void> {
    const db = dbOrMemory();
    const record = { ...entry, at: new Date().toISOString() };
    if (db) {
      await db.collection(COLLECTIONS.adminLogs).add(record);
      return;
    }
    await mutateDevMemory((state) => {
      state.adminLogs.push(record);
    });
  },

  async getInventory(storeId?: string): Promise<InventoryItem[]> {
    const id = resolveStoreId(storeId);
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.inventory)
        .where("storeId", "==", id)
        .get();
      const items = snap.docs.map((d) => d.data() as InventoryItem);
      if (items.length > 0) {
        return items.sort(
          (a, b) =>
            new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime(),
        );
      }
      const fallback = await db.collection(COLLECTIONS.inventory).get();
      return fallback.docs
        .map((d) => d.data() as InventoryItem)
        .filter((item) => inventoryStoreId(item) === id)
        .sort(
          (a, b) =>
            new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime(),
        );
    }
    const state = await readDevMemoryState();
    return (state.inventory ?? [])
      .filter((item) => inventoryStoreId(item) === id)
      .sort(
        (a, b) =>
          new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime(),
      );
  },

  async getInventoryItem(itemId: string): Promise<InventoryItem | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.inventory).doc(itemId).get();
      if (!snap.exists) return null;
      return snap.data() as InventoryItem;
    }
    const state = await readDevMemoryState();
    return (state.inventory ?? []).find((i) => i.id === itemId) ?? null;
  },

  async getInventoryByCardId(
    cardId: string,
    storeId?: string,
  ): Promise<InventoryItem | null> {
    const items = await this.getInventory(storeId);
    return items.find((i) => i.cardId === cardId) ?? null;
  },

  async saveInventoryItem(item: InventoryItem): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.inventory)
        .doc(item.id)
        .set(forFirestore(item), { merge: true });
      return;
    }
    await mutateDevMemory((state) => {
      if (!state.inventory) state.inventory = [];
      const idx = state.inventory.findIndex((i) => i.id === item.id);
      if (idx >= 0) state.inventory[idx] = item;
      else state.inventory.push(item);
    });
  },

  async clearInventoryImageCacheFailures(itemIds: string[]): Promise<number> {
    const db = dbOrMemory();
    if (!db) {
      await mutateDevMemory((state) => {
        for (const item of state.inventory ?? []) {
          if (itemIds.includes(item.id)) {
            delete item.imageCacheFailedAt;
          }
        }
      });
      return itemIds.length;
    }

    let cleared = 0;
    for (const itemId of itemIds) {
      await db.collection(COLLECTIONS.inventory).doc(itemId).update({
        imageCacheFailedAt: FieldValue.delete(),
      });
      cleared += 1;
    }
    return cleared;
  },

  async deleteInventoryByOrderId(orderId: string): Promise<number> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.inventory)
        .where("orderId", "==", orderId)
        .get();
      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      return snap.size;
    }
    let removed = 0;
    await mutateDevMemory((state) => {
      const before = state.inventory?.length ?? 0;
      state.inventory = (state.inventory ?? []).filter(
        (i) => i.orderId !== orderId,
      );
      removed = before - (state.inventory?.length ?? 0);
    });
    return removed;
  },

  async getTransactions(storeId?: string): Promise<BuybackTransaction[]> {
    const id = resolveStoreId(storeId);
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.transactions).get();
      return snap.docs
        .map((d) => d.data() as BuybackTransaction)
        .filter((tx) => transactionStoreId(tx) === id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }
    const state = await readDevMemoryState();
    return (state.transactions ?? [])
      .filter((tx) => transactionStoreId(tx) === id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },

  async saveTransaction(tx: BuybackTransaction): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.transactions)
        .doc(tx.id)
        .set(forFirestore(tx));
      return;
    }
    await mutateDevMemory((state) => {
      if (!state.transactions) state.transactions = [];
      const idx = state.transactions.findIndex((t) => t.id === tx.id);
      if (idx >= 0) state.transactions[idx] = tx;
      else state.transactions.push(tx);
    });
  },

  async saveTradeCreditEntry(entry: TradeCreditEntry): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.tradeCreditEntries)
        .doc(entry.id)
        .set(forFirestore(entry));
      return;
    }
    await mutateDevMemory((state) => {
      if (!state.tradeCreditEntries) state.tradeCreditEntries = [];
      const idx = state.tradeCreditEntries.findIndex((e) => e.id === entry.id);
      if (idx >= 0) state.tradeCreditEntries[idx] = entry;
      else state.tradeCreditEntries.push(entry);
    });
  },

  async getTradeCreditEntry(id: string): Promise<TradeCreditEntry | null> {
    const db = dbOrMemory();
    if (db) {
      const doc = await db
        .collection(COLLECTIONS.tradeCreditEntries)
        .doc(id)
        .get();
      return doc.exists ? (doc.data() as TradeCreditEntry) : null;
    }
    const state = await readDevMemoryState();
    return (state.tradeCreditEntries ?? []).find((e) => e.id === id) ?? null;
  },

  /** Oldest first, so a ledger reads top to bottom. */
  async getTradeCreditEntries(
    storeId: string,
    customerId?: string,
  ): Promise<TradeCreditEntry[]> {
    const id = resolveStoreId(storeId);
    const sortAsc = (a: TradeCreditEntry, b: TradeCreditEntry) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    const matches = (entry: TradeCreditEntry) =>
      tradeCreditStoreId(entry) === id &&
      (!customerId || entry.customerId === customerId);

    const db = dbOrMemory();
    if (db) {
      let query = db
        .collection(COLLECTIONS.tradeCreditEntries)
        .where("storeId", "==", id);
      if (customerId) {
        query = query.where("customerId", "==", customerId);
      }
      const snap = await query.get();
      return snap.docs
        .map((d) => d.data() as TradeCreditEntry)
        .filter(matches)
        .sort(sortAsc);
    }
    const state = await readDevMemoryState();
    return (state.tradeCreditEntries ?? []).filter(matches).sort(sortAsc);
  },

  async saveCollectionCard(card: CollectionCard): Promise<CollectionCard> {
    const persisted = await persistCollectionCardImages(card);
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.collectionCards)
        .doc(persisted.id)
        .set(forFirestore(persisted));
      return persisted;
    }
    await mutateDevMemory((state) => {
      if (!state.collectionCards) state.collectionCards = [];
      const idx = state.collectionCards.findIndex((c) => c.id === persisted.id);
      if (idx >= 0) state.collectionCards[idx] = persisted;
      else state.collectionCards.push(persisted);
    });
    return persisted;
  },

  async getCollectionCard(id: string): Promise<CollectionCard | null> {
    const db = dbOrMemory();
    if (db) {
      const doc = await db
        .collection(COLLECTIONS.collectionCards)
        .doc(id)
        .get();
      return doc.exists ? (doc.data() as CollectionCard) : null;
    }
    const state = await readDevMemoryState();
    return (state.collectionCards ?? []).find((c) => c.id === id) ?? null;
  },

  /** Newest first — the binder reads like a recent-scans list. */
  async getCollectionCards(
    storeId: string,
    customerId: string,
  ): Promise<CollectionCard[]> {
    const id = resolveStoreId(storeId);
    const matches = (card: CollectionCard) =>
      collectionCardStoreId(card) === id && card.customerId === customerId;
    const sortDesc = (a: CollectionCard, b: CollectionCard) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.collectionCards)
        .where("storeId", "==", id)
        .where("customerId", "==", customerId)
        .get();
      return snap.docs
        .map((d) => d.data() as CollectionCard)
        .filter(matches)
        .sort(sortDesc);
    }
    const state = await readDevMemoryState();
    return (state.collectionCards ?? []).filter(matches).sort(sortDesc);
  },

  async deleteCollectionCard(id: string): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.collectionCards).doc(id).delete();
      return;
    }
    await mutateDevMemory((state) => {
      state.collectionCards = (state.collectionCards ?? []).filter(
        (c) => c.id !== id,
      );
    });
  },

  async nextShopTicketNumber(storeId?: string): Promise<string> {
    const id = resolveStoreId(storeId);
    const db = dbOrMemory();
    if (db) {
      const counterRef = db
        .collection(COLLECTIONS.counters)
        .doc(`tickets-${id}`);
      const existingCounter = await counterRef.get();
      if (!existingCounter.exists) {
        const seeded = maxTicketSequence(await this.getShopTickets(id));
        if (seeded > 0) await counterRef.set({ value: seeded });
      }

      const num = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
        const next = current + 1;
        tx.set(counterRef, { value: next });
        return next;
      });
      return formatTicketNumber(num);
    }

    let num = 0;
    await mutateDevMemory((state) => {
      if (!state.ticketCounters) state.ticketCounters = {};
      const seeded = maxTicketSequence(
        (state.shopTickets ?? []).filter((t) => shopTicketStoreId(t) === id),
      );
      num = Math.max(state.ticketCounters[id] ?? 0, seeded) + 1;
      state.ticketCounters[id] = num;
    });
    return formatTicketNumber(num);
  },

  async saveShopTicket(ticket: ShopTicket): Promise<ShopTicket> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.shopTickets)
        .doc(ticket.id)
        .set(forFirestore(ticket));
      return ticket;
    }
    await mutateDevMemory((state) => {
      if (!state.shopTickets) state.shopTickets = [];
      const idx = state.shopTickets.findIndex((t) => t.id === ticket.id);
      if (idx >= 0) state.shopTickets[idx] = ticket;
      else state.shopTickets.push(ticket);
    });
    return ticket;
  },

  async getShopTicket(id: string): Promise<ShopTicket | null> {
    const db = dbOrMemory();
    if (db) {
      const doc = await db.collection(COLLECTIONS.shopTickets).doc(id).get();
      return doc.exists ? (doc.data() as ShopTicket) : null;
    }
    const state = await readDevMemoryState();
    return (state.shopTickets ?? []).find((t) => t.id === id) ?? null;
  },

  /** Newest first — staff want the ticket they just rang up at the top. */
  async getShopTickets(storeId?: string): Promise<ShopTicket[]> {
    const id = resolveStoreId(storeId);
    const sortDesc = (a: ShopTicket, b: ShopTicket) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.shopTickets)
        .where("storeId", "==", id)
        .get();
      return snap.docs.map((d) => d.data() as ShopTicket).sort(sortDesc);
    }
    const state = await readDevMemoryState();
    return (state.shopTickets ?? [])
      .filter((t) => shopTicketStoreId(t) === id)
      .sort(sortDesc);
  },

  async getTradeCreditEntriesByOrder(
    orderId: string,
  ): Promise<TradeCreditEntry[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.tradeCreditEntries)
        .where("orderId", "==", orderId)
        .get();
      return snap.docs.map((d) => d.data() as TradeCreditEntry);
    }
    const state = await readDevMemoryState();
    return (state.tradeCreditEntries ?? []).filter(
      (e) => e.orderId === orderId,
    );
  },

  async saveFeedback(feedback: CardFeedback): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.feedback)
        .doc(feedback.id)
        .set(forFirestore(feedback));
      return;
    }
    await mutateDevMemory((state) => {
      if (!state.feedback) state.feedback = [];
      state.feedback.push(feedback);
    });
  },

  async listFeedback(storeId?: string): Promise<CardFeedback[]> {
    const db = dbOrMemory();
    let items: CardFeedback[] = [];
    if (db) {
      const snap = await db.collection(COLLECTIONS.feedback).get();
      items = snap.docs.map((d) => d.data() as CardFeedback);
    } else {
      const state = await readDevMemoryState();
      items = state.feedback ?? [];
    }
    const filtered = storeId
      ? items.filter((f) => f.storeId === resolveStoreId(storeId))
      : items;
    return filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },

  async purgeCustomerData(storeId?: string): Promise<PurgeCustomerDataResult> {
    const stores = await this.listStores();
    const targetStoreIds = storeId
      ? [resolveStoreId(storeId)]
      : stores.map((s) => s.id);
    const storeIdSet = new Set(targetStoreIds);

    const orders = (await this.getOrders()).filter((o) =>
      storeIdSet.has(orderStoreId(o)),
    );
    const orderIds = new Set(orders.map((o) => o.id));

    const customers = (await this.getCustomers()).filter((c) =>
      storeIdSet.has(customerStoreId(c)),
    );
    const inventory = (
      storeId
        ? await this.getInventory(storeId)
        : (
            await Promise.all(targetStoreIds.map((id) => this.getInventory(id)))
          ).flat()
    );
    const transactions = (
      storeId
        ? await this.getTransactions(storeId)
        : (
            await Promise.all(
              targetStoreIds.map((id) => this.getTransactions(id)),
            )
          ).flat()
    );
    const tradeCreditEntries = (
      await Promise.all(
        targetStoreIds.map((id) => this.getTradeCreditEntries(id)),
      )
    ).flat();
    const collectionCards = (
      await Promise.all(
        customers.map((c) =>
          this.getCollectionCards(customerStoreId(c), c.id),
        ),
      )
    ).flat();
    const shopTickets = (
      await Promise.all(targetStoreIds.map((id) => this.getShopTickets(id)))
    ).flat();
    const feedback = (await this.listFeedback()).filter((f) =>
      storeIdSet.has(f.storeId?.trim() || DEFAULT_STORE_ID),
    );

    const db = dbOrMemory();
    let cardsDeleted = 0;

    if (db) {
      const cardsSnap = await db.collection(COLLECTIONS.cards).get();
      const cardIds = cardsSnap.docs
        .map((d) => d.data() as ScannedCard)
        .filter((c) => orderIds.has(c.orderId))
        .map((c) => c.id);

      cardsDeleted = await deleteFirestoreDocIds(db, COLLECTIONS.cards, cardIds);
      await deleteFirestoreDocIds(
        db,
        COLLECTIONS.orders,
        orders.map((o) => o.id),
      );
      await deleteFirestoreDocIds(
        db,
        COLLECTIONS.customers,
        customers.map((c) => c.id),
      );
      await deleteFirestoreDocIds(
        db,
        COLLECTIONS.inventory,
        inventory.map((i) => i.id),
      );
      await deleteFirestoreDocIds(
        db,
        COLLECTIONS.transactions,
        transactions.map((t) => t.id),
      );
      await deleteFirestoreDocIds(
        db,
        COLLECTIONS.tradeCreditEntries,
        tradeCreditEntries.map((e) => e.id),
      );
      await deleteFirestoreDocIds(
        db,
        COLLECTIONS.collectionCards,
        collectionCards.map((c) => c.id),
      );
      await deleteFirestoreDocIds(
        db,
        COLLECTIONS.shopTickets,
        shopTickets.map((t) => t.id),
      );
      await deleteFirestoreDocIds(
        db,
        COLLECTIONS.feedback,
        feedback.map((f) => f.id),
      );

      for (const id of targetStoreIds) {
        await db.collection(COLLECTIONS.counters).doc(`orders-${id}`).delete();
      }
    } else {
      let cardsDeletedCount = 0;
      await mutateDevMemory((state) => {
        state.orders = state.orders.filter(
          (o) => !storeIdSet.has(orderStoreId(o)),
        );
        const beforeCards = state.cards.length;
        state.cards = state.cards.filter((c) => !orderIds.has(c.orderId));
        cardsDeletedCount = beforeCards - state.cards.length;
        state.customers = state.customers.filter(
          (c) => !storeIdSet.has(customerStoreId(c)),
        );
        state.inventory = (state.inventory ?? []).filter(
          (i) => !storeIdSet.has(inventoryStoreId(i)),
        );
        state.transactions = (state.transactions ?? []).filter(
          (t) => !storeIdSet.has(transactionStoreId(t)),
        );
        state.tradeCreditEntries = (state.tradeCreditEntries ?? []).filter(
          (e) => !storeIdSet.has(tradeCreditStoreId(e)),
        );
        state.collectionCards = (state.collectionCards ?? []).filter(
          (c) => !storeIdSet.has(collectionCardStoreId(c)),
        );
        state.shopTickets = (state.shopTickets ?? []).filter(
          (t) => !storeIdSet.has(shopTicketStoreId(t)),
        );
        state.feedback = (state.feedback ?? []).filter(
          (f) => !storeIdSet.has(f.storeId?.trim() || DEFAULT_STORE_ID),
        );
        if (!state.orderCounters) state.orderCounters = {};
        if (!state.ticketCounters) state.ticketCounters = {};
        for (const id of targetStoreIds) {
          delete state.orderCounters[id];
          delete state.ticketCounters[id];
        }
      });
      cardsDeleted = cardsDeletedCount;
    }

    return {
      storeIds: targetStoreIds,
      orders: orders.length,
      cards: cardsDeleted,
      customers: customers.length,
      inventory: inventory.length,
      transactions: transactions.length,
      tradeCreditEntries: tradeCreditEntries.length,
      collectionCards: collectionCards.length,
      shopTickets: shopTickets.length,
      feedback: feedback.length,
    };
  },

  async updateFeedbackStatus(
    id: string,
    status: CardFeedback["status"],
  ): Promise<CardFeedback | null> {
    const db = dbOrMemory();
    if (db) {
      const ref = db.collection(COLLECTIONS.feedback).doc(id);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const current = snap.data() as CardFeedback;
      const updated = { ...current, status };
      await ref.set(forFirestore(updated));
      return updated;
    }
    let result: CardFeedback | null = null;
    await mutateDevMemory((state) => {
      if (!state.feedback) state.feedback = [];
      const idx = state.feedback.findIndex((f) => f.id === id);
      if (idx < 0) return;
      state.feedback[idx] = { ...state.feedback[idx]!, status };
      result = state.feedback[idx]!;
    });
    return result;
  },

  async listStoreEvents(
    storeId: string,
    options?: { from?: string; to?: string; publishedOnly?: boolean },
  ): Promise<StoreEvent[]> {
    const id = resolveStoreId(storeId);
    const db = dbOrMemory();
    let events: StoreEvent[] = [];

    if (db) {
      const snap = await db
        .collection(COLLECTIONS.storeEvents)
        .where("storeId", "==", id)
        .get();
      events = snap.docs.map((doc) =>
        normalizeStoreEvent(doc.id, doc.data() as Record<string, unknown>, id),
      );
    } else {
      const state = await readDevMemoryState();
      events = (state.storeEvents ?? []).filter((e) => e.storeId === id);
    }

    if (options?.from || options?.to) {
      const fromMs = options.from ? new Date(options.from).getTime() : 0;
      const toMs = options.to
        ? new Date(options.to).getTime()
        : Number.MAX_SAFE_INTEGER;
      events = events.filter((e) => {
        const start = new Date(e.startAt).getTime();
        const end = new Date(e.endAt).getTime();
        return end >= fromMs && start < toMs;
      });
    }

    if (options?.publishedOnly) {
      events = events.filter((e) => e.published);
    }

    return events.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
  },

  async getStoreEvent(eventId: string): Promise<StoreEvent | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db.collection(COLLECTIONS.storeEvents).doc(eventId).get();
      if (!snap.exists) return null;
      const raw = snap.data() as Record<string, unknown>;
      return normalizeStoreEvent(
        snap.id,
        raw,
        String(raw.storeId ?? raw.store_id ?? ""),
      );
    }
    const state = await readDevMemoryState();
    return (state.storeEvents ?? []).find((e) => e.id === eventId) ?? null;
  },

  async saveStoreEvent(event: StoreEvent): Promise<StoreEvent> {
    const db = dbOrMemory();
    const payload = forFirestore(event);
    if (db) {
      // Full replace — merge leaves deleted nested flyer fields in Firestore.
      await db
        .collection(COLLECTIONS.storeEvents)
        .doc(event.id)
        .set(payload);
      return event;
    }
    await mutateDevMemory((state) => {
      if (!state.storeEvents) state.storeEvents = [];
      const idx = state.storeEvents.findIndex((e) => e.id === event.id);
      if (idx >= 0) state.storeEvents[idx] = event;
      else state.storeEvents.push(event);
    });
    return event;
  },

  async deleteStoreEvent(eventId: string): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.storeEvents).doc(eventId).delete();
      return;
    }
    await mutateDevMemory((state) => {
      if (!state.storeEvents) return;
      state.storeEvents = state.storeEvents.filter((e) => e.id !== eventId);
    });
  },

  async deleteStoreEvents(eventIds: readonly string[]): Promise<number> {
    const unique = [...new Set(eventIds.filter(Boolean))];
    if (unique.length === 0) return 0;

    const db = dbOrMemory();
    if (db) {
      const batch = db.batch();
      for (const eventId of unique) {
        batch.delete(db.collection(COLLECTIONS.storeEvents).doc(eventId));
      }
      await batch.commit();
      return unique.length;
    }

    await mutateDevMemory((state) => {
      if (!state.storeEvents) return;
      const drop = new Set(unique);
      state.storeEvents = state.storeEvents.filter((e) => !drop.has(e.id));
    });
    return unique.length;
  },

  async listEventSignupsForCustomerAtStore(
    storeId: string,
    customerId: string,
    email?: string,
  ): Promise<StoreEventSignup[]> {
    const id = resolveStoreId(storeId);
    const normalizedEmail = email?.trim().toLowerCase();
    const db = dbOrMemory();
    const byId = new Map<string, StoreEventSignup>();

    const addSignup = (signup: StoreEventSignup) => {
      if (signup.storeId !== id) return;
      byId.set(signup.id, signup);
    };

    if (db) {
      const customerSnap = await db
        .collection(COLLECTIONS.storeEventSignups)
        .where("storeId", "==", id)
        .where("customerId", "==", customerId)
        .get();
      for (const doc of customerSnap.docs) {
        addSignup(
          normalizeStoreEventSignup(
            doc.id,
            doc.data() as Record<string, unknown>,
            id,
            String((doc.data() as Record<string, unknown>).eventId ?? ""),
          ),
        );
      }

      if (normalizedEmail) {
        const emailSnap = await db
          .collection(COLLECTIONS.storeEventSignups)
          .where("storeId", "==", id)
          .where("email", "==", normalizedEmail)
          .get();
        for (const doc of emailSnap.docs) {
          addSignup(
            normalizeStoreEventSignup(
              doc.id,
              doc.data() as Record<string, unknown>,
              id,
              String((doc.data() as Record<string, unknown>).eventId ?? ""),
            ),
          );
        }
      }
    } else {
      const state = await readDevMemoryState();
      for (const signup of state.storeEventSignups ?? []) {
        if (signup.storeId !== id) continue;
        if (signup.customerId === customerId) addSignup(signup);
        else if (normalizedEmail && signup.email === normalizedEmail) addSignup(signup);
      }
    }

    return [...byId.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  },

  async listEventSignups(eventId: string): Promise<StoreEventSignup[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.storeEventSignups)
        .where("eventId", "==", eventId)
        .get();
      return snap.docs
        .map((doc) =>
          normalizeStoreEventSignup(
            doc.id,
            doc.data() as Record<string, unknown>,
            String((doc.data() as Record<string, unknown>).storeId ?? ""),
            eventId,
          ),
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
    }
    const state = await readDevMemoryState();
    return (state.storeEventSignups ?? [])
      .filter((s) => s.eventId === eventId)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
  },

  async countEventSignups(eventId: string): Promise<number> {
    const signups = await this.listEventSignups(eventId);
    return signups.length;
  },

  async getEventSignupByEmail(
    eventId: string,
    email: string,
  ): Promise<StoreEventSignup | null> {
    const normalized = email.trim().toLowerCase();
    const signups = await this.listEventSignups(eventId);
    return signups.find((s) => s.email === normalized) ?? null;
  },

  async saveEventSignup(signup: StoreEventSignup): Promise<StoreEventSignup> {
    const db = dbOrMemory();
    const payload = forFirestore(signup);
    if (db) {
      await db
        .collection(COLLECTIONS.storeEventSignups)
        .doc(signup.id)
        .set(payload, { merge: true });
      return signup;
    }
    await mutateDevMemory((state) => {
      if (!state.storeEventSignups) state.storeEventSignups = [];
      const idx = state.storeEventSignups.findIndex((s) => s.id === signup.id);
      if (idx >= 0) state.storeEventSignups[idx] = signup;
      else state.storeEventSignups.push(signup);
    });
    return signup;
  },

  async deleteEventSignup(signupId: string): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db.collection(COLLECTIONS.storeEventSignups).doc(signupId).delete();
      return;
    }
    await mutateDevMemory((state) => {
      if (!state.storeEventSignups) return;
      state.storeEventSignups = state.storeEventSignups.filter(
        (s) => s.id !== signupId,
      );
    });
  },

  async saveInventoryImportSnapshot(
    snapshot: InventoryImportSnapshot,
  ): Promise<InventoryImportSnapshot> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.inventoryImportSnapshots)
        .doc(snapshot.id)
        .set(forFirestore(snapshot));
      return snapshot;
    }
    await mutateDevMemory((state) => {
      if (!state.inventoryImportSnapshots) state.inventoryImportSnapshots = [];
      state.inventoryImportSnapshots.push(snapshot);
    });
    return snapshot;
  },

  async listInventoryImportSnapshots(
    storeId: string,
    limit = 30,
  ): Promise<InventoryImportSnapshot[]> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.inventoryImportSnapshots)
        .where("storeId", "==", storeId)
        .get();
      return snap.docs
        .map((d) => d.data() as InventoryImportSnapshot)
        .sort(
          (a, b) =>
            new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
        )
        .slice(0, limit);
    }
    const state = await readDevMemoryState();
    return (state.inventoryImportSnapshots ?? [])
      .filter((s) => s.storeId === storeId)
      .sort(
        (a, b) =>
          new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
      )
      .slice(0, limit);
  },
};
