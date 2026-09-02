import { dataStore } from "../storage/data-store";
import type { InventoryItem } from "../types";
import {
  formatShopifyApiErrorMessage,
  setShopifyInventoryQuantity,
  updateShopifyVariantPrice,
} from "./client";
import { hasShopifyListing, planCatalogListingSync } from "./inventory-listing";
import { resolveShopifyAccessTokenForStore } from "./resolve-access-token";
import type { ShopifyIntegration } from "./types";

export type CatalogSyncOutcome = {
  inventoryItemId: string;
  displayName: string;
  quantity?: number;
  price?: number;
  quantityPushed: boolean;
  pricePushed: boolean;
  error?: string;
};

export type CatalogSyncSummary = {
  considered: number;
  quantityPushed: number;
  pricePushed: number;
  unchanged: number;
  failed: number;
  outcomes: CatalogSyncOutcome[];
};

/**
 * Push CSV quantity and price onto existing Shopify listings. Runs after a
 * TCGplayer re-import so the storefront never oversells what we hold.
 */
export async function syncShopifyListingsForItems(input: {
  items: InventoryItem[];
  integration: ShopifyIntegration | undefined;
  accessToken: string | undefined;
}): Promise<CatalogSyncSummary> {
  const summary: CatalogSyncSummary = {
    considered: 0,
    quantityPushed: 0,
    pricePushed: 0,
    unchanged: 0,
    failed: 0,
    outcomes: [],
  };

  const integration = input.integration;
  const domain = integration?.shopDomain;
  const locationId = integration?.defaultLocationId;
  if (!integration?.enabled || !domain || !input.accessToken) {
    return summary;
  }

  for (const item of input.items) {
    if (!hasShopifyListing(item)) continue;
    const listing = item.shopifyListing!;
    summary.considered += 1;

    const plan = planCatalogListingSync(item, integration);
    if (!plan.quantityChanged && !plan.priceChanged) {
      summary.unchanged += 1;
      continue;
    }

    const outcome: CatalogSyncOutcome = {
      inventoryItemId: item.id,
      displayName: item.displayName,
      quantity: plan.quantity,
      price: plan.price ?? undefined,
      quantityPushed: false,
      pricePushed: false,
    };

    try {
      if (plan.quantityChanged) {
        if (!locationId || !listing.inventoryItemId) {
          throw new Error(
            "Shopify location or inventory item id missing — re-export this row.",
          );
        }
        await setShopifyInventoryQuantity({
          shopDomain: domain,
          accessToken: input.accessToken,
          inventoryItemId: listing.inventoryItemId,
          locationId,
          quantity: plan.quantity,
        });
        outcome.quantityPushed = true;
        summary.quantityPushed += 1;
      }

      if (plan.priceChanged && plan.price != null) {
        await updateShopifyVariantPrice({
          shopDomain: domain,
          accessToken: input.accessToken,
          productId: listing.productId,
          variantId: listing.variantId,
          price: plan.price.toFixed(2),
        });
        outcome.pricePushed = true;
        summary.pricePushed += 1;
      }

      await dataStore.saveInventoryItem(
        applySyncResult(item, {
          quantity: outcome.quantityPushed ? plan.quantity : undefined,
          price: outcome.pricePushed ? plan.price ?? undefined : undefined,
        }),
      );
    } catch (err) {
      const message = formatShopifyApiErrorMessage(err);
      outcome.error = message;
      summary.failed += 1;
      await dataStore.saveInventoryItem(
        applySyncResult(item, { error: message }),
      );
    }

    summary.outcomes.push(outcome);
  }

  return summary;
}

/**
 * Called right after a CSV import commits. Never throws: the import already
 * succeeded, and a Shopify outage must not fail it.
 */
export async function pushShopifyLevelsAfterImport(
  storeId: string,
  items: InventoryItem[],
): Promise<CatalogSyncSummary> {
  const empty: CatalogSyncSummary = {
    considered: 0,
    quantityPushed: 0,
    pricePushed: 0,
    unchanged: 0,
    failed: 0,
    outcomes: [],
  };

  if (!items.some(hasShopifyListing)) return empty;

  try {
    const settings = await dataStore.getSettings(storeId);
    if (!settings.shopifyIntegration?.enabled) return empty;

    const { accessToken, settings: withToken } =
      await resolveShopifyAccessTokenForStore(storeId, settings);

    return await syncShopifyListingsForItems({
      items,
      integration: withToken.shopifyIntegration ?? settings.shopifyIntegration,
      accessToken,
    });
  } catch (err) {
    console.error("[shopify] inventory level sync after import failed:", err);
    return {
      ...empty,
      failed: items.filter(hasShopifyListing).length,
    };
  }
}

/** Record what Shopify now holds so the next import can diff against it. */
export function applySyncResult(
  item: InventoryItem,
  result: { quantity?: number; price?: number; error?: string },
): InventoryItem {
  const listing = item.shopifyListing;
  if (!listing) return item;

  const now = new Date().toISOString();
  return {
    ...item,
    shopifyListing: {
      ...listing,
      syncedQuantity: result.quantity ?? listing.syncedQuantity,
      exportPrice: result.price ?? listing.exportPrice,
      syncedAt: result.error ? listing.syncedAt : now,
      syncError: result.error,
    },
  };
}
