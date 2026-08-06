import type {
  BuybackOrder,
  Customer,
  ScannedCard,
  StoreRule,
  StoreSettings,
} from "../types";
import { DEFAULT_STORE_SETTINGS } from "../constants";

const KEYS = {
  customers: "buyback_customers",
  orders: "buyback_orders",
  cards: "buyback_cards",
  rules: "buyback_rules",
  settings: "buyback_settings",
  counter: "buyback_order_counter",
  adminLogs: "buyback_admin_logs",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const localStore = {
  getCustomers(): Customer[] {
    return read(KEYS.customers, []);
  },
  saveCustomer(customer: Customer): Customer {
    const customers = this.getCustomers();
    const idx = customers.findIndex((c) => c.id === customer.id);
    if (idx >= 0) customers[idx] = customer;
    else customers.push(customer);
    write(KEYS.customers, customers);
    return customer;
  },
  getCustomer(id: string): Customer | undefined {
    return this.getCustomers().find((c) => c.id === id);
  },
  getCustomerByEmail(email: string): Customer | undefined {
    return this.getCustomers().find(
      (c) => c.email.toLowerCase() === email.toLowerCase(),
    );
  },

  getOrders(): BuybackOrder[] {
    return read(KEYS.orders, []);
  },
  saveOrder(order: BuybackOrder): BuybackOrder {
    const orders = this.getOrders();
    const idx = orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) orders[idx] = order;
    else orders.push(order);
    write(KEYS.orders, orders);
    return order;
  },
  getOrder(id: string): BuybackOrder | undefined {
    return this.getOrders().find((o) => o.id === id);
  },
  getOrdersByCustomer(customerId: string): BuybackOrder[] {
    return this.getOrders().filter((o) => o.customerId === customerId);
  },
  nextOrderNumber(): string {
    const counter = read(KEYS.counter, 0) + 1;
    write(KEYS.counter, counter);
    return `BB-${String(counter).padStart(6, "0")}`;
  },

  getCards(): ScannedCard[] {
    return read(KEYS.cards, []);
  },
  saveCard(card: ScannedCard): ScannedCard {
    const cards = this.getCards();
    const idx = cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) cards[idx] = card;
    else cards.push(card);
    write(KEYS.cards, cards);
    return card;
  },
  getCard(id: string): ScannedCard | undefined {
    return this.getCards().find((c) => c.id === id);
  },
  getCardsByOrder(orderId: string): ScannedCard[] {
    return this.getCards().filter((c) => c.orderId === orderId);
  },

  getRules(): StoreRule[] {
    return read(KEYS.rules, []);
  },
  saveRules(rules: StoreRule[]): void {
    write(KEYS.rules, rules);
  },

  getSettings(): StoreSettings {
    return read(KEYS.settings, { id: "default", ...DEFAULT_STORE_SETTINGS });
  },
  saveSettings(settings: StoreSettings): void {
    write(KEYS.settings, settings);
  },

  logAdminAction(entry: Record<string, unknown>): void {
    const logs = read<Record<string, unknown>[]>(KEYS.adminLogs, []);
    logs.push({ ...entry, at: new Date().toISOString() });
    write(KEYS.adminLogs, logs);
  },
};
