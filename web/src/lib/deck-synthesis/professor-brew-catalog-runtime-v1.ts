/**
 * Lazy runtime cache for deck resolution catalog — used by Professor brew API routes.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { loadDeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";

export const PROFESSOR_BREW_CATALOG_RUNTIME_V1_VERSION = "professor-brew-catalog-runtime-v1";

let catalogPromise: Promise<DeckResolutionCatalog> | null = null;

export async function getDeckResolutionCatalogRuntime(): Promise<DeckResolutionCatalog> {
  if (!catalogPromise) {
    catalogPromise = loadDeckResolutionCatalog();
  }
  return catalogPromise;
}

/** Test helper — reset cached catalog between tests. */
export function clearDeckResolutionCatalogRuntimeCacheForTest(): void {
  catalogPromise = null;
}
