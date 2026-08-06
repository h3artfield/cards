import type { ShopifyIntegration, ShopifyIntegrationPublic } from "./types";
import { normalizeShopDomain } from "./mask-token";
import {
  hasShopifyOAuthCredentials,
  isOAuthAccessTokenValid,
} from "./oauth-token";

const DEFAULTS: ShopifyIntegration = {
  enabled: false,
  authMethod: "client_credentials",
  defaultProductStatus: "DRAFT",
  publishOnlineStore: false,
  publishShopChannel: false,
  defaultProductType: "Trading Card",
  defaultTags: ["cardscanner9000", "buyback", "single"],
  priceStrategy: "marketPrice",
  markupPercent: 0,
  requireStaffConfirmedOnly: false,
};

export function normalizeShopifyIntegration(
  raw: Record<string, unknown> | undefined,
): ShopifyIntegration | undefined {
  if (!raw) return undefined;
  const enabled = Boolean(raw.enabled);
  if (
    !enabled &&
    !raw.shopDomain &&
    !raw.clientSecretEncrypted &&
    !raw.accessTokenEncrypted
  ) {
    return { ...DEFAULTS, enabled: false };
  }
  return {
    ...DEFAULTS,
    enabled,
    authMethod: inferAuthMethod(raw),
    shopDomain: raw.shopDomain
      ? normalizeShopDomain(String(raw.shopDomain))
      : raw.shop_domain
        ? normalizeShopDomain(String(raw.shop_domain))
        : undefined,
    clientId:
      raw.clientId != null
        ? String(raw.clientId)
        : raw.client_id != null
          ? String(raw.client_id)
          : undefined,
    clientSecretEncrypted:
      raw.clientSecretEncrypted != null
        ? String(raw.clientSecretEncrypted)
        : raw.client_secret_encrypted != null
          ? String(raw.client_secret_encrypted)
          : undefined,
    oauthAccessTokenEncrypted:
      raw.oauthAccessTokenEncrypted != null
        ? String(raw.oauthAccessTokenEncrypted)
        : raw.oauth_access_token_encrypted != null
          ? String(raw.oauth_access_token_encrypted)
          : undefined,
    oauthAccessTokenExpiresAt:
      raw.oauthAccessTokenExpiresAt != null
        ? String(raw.oauthAccessTokenExpiresAt)
        : raw.oauth_access_token_expires_at != null
          ? String(raw.oauth_access_token_expires_at)
          : undefined,
    accessTokenEncrypted:
      raw.accessTokenEncrypted != null
        ? String(raw.accessTokenEncrypted)
        : raw.access_token_encrypted != null
          ? String(raw.access_token_encrypted)
          : undefined,
    defaultLocationId:
      raw.defaultLocationId != null
        ? String(raw.defaultLocationId)
        : raw.default_location_id != null
          ? String(raw.default_location_id)
          : undefined,
    defaultCollectionId:
      raw.defaultCollectionId != null
        ? String(raw.defaultCollectionId)
        : raw.default_collection_id != null
          ? String(raw.default_collection_id)
          : undefined,
    defaultProductStatus:
      raw.defaultProductStatus === "ACTIVE" ||
      raw.default_product_status === "ACTIVE"
        ? "ACTIVE"
        : "DRAFT",
    publishOnlineStore: Boolean(
      raw.publishOnlineStore ?? raw.publish_online_store ?? false,
    ),
    publishShopChannel: Boolean(
      raw.publishShopChannel ?? raw.publish_shop_channel ?? false,
    ),
    defaultVendor:
      raw.defaultVendor != null
        ? String(raw.defaultVendor)
        : raw.default_vendor != null
          ? String(raw.default_vendor)
          : undefined,
    defaultProductType:
      raw.defaultProductType != null
        ? String(raw.defaultProductType)
        : raw.default_product_type != null
          ? String(raw.default_product_type)
          : DEFAULTS.defaultProductType,
    defaultTags: Array.isArray(raw.defaultTags)
      ? raw.defaultTags.map(String)
      : Array.isArray(raw.default_tags)
        ? raw.default_tags.map(String)
        : DEFAULTS.defaultTags,
    priceStrategy:
      raw.priceStrategy === "marketPlusMarkup" ||
      raw.price_strategy === "marketPlusMarkup"
        ? "marketPlusMarkup"
        : raw.priceStrategy === "manual" || raw.price_strategy === "manual"
          ? "manual"
          : "marketPrice",
    markupPercent:
      raw.markupPercent != null
        ? Number(raw.markupPercent)
        : raw.markup_percent != null
          ? Number(raw.markup_percent)
          : 0,
    requireStaffConfirmedOnly: Boolean(
      raw.requireStaffConfirmedOnly ?? raw.require_staff_confirmed_only ?? false,
    ),
    connectedAt:
      raw.connectedAt != null
        ? String(raw.connectedAt)
        : raw.connected_at != null
          ? String(raw.connected_at)
          : undefined,
    lastTestedAt:
      raw.lastTestedAt != null
        ? String(raw.lastTestedAt)
        : raw.last_tested_at != null
          ? String(raw.last_tested_at)
          : undefined,
    lastTestResult:
      raw.lastTestResult === "success" || raw.last_test_result === "success"
        ? "success"
        : raw.lastTestResult === "failed" || raw.last_test_result === "failed"
          ? "failed"
          : undefined,
    lastTestError:
      raw.lastTestError != null
        ? String(raw.lastTestError)
        : raw.last_test_error != null
          ? String(raw.last_test_error)
          : undefined,
    lastTestScopes: Array.isArray(raw.lastTestScopes)
      ? raw.lastTestScopes.map(String)
      : Array.isArray(raw.last_test_scopes)
        ? raw.last_test_scopes.map(String)
        : undefined,
    canWriteProducts:
      raw.canWriteProducts != null
        ? Boolean(raw.canWriteProducts)
        : raw.can_write_products != null
          ? Boolean(raw.can_write_products)
          : undefined,
    canReadLocations:
      raw.canReadLocations != null
        ? Boolean(raw.canReadLocations)
        : raw.can_read_locations != null
          ? Boolean(raw.can_read_locations)
          : undefined,
    canReadInventory:
      raw.canReadInventory != null
        ? Boolean(raw.canReadInventory)
        : raw.can_read_inventory != null
          ? Boolean(raw.can_read_inventory)
          : undefined,
    canReadOrders:
      raw.canReadOrders != null
        ? Boolean(raw.canReadOrders)
        : raw.can_read_orders != null
          ? Boolean(raw.can_read_orders)
          : undefined,
    ordersPaidWebhookId:
      raw.ordersPaidWebhookId != null
        ? String(raw.ordersPaidWebhookId)
        : raw.orders_paid_webhook_id != null
          ? String(raw.orders_paid_webhook_id)
          : undefined,
    inventoryLevelsWebhookId:
      raw.inventoryLevelsWebhookId != null
        ? String(raw.inventoryLevelsWebhookId)
        : raw.inventory_levels_webhook_id != null
          ? String(raw.inventory_levels_webhook_id)
          : undefined,
    inventoryLevelsWebhookRegisteredAt:
      raw.inventoryLevelsWebhookRegisteredAt != null
        ? String(raw.inventoryLevelsWebhookRegisteredAt)
        : raw.inventory_levels_webhook_registered_at != null
          ? String(raw.inventory_levels_webhook_registered_at)
          : undefined,
    ordersPaidWebhookRegisteredAt:
      raw.ordersPaidWebhookRegisteredAt != null
        ? String(raw.ordersPaidWebhookRegisteredAt)
        : raw.orders_paid_webhook_registered_at != null
          ? String(raw.orders_paid_webhook_registered_at)
          : undefined,
    ordersPaidWebhookLastError:
      raw.ordersPaidWebhookLastError != null
        ? String(raw.ordersPaidWebhookLastError)
        : raw.orders_paid_webhook_last_error != null
          ? String(raw.orders_paid_webhook_last_error)
          : undefined,
    soldDetectionWebhookLastError:
      raw.soldDetectionWebhookLastError != null
        ? String(raw.soldDetectionWebhookLastError)
        : raw.sold_detection_webhook_last_error != null
          ? String(raw.sold_detection_webhook_last_error)
          : undefined,
  };
}

function inferAuthMethod(raw: Record<string, unknown>): ShopifyIntegration["authMethod"] {
  if (
    raw.authMethod === "legacy_admin_token" ||
    raw.auth_method === "legacy_admin_token"
  ) {
    return "legacy_admin_token";
  }
  if (
    raw.authMethod === "client_credentials" ||
    raw.auth_method === "client_credentials"
  ) {
    return "client_credentials";
  }
  if (raw.accessTokenEncrypted || raw.access_token_encrypted) {
    if (!raw.clientSecretEncrypted && !raw.client_secret_encrypted) {
      return "legacy_admin_token";
    }
  }
  return "client_credentials";
}

export function toPublicShopifyIntegration(
  integration: ShopifyIntegration | undefined,
): ShopifyIntegrationPublic | undefined {
  if (!integration) return undefined;
  const {
    clientSecretEncrypted,
    oauthAccessTokenEncrypted,
    accessTokenEncrypted,
    ...rest
  } = integration;
  return {
    ...rest,
    authMethod: integration.authMethod ?? "client_credentials",
    hasClientSecret: Boolean(clientSecretEncrypted),
    hasLegacyAccessToken: Boolean(accessTokenEncrypted),
    hasValidAccessToken:
      isOAuthAccessTokenValid(integration) ||
      (integration.authMethod === "legacy_admin_token" &&
        Boolean(accessTokenEncrypted)),
  };
}

export function shopifyIntegrationReady(
  integration: ShopifyIntegration | undefined,
): boolean {
  if (!integration?.enabled) return false;
  if (integration.authMethod === "legacy_admin_token") {
    return Boolean(integration.accessTokenEncrypted);
  }
  return (
    hasShopifyOAuthCredentials(integration) ||
    Boolean(integration.accessTokenEncrypted)
  );
}
