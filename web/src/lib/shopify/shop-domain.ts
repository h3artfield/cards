import { normalizeShopDomain } from "./mask-token";

export type ShopDomainValidationResult =
  | { ok: true; domain: string }
  | { ok: false; error: string };

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate Shopify shop domain — rejects emails and non-.myshopify.com hosts. */
export function validateShopDomain(input: string): ShopDomainValidationResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: "Shopify shop domain is required." };
  }

  if (EMAIL_LIKE.test(raw) || (raw.includes("@") && !raw.includes(".myshopify.com"))) {
    return {
      ok: false,
      error:
        "Enter your Shopify .myshopify.com domain, not an email address.",
    };
  }

  const domain = normalizeShopDomain(raw);
  if (!domain.endsWith(".myshopify.com")) {
    return {
      ok: false,
      error:
        "Enter a valid Shopify shop domain ending in .myshopify.com (e.g. the-game-lodge.myshopify.com).",
    };
  }

  const shopHandle = domain.slice(0, -".myshopify.com".length);
  if (!shopHandle || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(shopHandle)) {
    return {
      ok: false,
      error: "Invalid Shopify shop domain format.",
    };
  }

  return { ok: true, domain };
}

/** Scopes Card Scanner needs for inventory export. */
export const SHOPIFY_EXPORT_REQUIRED_SCOPES = [
  "write_products",
  "read_products",
  "read_locations",
  "write_inventory",
] as const;

/** Additional scopes for Shopify sold detection (inventory webhooks). */
export const SHOPIFY_SOLD_DETECTION_SCOPES = [
  ...SHOPIFY_EXPORT_REQUIRED_SCOPES,
  "read_inventory",
] as const;

export function evaluateShopifyExportScopes(scopeString?: string): {
  grantedScopes: string[];
  canWriteProducts: boolean;
  canReadLocations: boolean;
  canReadInventory: boolean;
  canReadOrders: boolean;
  missingScopes: string[];
  missingSoldDetectionScopes: string[];
} {
  const grantedScopes = (scopeString ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const has = (scope: string) => grantedScopes.includes(scope);

  const canWriteProducts = has("write_products");
  const canReadLocations = has("read_locations");
  // Shopify often grants write_inventory without listing read_inventory separately.
  const canReadInventory = has("read_inventory") || has("write_inventory");
  const canReadOrders = has("read_orders");

  const missingScopes = SHOPIFY_EXPORT_REQUIRED_SCOPES.filter((required) => {
    if (required === "write_products") return !canWriteProducts;
    if (required === "read_locations") return !canReadLocations;
    return !grantedScopes.includes(required);
  });

  const missingSoldDetectionScopes = SHOPIFY_SOLD_DETECTION_SCOPES.filter(
    (required) => {
      if (required === "write_products") return !canWriteProducts;
      if (required === "read_locations") return !canReadLocations;
      if (required === "read_inventory") return !canReadInventory;
      return !grantedScopes.includes(required);
    },
  );

  return {
    grantedScopes,
    canWriteProducts,
    canReadLocations,
    canReadInventory,
    canReadOrders,
    missingScopes: [...missingScopes],
    missingSoldDetectionScopes: [...missingSoldDetectionScopes],
  };
}
