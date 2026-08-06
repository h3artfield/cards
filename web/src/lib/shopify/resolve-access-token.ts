import { dataStore } from "../storage/data-store";
import type { StoreSettings } from "../types";
import { ensureShopifyAccessToken } from "./oauth-token";
import type { ShopifyIntegration } from "./types";

/** Resolve a valid Shopify access token, persisting refreshed OAuth tokens to store settings. */
export async function resolveShopifyAccessTokenForStore(
  storeId: string,
  settings: StoreSettings,
): Promise<{ accessToken: string; settings: StoreSettings }> {
  const integration = settings.shopifyIntegration;
  const { accessToken, integration: updatedIntegration, refreshed } =
    await ensureShopifyAccessToken(integration);

  if (!refreshed) {
    return { accessToken, settings };
  }

  const nextSettings: StoreSettings = {
    ...settings,
    shopifyIntegration: updatedIntegration,
  };
  await dataStore.saveSettings(nextSettings);
  return { accessToken, settings: nextSettings };
}

export async function resolveShopifyAccessTokenFromIntegration(
  integration: ShopifyIntegration | undefined,
): Promise<string> {
  const { accessToken } = await ensureShopifyAccessToken(integration);
  return accessToken;
}
