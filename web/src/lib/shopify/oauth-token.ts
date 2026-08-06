import { encryptSecret, decryptSecret } from "../crypto/secret-encryption";
import { normalizeShopDomain } from "./mask-token";
import type { ShopifyIntegration } from "./types";

/** Refresh OAuth token this many ms before expiry. */
const REFRESH_BUFFER_MS = 60_000;

export class ShopifyOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyOAuthError";
  }
}

export function getShopifyClientSecret(
  integration: ShopifyIntegration | undefined,
): string | null {
  if (!integration?.clientSecretEncrypted) return null;
  try {
    return decryptSecret(integration.clientSecretEncrypted);
  } catch {
    return null;
  }
}

export function isOAuthAccessTokenValid(
  integration: ShopifyIntegration | undefined,
): boolean {
  if (
    !integration?.oauthAccessTokenEncrypted ||
    !integration.oauthAccessTokenExpiresAt
  ) {
    return false;
  }
  const expiresAt = new Date(integration.oauthAccessTokenExpiresAt).getTime();
  return expiresAt > Date.now() + REFRESH_BUFFER_MS;
}

export function readCachedOAuthAccessToken(
  integration: ShopifyIntegration | undefined,
): string | null {
  if (!isOAuthAccessTokenValid(integration)) return null;
  if (!integration?.oauthAccessTokenEncrypted) return null;
  try {
    return decryptSecret(integration.oauthAccessTokenEncrypted);
  } catch {
    return null;
  }
}

export function clearOAuthAccessTokenCache(
  integration: ShopifyIntegration,
): ShopifyIntegration {
  return {
    ...integration,
    oauthAccessTokenEncrypted: undefined,
    oauthAccessTokenExpiresAt: undefined,
  };
}

export function applyOAuthTokenCache(
  integration: ShopifyIntegration,
  accessToken: string,
  expiresInSeconds: number,
): ShopifyIntegration {
  const expiresIn = Math.max(60, expiresInSeconds);
  return {
    ...integration,
    oauthAccessTokenEncrypted: encryptSecret(accessToken),
    oauthAccessTokenExpiresAt: new Date(
      Date.now() + expiresIn * 1000,
    ).toISOString(),
    connectedAt: integration.connectedAt ?? new Date().toISOString(),
  };
}

export async function exchangeShopifyClientCredentials(input: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; expiresIn: number; scope?: string }> {
  const domain = normalizeShopDomain(input.shopDomain);
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!domain || !clientId || !clientSecret) {
    throw new ShopifyOAuthError(
      "Shop domain, Client ID, and Client Secret are required",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text().catch(() => "");
  let json: {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  } = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    const detail =
      json.error_description ?? json.error ?? text.slice(0, 200) ?? res.statusText;
    throw new ShopifyOAuthError(
      `Shopify OAuth failed (${res.status}): ${detail}`,
    );
  }

  if (!json.access_token) {
    throw new ShopifyOAuthError("Shopify OAuth response missing access_token");
  }

  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 86_400,
    scope: json.scope,
  };
}

/** @deprecated Legacy manually pasted Admin API tokens — prefer OAuth client credentials. */
function readLegacyAccessToken(
  integration: ShopifyIntegration | undefined,
): string | null {
  if (!integration?.accessTokenEncrypted) return null;
  try {
    return decryptSecret(integration.accessTokenEncrypted);
  } catch {
    return null;
  }
}

export async function ensureShopifyAccessToken(
  integration: ShopifyIntegration | undefined,
): Promise<{
  accessToken: string;
  integration: ShopifyIntegration;
  refreshed: boolean;
}> {
  if (!integration) {
    throw new ShopifyOAuthError("Shopify integration is not configured");
  }

  if (integration.authMethod === "legacy_admin_token") {
    const legacy = readLegacyAccessToken(integration);
    if (legacy) {
      return { accessToken: legacy, integration, refreshed: false };
    }
    throw new ShopifyOAuthError(
      "Legacy Admin API access token is required. Save it in Settings → Integrations → Shopify.",
    );
  }

  const cached = readCachedOAuthAccessToken(integration);
  if (cached) {
    return { accessToken: cached, integration, refreshed: false };
  }

  const clientId = integration.clientId?.trim();
  const clientSecret = getShopifyClientSecret(integration);
  if (clientId && clientSecret && integration.shopDomain) {
    const exchanged = await exchangeShopifyClientCredentials({
      shopDomain: integration.shopDomain,
      clientId,
      clientSecret,
    });
    const updated = applyOAuthTokenCache(
      integration,
      exchanged.accessToken,
      exchanged.expiresIn,
    );
    return {
      accessToken: exchanged.accessToken,
      integration: updated,
      refreshed: true,
    };
  }

  const legacy = readLegacyAccessToken(integration);
  if (legacy) {
    return { accessToken: legacy, integration, refreshed: false };
  }

  throw new ShopifyOAuthError(
    "Shopify Client ID and Client Secret are required. Save credentials in Settings → Integrations → Shopify.",
  );
}

export function hasShopifyOAuthCredentials(
  integration: ShopifyIntegration | undefined,
): boolean {
  return Boolean(
    integration?.shopDomain?.trim() &&
      integration.clientId?.trim() &&
      integration.clientSecretEncrypted,
  );
}
