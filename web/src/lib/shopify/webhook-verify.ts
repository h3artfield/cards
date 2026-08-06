import { createHmac, timingSafeEqual } from "crypto";
import { decryptSecret } from "../crypto/secret-encryption";
import { getShopifyClientSecret } from "./oauth-token";
import type { ShopifyIntegration } from "./types";

export function getShopifyWebhookSecret(
  integration?: ShopifyIntegration,
): string | null {
  const env = process.env.SHOPIFY_WEBHOOK_SECRET?.trim();
  if (env) return env;

  const clientSecret = getShopifyClientSecret(integration);
  if (clientSecret) return clientSecret;

  if (integration?.accessTokenEncrypted) {
    try {
      return decryptSecret(integration.accessTokenEncrypted);
    } catch {
      return null;
    }
  }

  return null;
}

/** Verify Shopify webhook HMAC (X-Shopify-Hmac-Sha256). */
export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string,
): boolean {
  if (!hmacHeader?.trim()) return false;

  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    const expected = Buffer.from(digest, "utf8");
    const received = Buffer.from(hmacHeader.trim(), "utf8");
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}
