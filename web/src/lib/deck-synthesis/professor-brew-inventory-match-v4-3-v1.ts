/**
 * Match Professor brew deck card names against a store's browseable magic inventory.
 * Returns in-stock names only — deck art always comes from Scryfall, not inventory photos.
 */
import { resolveStoreBySlug } from "../deck-builder/deck-builder-service";
import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import { getCachedStoreInventory } from "../deck-builder/store-inventory-cache";
import { inventoryEffectiveQuantity } from "../inventory/status";
import { cardNameFromInventoryItem } from "../inventory/image-fallback";
import { isMagicInventoryItem } from "../inventory/magic-items";
import { normalizeCardNameForMatch } from "../store-inventory/clerk-tools/magic-commander-inventory";
import type { InventoryItem } from "../types";

export const PROFESSOR_BREW_INVENTORY_MATCH_V4_3_V1_VERSION =
  "professor-brew-inventory-match-v4-3-v1";

export type ProfessorDeckInventoryEntryV43 = {
  listPrice: number | null;
  quantity: number;
  /** Shelf item backing this match, so the deck editor can add it to the cart. */
  inventoryItemId?: string;
  setName?: string;
};

export type ProfessorBrewInventoryMatchResultV43 = {
  inStockNames: string[];
  /** Deprecated — always empty; inventory photos must not override Scryfall deck art. */
  imageUrls: Record<string, string>;
  inventoryByName: Record<string, ProfessorDeckInventoryEntryV43>;
};

function isNonMagicProductBlob(item: InventoryItem): boolean {
  const blob = `${item.productLine ?? ""} ${item.productName ?? ""} ${item.displayName ?? ""}`.toLowerCase();
  return (
    blob.includes("pokemon") ||
    blob.includes("pokémon") ||
    blob.includes("yu-gi-oh") ||
    blob.includes("yugioh") ||
    blob.includes("digimon")
  );
}

function isProfessorBrewInventoryCandidate(item: InventoryItem): boolean {
  if (!isMagicInventoryItem(item)) return false;
  if (item.category && item.category !== "magic") return false;
  if (isNonMagicProductBlob(item)) return false;
  return true;
}

function buildMagicInventoryLookups(items: InventoryItem[]): {
  byNormalizedName: Map<string, InventoryItem>;
  byOracleId: Map<string, InventoryItem>;
} {
  const byNormalizedName = new Map<string, InventoryItem>();
  const byOracleId = new Map<string, InventoryItem>();

  for (const item of items) {
    if (!isProfessorBrewInventoryCandidate(item)) continue;

    const name = cardNameFromInventoryItem(item);
    const key = normalizeCardNameForMatch(name);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, item);

    const oracleId = item.catalogOracleId?.trim();
    if (oracleId && !byOracleId.has(oracleId)) byOracleId.set(oracleId, item);
  }

  return { byNormalizedName, byOracleId };
}

function exactInventoryNameMatch(
  deckCardName: string,
  byNormalizedName: Map<string, InventoryItem>,
): InventoryItem | null {
  const deckKey = normalizeCardNameForMatch(deckCardName);
  if (!deckKey) return null;

  const item = byNormalizedName.get(deckKey);
  if (!item) return null;

  return normalizeCardNameForMatch(cardNameFromInventoryItem(item)) === deckKey ? item : null;
}

function inventoryEntryFromItem(item: InventoryItem): ProfessorDeckInventoryEntryV43 {
  const quantity =
    item.quantityOnHand ??
    item.quantity ??
    inventoryEffectiveQuantity(item);
  return {
    listPrice: item.listPrice ?? null,
    quantity: Math.max(0, quantity),
    inventoryItemId: item.id,
    setName: item.setName,
  };
}

async function resolveDeckCardInventoryItem(args: {
  deckCardName: string;
  byNormalizedName: Map<string, InventoryItem>;
  byOracleId: Map<string, InventoryItem>;
  oracleCache: Map<string, string | null>;
}): Promise<InventoryItem | null> {
  const exact = exactInventoryNameMatch(args.deckCardName, args.byNormalizedName);
  if (exact) return exact;

  let oracleId = args.oracleCache.get(args.deckCardName);
  if (oracleId === undefined) {
    try {
      const oracle = await deckBuilderStore.findCatalogOracleByCanonicalName(args.deckCardName.trim());
      oracleId = oracle?.id?.trim() ?? null;
    } catch {
      oracleId = null;
    }
    args.oracleCache.set(args.deckCardName, oracleId);
  }

  return oracleId ? args.byOracleId.get(oracleId) ?? null : null;
}

export async function matchProfessorDeckCardsInStoreInventory(args: {
  storeSlug: string;
  cardNames: string[];
}): Promise<ProfessorBrewInventoryMatchResultV43> {
  const store = await resolveStoreBySlug(args.storeSlug);
  if (!store) return { inStockNames: [], imageUrls: {}, inventoryByName: {} };

  const candidates = (await getCachedStoreInventory(store.id)).filter(isProfessorBrewInventoryCandidate);
  const { byNormalizedName, byOracleId } = buildMagicInventoryLookups(candidates);
  const uniqueNames = [...new Set(args.cardNames.map((n) => n.trim()).filter(Boolean))];
  const oracleCache = new Map<string, string | null>();
  const inventoryByName: Record<string, ProfessorDeckInventoryEntryV43> = {};

  const matched = await Promise.all(
    uniqueNames.map(async (name) => {
      const item = await resolveDeckCardInventoryItem({
        deckCardName: name,
        byNormalizedName,
        byOracleId,
        oracleCache,
      });
      if (!item) return null;
      const entry = inventoryEntryFromItem(item);
      if (entry.quantity <= 0) return null;
      inventoryByName[name] = entry;
      return name;
    }),
  );

  const inStockNames = matched.filter((name): name is string => Boolean(name)).sort((a, b) => a.localeCompare(b));
  return { inStockNames, imageUrls: {}, inventoryByName };
}
