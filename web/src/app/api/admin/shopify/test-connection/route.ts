import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-encryption";
import {
  applyOAuthTokenCache,
  exchangeShopifyClientCredentials,
  getShopifyClientSecret,
  ShopifyOAuthError,
} from "@/lib/shopify/oauth-token";
import { toPublicShopifyIntegration } from "@/lib/shopify/normalize-integration";
import { testShopifyConnection } from "@/lib/shopify/client";
import { validateShopDomain } from "@/lib/shopify/shop-domain";
import type { ShopifyAuthMethod, ShopifyIntegration } from "@/lib/shopify/types";
import { getAppBaseUrl } from "@/lib/stripe/config";
import {
  ensureShopifySoldDetectionWebhooks,
  shopifySoldDetectionWebhookUrl,
} from "@/lib/shopify/webhook-register";

function readLegacyToken(integration: ShopifyIntegration | undefined): string | null {
  if (!integration?.accessTokenEncrypted) return null;
  try {
    return decryptSecret(integration.accessTokenEncrypted);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return auth;
  const scope = requireStoreScope(auth, req);
  if (scope instanceof Response) return scope;

  const body = (await req.json()) as {
    shopDomain?: string;
    authMethod?: ShopifyAuthMethod;
    clientId?: string;
    clientSecret?: string;
    legacyAccessToken?: string;
    saveCredentials?: boolean;
  };

  const settings = await dataStore.getSettings(scope.storeId);
  const integration = settings.shopifyIntegration;
  const authMethod: ShopifyAuthMethod =
    body.authMethod ??
    integration?.authMethod ??
    "client_credentials";

  const domainInput =
    body.shopDomain?.trim() || integration?.shopDomain || "";
  const domainCheck = validateShopDomain(domainInput);
  if (!domainCheck.ok) {
    return jsonError(domainCheck.error, 400);
  }
  const domain = domainCheck.domain;

  try {
    let accessToken: string;
    let oauthScope: string | undefined;
    let oauthExpiresIn: number | undefined;

    if (authMethod === "legacy_admin_token") {
      accessToken =
        body.legacyAccessToken?.trim() ||
        readLegacyToken(integration) ||
        "";
      if (!accessToken) {
        return jsonError(
          "Legacy Admin API access token is required to test connection",
          400,
        );
      }
    } else {
      const clientId = body.clientId?.trim() || integration?.clientId || "";
      const clientSecret =
        body.clientSecret?.trim() || getShopifyClientSecret(integration) || "";
      if (!clientId || !clientSecret) {
        return jsonError(
          "Shopify Client ID and Client Secret are required to test connection",
          400,
        );
      }
      const oauth = await exchangeShopifyClientCredentials({
        shopDomain: domain,
        clientId,
        clientSecret,
      });
      accessToken = oauth.accessToken;
      oauthScope = oauth.scope;
      oauthExpiresIn = oauth.expiresIn;
    }

    const result = await testShopifyConnection(domain, accessToken, oauthScope);
    const now = new Date().toISOString();

    if (!result.canWriteProducts) {
      const scopeMsg =
        result.missingScopes.length > 0
          ? `Missing scopes: ${result.missingScopes.join(", ")}`
          : "App lacks write_products permission";
      throw new ShopifyOAuthError(
        `Connected to ${result.shopName}, but product export is not allowed. ${scopeMsg}. Check scopes in Shopify Dev Dashboard → App → Configuration.`,
      );
    }

    let shopifyIntegration: ShopifyIntegration = {
      ...(integration ?? {
        enabled: false,
        defaultProductStatus: "DRAFT" as const,
        publishOnlineStore: false,
        publishShopChannel: false,
        priceStrategy: "marketPrice" as const,
      }),
      authMethod,
      shopDomain: domain,
      lastTestedAt: now,
      lastTestResult: "success",
      lastTestError: undefined,
      lastTestScopes: result.grantedScopes,
      canWriteProducts: result.canWriteProducts,
      canReadLocations: result.canReadLocations,
      canReadInventory: result.canReadInventory,
      canReadOrders: result.canReadOrders,
      connectedAt: integration?.connectedAt ?? now,
    };

    let webhookRegistration:
      | {
          ok: true;
          inventoryLevels: { webhookId: string; created: boolean; uri: string };
          ordersPaid?: { webhookId: string; created: boolean; uri: string };
          ordersPaidSkippedReason?: string;
        }
      | { ok: false; error: string }
      | undefined;

    const appBase = getAppBaseUrl();
    const callbackUrl = shopifySoldDetectionWebhookUrl(appBase);
    const canRegisterWebhook =
      !callbackUrl.includes("localhost") && !callbackUrl.includes("127.0.0.1");

    if (canRegisterWebhook) {
      try {
        const webhooks = await ensureShopifySoldDetectionWebhooks({
          shopDomain: domain,
          accessToken,
          callbackUrl,
          existingInventoryLevelsWebhookId:
            shopifyIntegration.inventoryLevelsWebhookId ??
            integration?.inventoryLevelsWebhookId,
          existingOrdersPaidWebhookId:
            shopifyIntegration.ordersPaidWebhookId ??
            integration?.ordersPaidWebhookId,
          tryOrdersPaid: result.canReadOrders,
        });

        shopifyIntegration = {
          ...shopifyIntegration,
          inventoryLevelsWebhookId: webhooks.inventoryLevels.webhookId,
          inventoryLevelsWebhookRegisteredAt:
            webhooks.inventoryLevels.created ||
            !shopifyIntegration.inventoryLevelsWebhookRegisteredAt
              ? now
              : shopifyIntegration.inventoryLevelsWebhookRegisteredAt,
          ordersPaidWebhookId: webhooks.ordersPaid?.webhookId,
          ordersPaidWebhookRegisteredAt: webhooks.ordersPaid
            ? webhooks.ordersPaid.created ||
              !shopifyIntegration.ordersPaidWebhookRegisteredAt
              ? now
              : shopifyIntegration.ordersPaidWebhookRegisteredAt
            : shopifyIntegration.ordersPaidWebhookRegisteredAt,
          ordersPaidWebhookLastError: webhooks.ordersPaidSkippedReason,
          soldDetectionWebhookLastError: undefined,
        };

        webhookRegistration = {
          ok: true,
          inventoryLevels: {
            webhookId: webhooks.inventoryLevels.webhookId,
            created: webhooks.inventoryLevels.created,
            uri: webhooks.inventoryLevels.uri,
          },
          ordersPaid: webhooks.ordersPaid
            ? {
                webhookId: webhooks.ordersPaid.webhookId,
                created: webhooks.ordersPaid.created,
                uri: webhooks.ordersPaid.uri,
              }
            : undefined,
          ordersPaidSkippedReason: webhooks.ordersPaidSkippedReason,
        };
      } catch (webhookErr) {
        const webhookError =
          webhookErr instanceof Error
            ? webhookErr.message
            : "Webhook registration failed";
        console.warn("[shopify test-connection] webhook registration:", webhookError);
        shopifyIntegration = {
          ...shopifyIntegration,
          soldDetectionWebhookLastError: webhookError,
        };
        webhookRegistration = { ok: false, error: webhookError };
      }
    } else {
      webhookRegistration = {
        ok: false,
        error: "Webhook auto-registration requires a public APP_URL (not localhost).",
      };
    }

    if (authMethod === "client_credentials") {
      shopifyIntegration.clientId =
        body.clientId?.trim() || integration?.clientId;
      if (oauthExpiresIn != null) {
        shopifyIntegration = applyOAuthTokenCache(
          shopifyIntegration,
          accessToken,
          oauthExpiresIn,
        );
      }
      if (body.clientSecret?.trim()) {
        shopifyIntegration.clientSecretEncrypted = encryptSecret(
          body.clientSecret.trim(),
        );
      }
      shopifyIntegration.accessTokenEncrypted = undefined;
    } else {
      if (body.legacyAccessToken?.trim()) {
        shopifyIntegration.accessTokenEncrypted = encryptSecret(
          body.legacyAccessToken.trim(),
        );
      } else {
        shopifyIntegration.accessTokenEncrypted =
          integration?.accessTokenEncrypted;
      }
      shopifyIntegration.clientId = undefined;
      shopifyIntegration.clientSecretEncrypted = undefined;
      shopifyIntegration.oauthAccessTokenEncrypted = undefined;
      shopifyIntegration.oauthAccessTokenExpiresAt = undefined;
    }

    if (body.saveCredentials !== false) {
      await dataStore.saveSettings({
        ...settings,
        shopifyIntegration,
      });
    }

    return jsonOk({
      ok: true,
      shopName: result.shopName,
      domain: result.domain,
      locations: result.locations,
      canReadPublications: result.canReadPublications,
      grantedScopes: result.grantedScopes,
      canWriteProducts: result.canWriteProducts,
      canReadLocations: result.canReadLocations,
      canReadInventory: result.canReadInventory,
      canReadOrders: result.canReadOrders,
      missingScopes: result.missingScopes,
      missingSoldDetectionScopes: result.missingSoldDetectionScopes,
      soldDetectionWebhookUrl: shopifySoldDetectionWebhookUrl(getAppBaseUrl()),
      webhookRegistration,
      shopify: toPublicShopifyIntegration(shopifyIntegration),
    });
  } catch (err) {
    const message =
      err instanceof ShopifyOAuthError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Connection failed";
    try {
      const settings = await dataStore.getSettings(scope.storeId);
      if (settings.shopifyIntegration) {
        await dataStore.saveSettings({
          ...settings,
          shopifyIntegration: {
            ...settings.shopifyIntegration,
            authMethod,
            shopDomain: domainCheck.ok ? domainCheck.domain : settings.shopifyIntegration.shopDomain,
            lastTestedAt: new Date().toISOString(),
            lastTestResult: "failed",
            lastTestError: message,
          },
        });
      }
    } catch {
      /* ignore secondary failure */
    }
    return jsonError(message, 502);
  }
}
