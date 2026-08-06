import {
  inventoryEffectiveQuantity,
} from "../inventory/status";
import {
  buildInventoryIdentityExclusionTrace,
  isClerkEligibleInventory,
  type InventoryIdentityExclusionTrace,
} from "../inventory/catalog-link-identity";
import { inventoryItemMatchesSearch } from "../inventory/search";
import {
  inventoryImageProxyPath,
  pickInventoryDisplayImageUrl,
} from "../inventory/resolve-display-image";
import { isFirebaseStorageUrl } from "../inventory/image-url";
import { deckBuilderStore } from "./deck-builder-store";
import { getCachedStoreInventory } from "./store-inventory-cache";
import type { CardCategory, InventoryItem } from "../types";
import type { StoreInventorySemanticFilter } from "../deck-builder/store-inventory-semantic";
import {
  cardMatchesSemanticFilter,
  itemMatchesSemanticFilter,
  isSemanticFilterActive,
} from "../deck-builder/store-inventory-semantic";

export type { StoreInventorySemanticFilter } from "../deck-builder/store-inventory-semantic";

export interface StoreInventoryCard {
  inventoryItemId: string;
  scryfallId?: string;
  oracleId?: string;
  name: string;
  imageUrl?: string;
  imageProxyUrl?: string;
  qty: number;
  listPrice?: number;
  tcgLowPrice?: number;
  setName?: string;
  cardNumber?: string;
  category?: CardCategory;
  productLine?: string;
  condition?: string;
  colorIdentity: string[];
  colors?: string[];
  isCommander: boolean;
  typeLine?: string;
  cmc?: number;
  manaCost?: string;
  oracleText?: string;
  keywords?: string[];
  oracleTags?: string[];
  rarity?: string;
}

export type StoreInventoryGameFilter = CardCategory | "all";
export type StoreInventoryColorFilter =
  | "all"
  | "W"
  | "U"
  | "B"
  | "R"
  | "G"
  | "C"
  | "multicolor"
  | "two"
  | "three"
  | "four"
  | "five";

export type StoreInventoryTypeFilter = "all" | "commander";

function inferGame(item: InventoryItem): CardCategory {
  if (item.category) return item.category;
  const line = (item.productLine ?? "").toLowerCase();
  if (line.includes("magic") || line.includes("mtg")) return "magic";
  if (line.includes("pokemon") || line.includes("pokémon")) return "pokemon";
  if (line.includes("yugioh") || line.includes("yu-gi-oh")) return "yugioh";
  if (line.includes("sport")) return "sports";
  return "other";
}

function matchesColorFilter(
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
  /** Legacy single-color param: includes this color (clerk paths). */
  if (["W", "U", "B", "R", "G"].includes(filter)) {
    return id.includes(filter);
  }
  return true;
}

export type ColorCountFilter = Exclude<StoreInventoryColorFilter, "W" | "U" | "B" | "R" | "G" | "C">;

/** Multi-select browse: mono when one pip; must include all pips when several selected. */
export function matchesSelectedColorFilters(
  colors: string[],
  selectedColors: string[],
  colorCount: ColorCountFilter,
): boolean {
  const id = colors ?? [];

  if (colorCount !== "all") {
    return matchesColorFilter(id, colorCount);
  }

  if (selectedColors.length === 0) return true;

  if (selectedColors.length === 1 && selectedColors[0] === "C") {
    return id.length === 0;
  }

  const wubrg = selectedColors.filter((c) => c !== "C");
  if (wubrg.length === 0) return true;

  if (wubrg.length === 1) {
    return id.length === 1 && id[0] === wubrg[0];
  }

  return wubrg.every((c) => id.includes(c));
}

export function parseBrowseColorParams(input: {
  colors?: string;
  color?: StoreInventoryColorFilter;
  colorCount?: ColorCountFilter;
}): { selectedColors: string[]; colorCount: ColorCountFilter } {
  if (input.colorCount && input.colorCount !== "all") {
    return { selectedColors: [], colorCount: input.colorCount };
  }

  if (input.colors?.trim()) {
    const selectedColors = input.colors
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => ["W", "U", "B", "R", "G", "C"].includes(c));
    return { selectedColors, colorCount: "all" };
  }

  const legacy = input.color ?? "all";
  if (legacy === "all") {
    return { selectedColors: [], colorCount: "all" };
  }
  if (["W", "U", "B", "R", "G", "C"].includes(legacy)) {
    return { selectedColors: [legacy], colorCount: "all" };
  }
  return { selectedColors: [], colorCount: legacy as ColorCountFilter };
}

function cardFromInventoryItemSync(
  item: InventoryItem,
  crosswalkByItem: Map<string, string>,
  storeSlug: string,
  catalogCache: Map<string, import("./types").CatalogCard | null>,
): StoreInventoryCard | null {
  const qty = inventoryEffectiveQuantity(item);
  if (qty <= 0) return null;

  const inventoryName =
    item.productName ??
    item.displayName.split(" — ")[0]?.trim() ??
    item.displayName;

  const scryfallId =
    item.catalogScryfallId ?? crosswalkByItem.get(item.id);
  const catalog = scryfallId ? (catalogCache.get(scryfallId) ?? null) : null;

  let colorIdentity = item.catalogColorIdentity ?? catalog?.colorIdentity ?? [];
  let typeLine = item.catalogTypeLine ?? catalog?.typeLine;
  let isCommander =
    item.catalogCanBeSoleCommander ??
    catalog?.isCommander ??
    false;
  const cmc = item.catalogCmc ?? catalog?.cmc;
  const manaCost = item.catalogManaCost ?? catalog?.manaCost;
  const oracleText = item.catalogOracleText ?? catalog?.oracleText;
  const keywords = item.catalogKeywords ?? catalog?.keywords;
  const oracleTags = item.catalogOracleTags;
  const colors = item.catalogColors ?? catalog?.colors;
  const rarity = item.catalogRarity ?? catalog?.rarity;
  const setName = item.setName ?? catalog?.setName;

  const directImage = pickInventoryDisplayImageUrl(item, catalog);

  return {
    inventoryItemId: item.id,
    scryfallId: scryfallId ?? catalog?.id,
    oracleId: item.catalogOracleId ?? catalog?.oracleId,
    name: inventoryName,
    imageUrl: isFirebaseStorageUrl(directImage) ? directImage : undefined,
    imageProxyUrl: inventoryImageProxyPath(storeSlug, item.id),
    qty,
    listPrice: item.listPrice,
    tcgLowPrice: item.tcgLowPrice,
    setName,
    cardNumber: item.cardNumber ?? catalog?.collectorNumber,
    category: inferGame(item),
    productLine: item.productLine,
    condition: item.tcgplayerCondition ?? item.condition,
    colorIdentity,
    colors,
    isCommander,
    typeLine,
    cmc,
    manaCost,
    oracleText,
    keywords,
    oracleTags,
    rarity,
  };
}

function itemMatchesBrowseFilters(
  item: InventoryItem,
  selectedColors: string[],
  colorCount: ColorCountFilter,
  cardType: StoreInventoryTypeFilter,
  semantic?: StoreInventorySemanticFilter,
): boolean {
  const identity = item.catalogColorIdentity ?? [];
  if (
    selectedColors.length > 0 ||
    colorCount !== "all"
  ) {
    if (!matchesSelectedColorFilters(identity, selectedColors, colorCount)) {
      return false;
    }
  }
  if (cardType === "commander") {
    return item.catalogCanBeSoleCommander === true;
  }
  if (!itemMatchesSemanticFilter(item, semantic)) return false;
  return true;
}

export type StoreInventorySortBy = "name" | "price_asc" | "price_desc";

export async function browseStoreInventory(input: {
  storeId: string;
  storeSlug: string;
  q?: string;
  game?: StoreInventoryGameFilter;
  /** Legacy single color (clerk). Prefer selectedColors + colorCount. */
  color?: StoreInventoryColorFilter;
  selectedColors?: string[];
  colorCount?: ColorCountFilter;
  cardType?: StoreInventoryTypeFilter;
  semantic?: StoreInventorySemanticFilter;
  semanticOnly?: boolean;
  page?: number;
  limit?: number;
  sortBy?: StoreInventorySortBy;
  /** When true, exclude unlinked / manual-review / unresolved inventory from results. */
  requireClerkEligible?: boolean;
}): Promise<{
  items: StoreInventoryCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: {
    games: Record<string, number>;
    commanders: number;
    inStock: number;
  };
  identityTrace?: InventoryIdentityExclusionTrace;
}> {
  const all = await getCachedStoreInventory(input.storeId);
  const requireClerkEligible = input.requireClerkEligible ?? false;

  const game = input.game ?? "all";
  const parsedColors = parseBrowseColorParams({
    colors: input.selectedColors?.join(","),
    color: input.color,
    colorCount: input.colorCount,
  });
  const selectedColors =
    input.selectedColors && input.selectedColors.length > 0
      ? input.selectedColors
      : parsedColors.selectedColors;
  const colorCount = input.colorCount ?? parsedColors.colorCount;
  const cardType = input.cardType ?? "all";
  const semantic = input.semantic;
  const textQuery = input.semanticOnly ? undefined : input.q?.trim().toLowerCase();

  const matchedItems: InventoryItem[] = [];
  for (const item of all) {
    if (requireClerkEligible && !isClerkEligibleInventory(item)) continue;
    if (game !== "all" && inferGame(item) !== game) continue;
    if (textQuery && !inventoryItemMatchesSearch(item, textQuery)) continue;
    if (
      !itemMatchesBrowseFilters(
        item,
        selectedColors,
        colorCount,
        cardType,
        semantic,
      )
    ) {
      continue;
    }
    if (cardType === "commander" && item.catalogCanBeSoleCommander !== true) {
      continue;
    }
    if (
      isSemanticFilterActive(semantic) &&
      !itemMatchesSemanticFilter(item, semantic)
    ) {
      continue;
    }
    matchedItems.push(item);
  }

  matchedItems.sort((a, b) => {
    if (input.sortBy === "price_desc" || input.sortBy === "price_asc") {
      const pa = a.listPrice ?? a.tcgLowPrice ?? 0;
      const pb = b.listPrice ?? b.tcgLowPrice ?? 0;
      const aMissing = pa <= 0;
      const bMissing = pb <= 0;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (pa !== pb) {
        return input.sortBy === "price_desc" ? pb - pa : pa - pb;
      }
    }

    const aName = a.productName ?? a.displayName;
    const bName = b.productName ?? b.displayName;
    const aCmd = a.catalogCanBeSoleCommander === true;
    const bCmd = b.catalogCanBeSoleCommander === true;
    if (aCmd !== bCmd) return aCmd ? -1 : 1;
    return aName.localeCompare(bName);
  });

  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(96, Math.max(1, input.limit ?? 48));
  const total = matchedItems.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pageItems = matchedItems.slice(start, start + limit);

  const pageItemIds = new Set(pageItems.map((item) => item.id));
  const crosswalkByItem = new Map<string, string>();
  const needsCrosswalk = pageItems.some((item) => !item.catalogScryfallId);
  if (needsCrosswalk) {
    const crosswalks = await deckBuilderStore.listCrosswalks(input.storeId);
    for (const crosswalk of crosswalks) {
      if (pageItemIds.has(crosswalk.inventoryItemId)) {
        crosswalkByItem.set(crosswalk.inventoryItemId, crosswalk.scryfallId);
      }
    }
  }

  const catalogCache = new Map<string, import("./types").CatalogCard | null>();
  const scryfallIds = [
    ...new Set(
      pageItems
        .map((item) => item.catalogScryfallId ?? crosswalkByItem.get(item.id))
        .filter(Boolean) as string[],
    ),
  ];
  const catalogCards = await deckBuilderStore.getCatalogCards(scryfallIds);
  for (const card of catalogCards) {
    catalogCache.set(card.id, card);
  }

  const enriched: StoreInventoryCard[] = [];
  for (const item of pageItems) {
    const card = cardFromInventoryItemSync(
      item,
      crosswalkByItem,
      input.storeSlug,
      catalogCache,
    );
    if (!card) continue;
    if (cardType === "commander" && !card.isCommander) continue;
    if (
      (selectedColors.length > 0 || colorCount !== "all") &&
      !matchesSelectedColorFilters(
        card.colorIdentity,
        selectedColors,
        colorCount,
      )
    ) {
      continue;
    }
    if (!cardMatchesSemanticFilter(card, semantic)) continue;
    enriched.push(card);
  }

  const items = enriched;

  const gameCounts: Record<string, number> = {};
  let commanderCount = 0;
  for (const item of all) {
    const g = inferGame(item);
    gameCounts[g] = (gameCounts[g] ?? 0) + 1;
    if (item.catalogCanBeSoleCommander === true) {
      commanderCount += 1;
    }
  }

  return {
    items,
    total,
    page,
    limit,
    totalPages,
    facets: {
      games: gameCounts,
      commanders: commanderCount,
      inStock: all.length,
    },
    identityTrace: requireClerkEligible
      ? buildInventoryIdentityExclusionTrace({ items: all, magicOnly: game === "magic" || game === "all" })
      : undefined,
  };
}

export async function listInventoryCommanders(input: {
  storeId: string;
  storeSlug: string;
  color?: StoreInventoryColorFilter;
  selectedColors?: string[];
  colorCount?: ColorCountFilter;
  q?: string;
  limit?: number;
}): Promise<StoreInventoryCard[]> {
  const result = await browseStoreInventory({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    q: input.q,
    game: "magic",
    color: input.color,
    selectedColors: input.selectedColors,
    colorCount: input.colorCount,
    cardType: "commander",
    page: 1,
    limit: input.limit ?? 200,
    requireClerkEligible: true,
  });
  return result.items;
}
