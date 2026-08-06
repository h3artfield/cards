import { dataStore } from "../../storage/data-store";
import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "../../inventory/status";
import { isClerkEligibleInventory } from "../../inventory/catalog-link-identity";
import {
  inventoryImageProxyPath,
  pickInventoryDisplayImageUrl,
} from "../../inventory/resolve-display-image";
import {
  browseStoreInventory,
  listInventoryCommanders,
  type StoreInventoryCard,
  type StoreInventoryColorFilter,
} from "../../deck-builder/store-inventory-browse";
import { cardCatalogLookupByName } from "./card-catalog";
import {
  isLegalCommanderForHit,
  isLegalCommanderForInventoryCard,
} from "./commander-eligibility";
import {
  parseClerkInventoryQuery,
  parseColorFromQuery,
  parseMaxPriceFromQuery,
} from "./clerk-query-parser";
import type { InventoryItem } from "../../types";

export function parseColorFromQuestion(q: string): StoreInventoryColorFilter {
  return parseColorFromQuery(q) ?? "all";
}

export function matchesColor(
  colors: string[],
  filter: StoreInventoryColorFilter,
): boolean {
  if (filter === "all") return true;
  const id = colors ?? [];
  if (filter === "C") return id.length === 0;
  if (filter === "multicolor") return id.length >= 2;
  if (filter === "two") return id.length === 2;
  if (filter === "three") return id.length === 3;
  if (filter === "four") return id.length === 4;
  if (filter === "five") return id.length >= 5;
  if (["W", "U", "B", "R", "G"].includes(filter)) {
    return id.length === 1 && id[0] === filter;
  }
  return true;
}

function parseMaxPrice(q: string, explicit?: number): number | undefined {
  return parseMaxPriceFromQuery(q, explicit);
}

function inferMagicItem(item: InventoryItem): boolean {
  if (item.category === "magic") return true;
  const line = (item.productLine ?? "").toLowerCase();
  return line.includes("magic") || line.includes("mtg");
}

function inventoryItemName(item: InventoryItem): string {
  return (
    item.productName ??
    item.displayName.split(" — ")[0]?.trim() ??
    item.displayName
  );
}

/** Normalize card names for inventory ↔ EDHREC matching. */
export function normalizeCardNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s—\s.*$/u, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

export function buildInventoryNameIndex(
  items: StoreInventoryCard[],
): Map<string, StoreInventoryCard> {
  const index = new Map<string, StoreInventoryCard>();
  for (const item of items) {
    const key = normalizeCardNameForMatch(item.name);
    if (!index.has(key)) index.set(key, item);
  }
  return index;
}

export function findInventoryExactMatch(
  index: Map<string, StoreInventoryCard>,
  commanderName: string,
): StoreInventoryCard | undefined {
  return index.get(normalizeCardNameForMatch(commanderName));
}

export function findInventoryMatch(
  index: Map<string, StoreInventoryCard>,
  commanderName: string,
): StoreInventoryCard | undefined {
  const exact = findInventoryExactMatch(index, commanderName);
  if (exact) return exact;

  const key = normalizeCardNameForMatch(commanderName);
  for (const [candidateKey, card] of index) {
    if (candidateKey.length < 4 || key.length < 4) continue;
    if (candidateKey.includes(key) || key.includes(candidateKey)) return card;
  }
  return undefined;
}

/** Full magic singles pool for EDHREC name matching — no pagination cap. */
export async function loadMagicInventoryMatchPool(input: {
  storeId: string;
  storeSlug: string;
}): Promise<StoreInventoryCard[]> {
  const all = (await dataStore.getInventory(input.storeId)).filter(
    (i) =>
      isCatalogImportItem(i) &&
      isInventoryAvailable(i) &&
      inventoryEffectiveQuantity(i) > 0 &&
      inferMagicItem(i) &&
      isClerkEligibleInventory(i),
  );

  const crosswalks = await deckBuilderStore.listCrosswalks(input.storeId);
  const crosswalkByItem = new Map(
    crosswalks.map((c) => [c.inventoryItemId, c.scryfallId]),
  );

  return all.map((item) => ({
    inventoryItemId: item.id,
    scryfallId: crosswalkByItem.get(item.id) ?? item.catalogScryfallId,
    oracleId: item.catalogOracleId,
    name: inventoryItemName(item),
    imageUrl: pickInventoryDisplayImageUrl(item),
    imageProxyUrl: inventoryImageProxyPath(input.storeSlug, item.id),
    qty: inventoryEffectiveQuantity(item),
    listPrice: item.listPrice,
    tcgLowPrice: item.tcgLowPrice,
    setName: item.setName,
    cardNumber: item.cardNumber,
    category: "magic" as const,
    productLine: item.productLine,
    condition: item.tcgplayerCondition ?? item.condition,
    colorIdentity: item.catalogColorIdentity ?? [],
    isCommander: item.catalogCanBeSoleCommander ?? false,
    typeLine: item.catalogTypeLine,
    cmc: item.catalogCmc,
    manaCost: item.catalogManaCost,
    oracleText: item.catalogOracleText,
    keywords: item.catalogKeywords,
    oracleTags: item.catalogOracleTags,
    rarity: item.catalogRarity,
  }));
}

/** @deprecated Commander eligibility must come from oracle classification. */
export function isVerifiedCommander(
  _typeLine?: string,
  _commanderFormatLegal?: boolean,
): boolean {
  return false;
}

/** @deprecated Use loadMagicInventoryMatchPool + EDHREC ranking in the specialist. */
export async function loadMagicInventoryForClerk(input: {
  storeId: string;
  storeSlug: string;
  userQuestion: string;
  maxPrice?: number;
}): Promise<StoreInventoryCard[]> {
  const color = parseColorFromQuestion(input.userQuestion);
  const maxPrice =
    input.maxPrice ?? parseMaxPrice(input.userQuestion) ?? undefined;

  let items = await listInventoryCommanders({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    color: "all",
    limit: 250,
  });

  if (items.length < 5) {
    items = await loadMagicInventoryMatchPool(input);
  }

  if (maxPrice != null) {
    items = items.filter((c) => {
      const p = c.listPrice ?? c.tcgLowPrice;
      return p == null || p <= maxPrice;
    });
  }

  const commanders = await enrichCommanderCandidates(items);

  if (color === "all") return commanders;

  return commanders.filter((item) =>
    matchesColor(item.colorIdentity ?? [], color),
  );
}

export async function enrichCommanderCandidates(
  items: StoreInventoryCard[],
  maxLookups = 40,
): Promise<StoreInventoryCard[]> {
  const out: StoreInventoryCard[] = [];
  const seen = new Set<string>();
  let lookups = 0;

  for (const item of items) {
    if (seen.has(item.inventoryItemId)) continue;
    seen.add(item.inventoryItemId);

    if (await isLegalCommanderForInventoryCard(item)) {
      out.push(item);
      continue;
    }

    if (lookups >= maxLookups) continue;
    lookups += 1;

    const cat = await cardCatalogLookupByName(item.name);
    if (!cat) continue;
    if (!(await isLegalCommanderForHit(cat))) continue;

    out.push({
      ...item,
      scryfallId: cat.scryfallId,
      oracleId: cat.oracleId,
      colorIdentity: cat.colorIdentity,
      isCommander: true,
      typeLine: cat.typeLine,
    });
  }
  return out;
}

/** Paginated browse helper for non-recommendation clerk queries. */
export async function browseMagicInventoryForClerk(input: {
  storeId: string;
  storeSlug: string;
  userQuestion: string;
  maxPrice?: number;
}): Promise<StoreInventoryCard[]> {
  const parsed = parseClerkInventoryQuery({
    userQuestion: input.userQuestion,
    maxPrice: input.maxPrice,
  });

  const result = await browseStoreInventory({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    game: "magic",
    q: parsed.q,
    color: parsed.color ?? "all",
    cardType: "all",
    semantic: parsed.semantic,
    semanticOnly: parsed.semanticOnly,
    page: 1,
    limit: 96,
  });

  let items = result.items;
  const maxPrice = parsed.maxPrice;
  if (maxPrice != null) {
    items = items.filter((c) => {
      const p = c.listPrice ?? c.tcgLowPrice;
      return p == null || p <= maxPrice;
    });
  }
  return items;
}
