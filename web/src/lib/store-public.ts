import { dataStore } from "./storage/data-store";
import type { StoreSettings } from "./types";

export function normalizeStoreSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function getPublicStoreBySlug(
  slug: string,
): Promise<StoreSettings | null> {
  return dataStore.getStoreBySlug(normalizeStoreSlug(slug));
}
