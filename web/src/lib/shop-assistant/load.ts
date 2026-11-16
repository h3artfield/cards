import type { Customer, InventoryItem, StoreRule, StoreSettings, TradeCreditEntry } from "../types";
import type { ShopCustomerName, ShopToolData, ShopToolNeed } from "./types";

/**
 * Loads what a tool needs and nothing more, and keeps each kind of data per
 * store for a minute so a burst of questions does not re-read the database.
 * Only loaded data is kept; answers are never cached.
 */

export const SHOP_DATA_TTL_MS = 60_000;

/** Where the data comes from. The route passes `dataStore`; tests pass fakes. */
export type ShopDataSources = {
  getInventory(storeId: string): Promise<InventoryItem[]>;
  getCustomers(storeId: string): Promise<Customer[]>;
  getTradeCreditEntries(storeId: string): Promise<TradeCreditEntry[]>;
  getSettings(storeId: string): Promise<StoreSettings>;
  getActiveRules(storeId: string): Promise<StoreRule[]>;
};

type Loaded = {
  inventory: InventoryItem[];
  customers: ShopCustomerName[];
  creditEntries: TradeCreditEntry[];
  settings: StoreSettings;
  rules: StoreRule[];
};

export type ShopDataLoader = {
  /** `storeId` must come from the signed-in session's store scope. */
  load(storeId: string, needs: ReadonlyArray<ShopToolNeed>): Promise<ShopToolData>;
  clear(): void;
};

export function createShopDataLoader(
  sources: ShopDataSources,
  options: { ttlMs?: number; now?: () => number } = {},
): ShopDataLoader {
  const ttlMs = options.ttlMs ?? SHOP_DATA_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  const fetchers: { [K in ShopToolNeed]: (storeId: string) => Promise<Loaded[K]> } = {
    inventory: (storeId) => sources.getInventory(storeId),
    // Names only. Emails, phones and addresses are dropped here, before the
    // list is cached or handed to any tool.
    customers: async (storeId) =>
      (await sources.getCustomers(storeId)).map(
        (c): ShopCustomerName => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }),
      ),
    creditEntries: (storeId) => sources.getTradeCreditEntries(storeId),
    settings: (storeId) => sources.getSettings(storeId),
    rules: (storeId) => sources.getActiveRules(storeId),
  };

  function get<K extends ShopToolNeed>(storeId: string, kind: K): Promise<Loaded[K]> {
    // JSON keeps two different (storeId, kind) pairs from ever sharing a key.
    const key = JSON.stringify([storeId, kind]);
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value as Promise<Loaded[K]>;
    const value = fetchers[kind](storeId);
    const entry = { at: now(), value };
    cache.set(key, entry);
    // A failed read is not kept, so the next question tries again.
    value.catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
    return value;
  }

  return {
    async load(storeId, needs) {
      if (!storeId) throw new Error("shop assistant: a store is required");
      const want = new Set(needs);
      const pick = <K extends ShopToolNeed>(kind: K): Promise<Loaded[K] | undefined> =>
        want.has(kind) ? get(storeId, kind) : Promise.resolve(undefined);
      const [inventory, customers, creditEntries, settings, rules] = await Promise.all([
        pick("inventory"),
        pick("customers"),
        pick("creditEntries"),
        pick("settings"),
        pick("rules"),
      ]);
      return {
        storeId,
        inventory: inventory ?? [],
        customers: customers ?? [],
        creditEntries: creditEntries ?? [],
        settings: settings ?? null,
        rules: rules ?? [],
      };
    },
    clear() {
      cache.clear();
    },
  };
}
