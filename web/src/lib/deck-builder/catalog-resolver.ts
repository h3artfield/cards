import { deckBuilderStore } from "./deck-builder-store";
import { fetchScryfallCardById } from "./scryfall-catalog";
import type { CatalogCard } from "./types";
import type { InventoryItem } from "../types";
import { resolveCatalogForEnrichment } from "./inventory-catalog-enrichment";

/** Load catalog card from cache, or fetch from Scryfall and persist. */
export async function ensureCatalogCard(
  scryfallId: string,
  cache?: Map<string, CatalogCard | null>,
): Promise<CatalogCard | null> {
  if (cache?.has(scryfallId)) {
    return cache.get(scryfallId) ?? null;
  }

  let card = await deckBuilderStore.getCatalogCard(scryfallId);
  if (!card) {
    card = await fetchScryfallCardById(scryfallId);
    if (card) {
      await deckBuilderStore.saveCatalogCard(card);
    }
  }

  cache?.set(scryfallId, card ?? null);
  return card;
}

/** Resolve Scryfall card from inventory set name + collector number. */
export async function lookupCatalogBySetNumber(input: {
  setName?: string;
  cardNumber?: string;
  productName?: string;
  cache?: Map<string, CatalogCard | null>;
}): Promise<CatalogCard | null> {
  if (!input.setName || !input.cardNumber) return null;

  const cacheKey = `set:${input.setName}:${input.cardNumber}:${input.productName ?? ""}`;
  if (input.cache?.has(cacheKey)) {
    return input.cache.get(cacheKey) ?? null;
  }

  const resolved = await resolveCatalogForEnrichment({
    id: "",
    storeId: "",
    displayName: input.productName ?? "",
    acquiredAt: "",
    setName: input.setName,
    cardNumber: input.cardNumber,
    productName: input.productName,
  } as InventoryItem);

  const card = "catalog" in resolved ? resolved.catalog : null;
  input.cache?.set(cacheKey, card);
  if (card) input.cache?.set(card.id, card);
  return card;
}

/** Best-effort catalog lookup for a store inventory row. */
export async function resolveCatalogForInventoryItem(input: {
  item: InventoryItem;
  scryfallId?: string;
  cache?: Map<string, CatalogCard | null>;
}): Promise<CatalogCard | null> {
  if (input.scryfallId) {
    return ensureCatalogCard(input.scryfallId, input.cache);
  }
  return lookupCatalogBySetNumber({
    setName: input.item.setName,
    cardNumber: input.item.cardNumber,
    cache: input.cache,
  });
}

/** Preload catalog cards for all crosswalk Scryfall IDs (fills cache misses from API). */
export async function preloadCatalogByScryfallIds(
  scryfallIds: string[],
  cache: Map<string, CatalogCard | null>,
  maxFetches = 80,
): Promise<void> {
  const unique = [...new Set(scryfallIds.filter(Boolean))];
  for (const id of unique) {
    const cached = await deckBuilderStore.getCatalogCard(id);
    if (cached) cache.set(id, cached);
  }

  let fetches = 0;
  for (const id of unique) {
    if (cache.has(id)) continue;
    if (fetches >= maxFetches) break;
    fetches += 1;
    await ensureCatalogCard(id, cache);
  }
}
