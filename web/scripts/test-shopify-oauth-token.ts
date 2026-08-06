/**
 * Shopify OAuth client credentials helpers.
 * Run: npx tsx scripts/test-shopify-oauth-token.ts
 */
import { encryptSecret } from "../src/lib/crypto/secret-encryption";
import {
  applyOAuthTokenCache,
  clearOAuthAccessTokenCache,
  isOAuthAccessTokenValid,
  readCachedOAuthAccessToken,
} from "../src/lib/shopify/oauth-token";
import { toPublicShopifyIntegration } from "../src/lib/shopify/normalize-integration";
import type { ShopifyIntegration } from "../src/lib/shopify/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\nShopify OAuth token cache\n");

const base: ShopifyIntegration = {
  enabled: true,
  shopDomain: "the-game-lodge.myshopify.com",
  clientId: "test-client-id",
  clientSecretEncrypted: encryptSecret("test-client-secret"),
  defaultProductStatus: "DRAFT",
  publishOnlineStore: false,
  publishShopChannel: false,
  priceStrategy: "marketPrice",
};

const cached = applyOAuthTokenCache(base, "shpua_test_access_token_xyz", 3600);
assert(
  Boolean(cached.oauthAccessTokenEncrypted),
  "stores encrypted oauth access token",
);
assert(
  Boolean(cached.oauthAccessTokenExpiresAt),
  "stores oauth token expiry",
);
assert(isOAuthAccessTokenValid(cached), "fresh token is valid");
assert(
  readCachedOAuthAccessToken(cached) === "shpua_test_access_token_xyz",
  "can read cached token server-side",
);

const expired: ShopifyIntegration = {
  ...cached,
  oauthAccessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
};
assert(!isOAuthAccessTokenValid(expired), "expired token is invalid");

const cleared = clearOAuthAccessTokenCache(cached);
assert(
  !cleared.oauthAccessTokenEncrypted && !cleared.oauthAccessTokenExpiresAt,
  "clear cache removes oauth token fields",
);

const pub = toPublicShopifyIntegration(cached);
assert(pub?.hasClientSecret === true, "public view hasClientSecret");
assert(pub?.hasValidAccessToken === true, "public view hasValidAccessToken");
assert(
  !("clientSecretEncrypted" in (pub ?? {})),
  "public view omits clientSecretEncrypted",
);
assert(
  !("oauthAccessTokenEncrypted" in (pub ?? {})),
  "public view omits oauthAccessTokenEncrypted",
);
assert(
  !("accessTokenMasked" in (pub ?? {})),
  "public view never exposes token mask",
);
assert(pub?.authMethod === "client_credentials", "public view includes authMethod");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
