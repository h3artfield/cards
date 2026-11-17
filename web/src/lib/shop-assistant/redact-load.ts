import type { ShopDataLoader } from "./load";
import { buildRedactor, type Redactor } from "./redact";
import type { ShopCustomerName } from "./types";

/**
 * The redactor for a store, built from the names the loader already caches
 * and rebuilt only when that list is reloaded or the staff list changes.
 */
export const STAFF_NAMES_TTL_MS = 60_000;

export type ShopRedaction = { forStore(storeId: string): Promise<Redactor> };

export function createShopRedaction(
  loader: ShopDataLoader,
  staffNames: (storeId: string) => Promise<string[]>,
  now: () => number = Date.now,
): ShopRedaction {
  const built = new WeakMap<ShopCustomerName[], { staffKey: string; redactor: Redactor }>();
  // The staff list changes rarely; it is re-read at most once a minute per store.
  const staffCache = new Map<string, { at: number; names: Promise<string[]> }>();
  const staffFor = (storeId: string): Promise<string[]> => {
    const hit = staffCache.get(storeId);
    if (hit && now() - hit.at < STAFF_NAMES_TTL_MS) return hit.names;
    const entry = { at: now(), names: staffNames(storeId) };
    staffCache.set(storeId, entry);
    entry.names.catch(() => {
      if (staffCache.get(storeId) === entry) staffCache.delete(storeId);
    });
    return entry.names;
  };
  return {
    async forStore(storeId) {
      const [data, staff] = await Promise.all([loader.load(storeId, ["customers"]), staffFor(storeId)]);
      const staffKey = JSON.stringify(staff);
      const hit = built.get(data.customers);
      if (hit && hit.staffKey === staffKey) return hit.redactor;
      const redactor = buildRedactor(data.customers, staff);
      built.set(data.customers, { staffKey, redactor });
      return redactor;
    },
  };
}
