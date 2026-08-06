/** Mask Shopify Admin API token for display — e.g. shpat_****abcd */
export function maskShopifyAccessToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "****";
  const prefix = trimmed.slice(0, 6);
  const suffix = trimmed.slice(-4);
  return `${prefix}****${suffix}`;
}

export function normalizeShopDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/\/.*$/, "");
  if (!domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}
