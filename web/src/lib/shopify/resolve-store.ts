import { normalizeShopDomain } from "./mask-token";
import { dataStore } from "../storage/data-store";

/** Find store id by Shopify shop domain from webhook headers. */
export async function resolveStoreIdFromShopDomain(
  shopDomainHeader: string,
): Promise<string | null> {
  const normalized = normalizeShopDomain(shopDomainHeader.trim());
  if (!normalized) return null;

  const stores = await dataStore.listStores();
  for (const store of stores) {
    const domain = store.shopifyIntegration?.shopDomain;
    if (!domain) continue;
    if (normalizeShopDomain(domain) === normalized) {
      return store.id;
    }
  }

  return null;
}
