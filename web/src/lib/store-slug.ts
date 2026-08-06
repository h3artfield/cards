import { getConfiguredAppUrl, resolveAppBaseUrl } from "./app-url";

/** URL-safe slug from store name. */
export function slugifyStoreName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "store"
  );
}

export function normalizeStoreSlug(slug: string | undefined, storeName: string): string {
  const raw = slug?.trim().toLowerCase() ?? "";
  const cleaned = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (cleaned.length >= 2) return cleaned.slice(0, 48);
  return slugifyStoreName(storeName);
}

export function storeCalendarPath(slug: string): string {
  return `/s/${encodeURIComponent(slug)}/calendar`;
}

export function storeCalendarEmbedPath(slug: string): string {
  return `/embed/s/${encodeURIComponent(slug)}/calendar`;
}

/** Public in-store flyer TV — portrait (vertical TV), no login. */
export function storeFlyerDisplayPath(slug: string): string {
  return `/s/${encodeURIComponent(slug)}/display`;
}

/** Public in-store flyer TV — landscape (horizontal TV), no login. */
export function storeFlyerLandscapeDisplayPath(slug: string): string {
  return `/s/${encodeURIComponent(slug)}/display/landscape`;
}

export function buildStoreFlyerDisplayUrl(slug: string, baseUrl?: string): string {
  const base = (baseUrl ?? resolveAppBaseUrl()).replace(/\/$/, "");
  return `${base}${storeFlyerDisplayPath(slug)}`;
}

export function buildStoreFlyerLandscapeDisplayUrl(
  slug: string,
  baseUrl?: string,
): string {
  const base = (baseUrl ?? resolveAppBaseUrl()).replace(/\/$/, "");
  return `${base}${storeFlyerLandscapeDisplayPath(slug)}`;
}

/** In-store flyer TV display — store email/password login. */
export function flyerDisplayLoginPath(): string {
  return "/display/login";
}

export function flyerDisplayShowPath(): string {
  return "/display/show";
}

export function buildFlyerDisplayLoginUrl(baseUrl?: string): string {
  const base = (baseUrl ?? resolveAppBaseUrl()).replace(/\/$/, "");
  return `${base}${flyerDisplayLoginPath()}`;
}

export function buildStoreCalendarUrl(slug: string, baseUrl?: string): string {
  const base = (baseUrl ?? resolveAppBaseUrl()).replace(/\/$/, "");
  return `${base}${storeCalendarPath(slug)}`;
}

export function buildStoreCalendarEmbedUrl(slug: string, baseUrl?: string): string {
  const base = (baseUrl ?? resolveAppBaseUrl()).replace(/\/$/, "");
  return `${base}${storeCalendarEmbedPath(slug)}`;
}

export function storeEntryPath(slug: string): string {
  return `/s/${encodeURIComponent(slug)}`;
}

/** Customer sign-in for a store (returning customers). */
export function storeCustomerSignInPath(slug: string): string {
  const q = new URLSearchParams({ store: slug, return: "1" });
  return `/sign-in?${q.toString()}`;
}

export function buildStoreEntryUrl(slug: string, baseUrl?: string): string {
  const base = (baseUrl ?? resolveAppBaseUrl()).replace(/\/$/, "");
  return `${base}${storeEntryPath(slug)}`;
}

export function buildStoreCustomerSignInUrl(slug: string, baseUrl?: string): string {
  const base = (baseUrl ?? resolveAppBaseUrl()).replace(/\/$/, "");
  return `${base}${storeCustomerSignInPath(slug)}`;
}

export { getConfiguredAppUrl, resolveAppBaseUrl };

export const STORE_SLUG_SESSION_KEY = "buyback_store_slug";
