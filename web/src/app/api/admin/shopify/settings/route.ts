import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { encryptSecret } from "@/lib/crypto/secret-encryption";
import {
  clearOAuthAccessTokenCache,
  getShopifyClientSecret,
} from "@/lib/shopify/oauth-token";
import {
  normalizeShopifyIntegration,
  toPublicShopifyIntegration,
} from "@/lib/shopify/normalize-integration";
import { validateShopDomain } from "@/lib/shopify/shop-domain";
import { shopifySoldDetectionWebhookUrl } from "@/lib/shopify/webhook-register";
import { getAppBaseUrl } from "@/lib/stripe/config";
import type { ShopifyAuthMethod, ShopifyIntegration } from "@/lib/shopify/types";

function credentialsChanged(
  base: ShopifyIntegration,
  next: ShopifyIntegration,
  newClientSecret?: string,
  newLegacyToken?: string,
): boolean {
  if (newClientSecret?.trim()) return true;
  if (newLegacyToken?.trim()) return true;
  if ((base.shopDomain ?? "") !== (next.shopDomain ?? "")) return true;
  if ((base.clientId ?? "") !== (next.clientId ?? "")) return true;
  if ((base.authMethod ?? "client_credentials") !== (next.authMethod ?? "client_credentials")) {
    return true;
  }
  return false;
}

function mergeShopifySettings(
  current: ShopifyIntegration | undefined,
  body: Record<string, unknown>,
): ShopifyIntegration | { error: string } {
  const base = normalizeShopifyIntegration(
    (current ?? { enabled: false }) as unknown as Record<string, unknown>,
  )!;

  const authMethod: ShopifyAuthMethod =
    body.authMethod === "legacy_admin_token"
      ? "legacy_admin_token"
      : body.authMethod === "client_credentials"
        ? "client_credentials"
        : base.authMethod ?? "client_credentials";

  let nextShopDomain = base.shopDomain;
  if (body.shopDomain != null) {
    const check = validateShopDomain(String(body.shopDomain));
    if (!check.ok) return { error: check.error };
    nextShopDomain = check.domain;
  }

  const nextClientId =
    body.clientId != null ? String(body.clientId).trim() : base.clientId;

  let next: ShopifyIntegration = {
    ...base,
    enabled: body.enabled != null ? Boolean(body.enabled) : base.enabled,
    authMethod,
    shopDomain: nextShopDomain,
    clientId: authMethod === "client_credentials" ? nextClientId || undefined : undefined,
    defaultLocationId:
      body.defaultLocationId != null
        ? String(body.defaultLocationId)
        : base.defaultLocationId,
    defaultCollectionId:
      body.defaultCollectionId != null
        ? String(body.defaultCollectionId)
        : base.defaultCollectionId,
    defaultProductStatus:
      body.defaultProductStatus === "ACTIVE"
        ? "ACTIVE"
        : body.defaultProductStatus === "DRAFT"
          ? "DRAFT"
          : base.defaultProductStatus,
    publishOnlineStore: Boolean(
      body.publishOnlineStore ?? base.publishOnlineStore,
    ),
    publishShopChannel: Boolean(
      body.publishShopChannel ?? base.publishShopChannel,
    ),
    defaultVendor:
      body.defaultVendor != null
        ? String(body.defaultVendor)
        : base.defaultVendor,
    defaultProductType:
      body.defaultProductType != null
        ? String(body.defaultProductType)
        : base.defaultProductType,
    defaultTags: Array.isArray(body.defaultTags)
      ? body.defaultTags.map(String)
      : base.defaultTags,
    priceStrategy:
      body.priceStrategy === "marketPlusMarkup"
        ? "marketPlusMarkup"
        : body.priceStrategy === "manual"
          ? "manual"
          : "marketPrice",
    markupPercent:
      body.markupPercent != null
        ? Number(body.markupPercent)
        : base.markupPercent,
    requireStaffConfirmedOnly: Boolean(
      body.requireStaffConfirmedOnly ?? base.requireStaffConfirmedOnly,
    ),
  };

  if (authMethod === "client_credentials") {
    const newClientSecret =
      typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
    if (newClientSecret) {
      next.clientSecretEncrypted = encryptSecret(newClientSecret);
      next.connectedAt = new Date().toISOString();
    } else {
      next.clientSecretEncrypted = base.clientSecretEncrypted;
    }
    if (body.clearClientSecret === true) {
      next.clientSecretEncrypted = undefined;
      next = clearOAuthAccessTokenCache(next);
    }
    next.accessTokenEncrypted = undefined;
  } else {
    const newLegacyToken =
      typeof body.legacyAccessToken === "string"
        ? body.legacyAccessToken.trim()
        : "";
    if (newLegacyToken) {
      next.accessTokenEncrypted = encryptSecret(newLegacyToken);
      next.connectedAt = new Date().toISOString();
    } else {
      next.accessTokenEncrypted = base.accessTokenEncrypted;
    }
    if (body.clearLegacyAccessToken === true) {
      next.accessTokenEncrypted = undefined;
    }
    next.clientId = undefined;
    next.clientSecretEncrypted = undefined;
    next = clearOAuthAccessTokenCache(next);
  }

  if (
    credentialsChanged(
      base,
      next,
      typeof body.clientSecret === "string" ? body.clientSecret : undefined,
      typeof body.legacyAccessToken === "string" ? body.legacyAccessToken : undefined,
    )
  ) {
    next = clearOAuthAccessTokenCache(next);
  }

  return next;
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const settings = await dataStore.getSettings(scope.storeId);
    return jsonOk({
      shopify: toPublicShopifyIntegration(settings.shopifyIntegration),
      soldDetectionWebhookUrl: shopifySoldDetectionWebhookUrl(getAppBaseUrl()),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as Record<string, unknown>;
    const current = await dataStore.getSettings(scope.storeId);
    const merged = mergeShopifySettings(current.shopifyIntegration, body);
    if ("error" in merged) {
      return jsonError(merged.error, 400);
    }
    const shopifyIntegration = merged;

    if (shopifyIntegration.enabled) {
      if (!shopifyIntegration.shopDomain?.trim()) {
        return jsonError("Shopify shop domain is required", 400);
      }
      if (shopifyIntegration.authMethod === "legacy_admin_token") {
        if (!shopifyIntegration.accessTokenEncrypted) {
          return jsonError("Legacy Admin API access token is required", 400);
        }
      } else {
        if (!shopifyIntegration.clientId?.trim()) {
          return jsonError("Shopify Client ID is required", 400);
        }
        if (!getShopifyClientSecret(shopifyIntegration)) {
          return jsonError("Shopify Client Secret is required", 400);
        }
      }
    }

    const settings = {
      ...current,
      shopifyIntegration,
    };
    await dataStore.saveSettings(settings);
    await dataStore.logAdminAction({ action: "update_shopify_settings" });

    return jsonOk({
      shopify: toPublicShopifyIntegration(shopifyIntegration),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
