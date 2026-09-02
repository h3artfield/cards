/**
 * Shopify cart permalinks. Sending shoppers to Shopify's own cart URL keeps
 * every payment inside Shopify — no Storefront API token, and guests work.
 */
export type CheckoutPermalinkLine = {
  variantId: string;
  quantity: number;
};

/** Shopify variant ids are stored as GIDs; permalinks need the numeric id. */
export function shopifyVariantNumericId(
  variantId: string | undefined,
): string | null {
  if (!variantId) return null;
  const trimmed = variantId.trim();
  if (!trimmed) return null;

  const fromGid = trimmed.match(/ProductVariant\/(\d+)/);
  if (fromGid) return fromGid[1]!;

  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function checkoutHost(shopDomain: string): string | null {
  const host = shopDomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return host || null;
}

export function buildShopifyCheckoutUrl(input: {
  shopDomain: string | undefined;
  lines: CheckoutPermalinkLine[];
}): string | null {
  if (!input.shopDomain) return null;
  const host = checkoutHost(input.shopDomain);
  if (!host) return null;

  const parts: string[] = [];
  for (const line of input.lines) {
    const id = shopifyVariantNumericId(line.variantId);
    const quantity = Math.max(1, Math.trunc(line.quantity) || 1);
    if (!id) continue;
    parts.push(`${id}:${quantity}`);
  }

  if (!parts.length) return null;
  return `https://${host}/cart/${parts.join(",")}`;
}
