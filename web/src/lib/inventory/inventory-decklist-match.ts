import { parseDecklistText } from "../commander-strategy/deck-resolver-v1";
import { resolveStoreBySlug } from "../deck-builder/deck-builder-service";
import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import { getCachedStoreInventory } from "../deck-builder/store-inventory-cache";
import { inventoryEffectiveQuantity } from "../inventory/status";
import { cardNameFromInventoryItem } from "../inventory/image-fallback";
import { isMagicInventoryItem } from "../inventory/magic-items";
import { inventoryImageProxyPath } from "../inventory/resolve-display-image";
import { normalizeCardNameForMatch } from "../store-inventory/clerk-tools/magic-commander-inventory";
import type { InventoryItem } from "../types";

export type DecklistMatchCard = {
  inventoryItemId: string;
  name: string;
  scryfallId?: string;
  imageUrl?: string;
  imageProxyUrl?: string;
  qty: number;
  listPrice?: number;
  colorIdentity: string[];
  isCommander?: boolean;
  typeLine?: string;
  setName?: string;
};

export type DecklistMatchResult = {
  inStock: DecklistMatchCard[];
  outOfStock: Array<{ name: string; quantity: number }>;
  unmatched: string[];
};

function isProfessorBrewInventoryCandidate(item: InventoryItem): boolean {
  if (!isMagicInventoryItem(item)) return false;
  if (item.category && item.category !== "magic") return false;
  const blob = `${item.productLine ?? ""} ${item.productName ?? ""} ${item.displayName ?? ""}`.toLowerCase();
  if (
    blob.includes("pokemon") ||
    blob.includes("pokémon") ||
    blob.includes("yu-gi-oh") ||
    blob.includes("yugioh")
  ) {
    return false;
  }
  return true;
}

function buildLookups(items: InventoryItem[]) {
  const byNormalizedName = new Map<string, InventoryItem>();
  const byOracleId = new Map<string, InventoryItem>();
  for (const item of items) {
    if (!isProfessorBrewInventoryCandidate(item)) continue;
    const key = normalizeCardNameForMatch(cardNameFromInventoryItem(item));
    if (key && !byNormalizedName.has(key)) byNormalizedName.set(key, item);
    const oracleId = item.catalogOracleId?.trim();
    if (oracleId && !byOracleId.has(oracleId)) byOracleId.set(oracleId, item);
  }
  return { byNormalizedName, byOracleId };
}

function toMatchCard(item: InventoryItem, storeSlug: string): DecklistMatchCard {
  const qty = inventoryEffectiveQuantity(item);
  const name =
    item.productName ??
    item.displayName.split(" — ")[0]?.trim() ??
    item.displayName;
  return {
    inventoryItemId: item.id,
    name,
    scryfallId: item.catalogScryfallId,
    imageUrl: item.imageUrl ?? item.imageUrls?.[0],
    imageProxyUrl: inventoryImageProxyPath(storeSlug, item.id),
    qty,
    listPrice: item.listPrice,
    colorIdentity: item.catalogColorIdentity ?? [],
    isCommander: item.catalogCanBeSoleCommander === true,
    typeLine: item.catalogTypeLine,
    setName: item.setName,
  };
}

async function resolveItem(args: {
  deckCardName: string;
  byNormalizedName: Map<string, InventoryItem>;
  byOracleId: Map<string, InventoryItem>;
  oracleCache: Map<string, string | null>;
}): Promise<InventoryItem | null> {
  const deckKey = normalizeCardNameForMatch(args.deckCardName);
  const exact = deckKey ? args.byNormalizedName.get(deckKey) : null;
  if (
    exact &&
    normalizeCardNameForMatch(cardNameFromInventoryItem(exact)) === deckKey
  ) {
    return exact;
  }

  let oracleId = args.oracleCache.get(args.deckCardName);
  if (oracleId === undefined) {
    try {
      const oracle = await deckBuilderStore.findCatalogOracleByCanonicalName(
        args.deckCardName.trim(),
      );
      oracleId = oracle?.id?.trim() ?? null;
    } catch {
      oracleId = null;
    }
    args.oracleCache.set(args.deckCardName, oracleId);
  }
  return oracleId ? args.byOracleId.get(oracleId) ?? null : null;
}

function expandDecklistNames(decklistText: string): Array<{ name: string; quantity: number }> {
  const parsed = parseDecklistText(decklistText);
  const rows: Array<{ name: string; quantity: number }> = [];
  for (const row of [...parsed.commanders, ...parsed.mainboard]) {
    rows.push({ name: row.name.trim(), quantity: row.quantity });
  }
  if (rows.length === 0) {
    for (const rawLine of decklistText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("#")) continue;
      const match =
        line.match(/^(\d+)\s+x?\s*(.+)$/i) ?? line.match(/^(.+?)\s+x(\d+)$/i);
      if (!match) {
        rows.push({ name: line, quantity: 1 });
        continue;
      }
      const quantity =
        match[1] && /^\d+$/.test(match[1])
          ? Number.parseInt(match[1], 10)
          : Number.parseInt(match[2], 10);
      const name = (match[1] && /^\d+$/.test(match[1]) ? match[2] : match[1]).trim();
      if (name && Number.isFinite(quantity) && quantity > 0) {
        rows.push({ name, quantity });
      }
    }
  }
  return rows;
}

export async function matchDecklistToStoreInventory(args: {
  storeSlug: string;
  decklistText: string;
}): Promise<DecklistMatchResult> {
  const store = await resolveStoreBySlug(args.storeSlug);
  if (!store) return { inStock: [], outOfStock: [], unmatched: [] };

  const rows = expandDecklistNames(args.decklistText);
  const candidates = (await getCachedStoreInventory(store.id)).filter(
    isProfessorBrewInventoryCandidate,
  );
  const { byNormalizedName, byOracleId } = buildLookups(candidates);
  const oracleCache = new Map<string, string | null>();
  const inStock: DecklistMatchCard[] = [];
  const outOfStock: Array<{ name: string; quantity: number }> = [];
  const unmatched: string[] = [];
  const seenInStock = new Set<string>();

  for (const row of rows) {
    const item = await resolveItem({
      deckCardName: row.name,
      byNormalizedName,
      byOracleId,
      oracleCache,
    });
    if (!item) {
      unmatched.push(row.name);
      continue;
    }
    const qty = inventoryEffectiveQuantity(item);
    if (qty <= 0) {
      outOfStock.push({ name: row.name, quantity: row.quantity });
      continue;
    }
    if (seenInStock.has(item.id)) continue;
    seenInStock.add(item.id);
    inStock.push(toMatchCard(item, args.storeSlug));
  }

  return { inStock, outOfStock, unmatched };
}
