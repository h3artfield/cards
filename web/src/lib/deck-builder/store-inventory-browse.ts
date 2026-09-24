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
  catalogMatchesInventoryItem,
} from "../inventory/resolve-display-image";
import { classifyInventoryGame } from "../inventory/analytics";
import { isEnrichableMagicSingle } from "../inventory/magic-items";
import {
  inventoryBrowseGameFacets,
  inventoryBrowseGameKey,
  inventoryBrowseGameLabel,
  matchesInventoryBrowseGame,
} from "../inventory/inventory-browse-game-v1";
import {
  isRc8SemanticFilterActive,
} from "../inventory/inventory-rc8-semantic-match";
import { loadSemanticBrowseIndex } from "../inventory/inventory-semantic-browse-index";
import { inventoryItemIsSoleCommanderCandidate } from "./commander-pool-eligibility";
import { deckBuilderStore } from "./deck-builder-store";
import { getCachedStoreInventory } from "./store-inventory-cache";
import type { CardCategory, InventoryItem } from "../types";
import type { StoreInventorySemanticFilter } from "../deck-builder/store-inventory-semantic";
import {
  cardMatchesSemanticFilter,
  itemMatchesSemanticFilter,
  isSemanticFilterActive,
} from "../deck-builder/store-inventory-semantic";
import {
  inferInventoryFinish,
  inventoryFinishBadgeLabel,
  inventoryFinishIsFoil,
  inventoryItemMatchesFinishFilter,
  type InventoryFinishFilter,
} from "../inventory/inventory-finish-v1";

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
  gameKey?: string;
  gameLabel?: string;
  isFoil?: boolean;
  finishLabel?: string;
}

/** Browse game slug from `inventoryBrowseGameKey`, or `all`. */
export type StoreInventoryGameFilter = string;
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
  const key = inventoryBrowseGameKey(item);
  if (key === "magic") return "magic";
  if (key === "pokemon") return "pokemon";
  if (key === "yugioh") return "yugioh";
  if (key === "sports") return "sports";
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

  const usesScryfall = isEnrichableMagicSingle(item);
  const scryfallId = usesScryfall
    ? item.catalogScryfallId ?? crosswalkByItem.get(item.id)
    : item.catalogScryfallId;
  const catalog =
    usesScryfall && scryfallId ? (catalogCache.get(scryfallId) ?? null) : null;

  let colorIdentity = item.catalogColorIdentity ?? catalog?.colorIdentity ?? [];
  let typeLine = item.catalogTypeLine ?? catalog?.typeLine;
  let isCommander = inventoryItemIsSoleCommanderCandidate(item, catalog);
  const cmc = item.catalogCmc ?? catalog?.cmc;
  const manaCost = item.catalogManaCost ?? catalog?.manaCost;
  const oracleText = item.catalogOracleText ?? catalog?.oracleText;
  const keywords = item.catalogKeywords ?? catalog?.keywords;
  const oracleTags = item.catalogOracleTags;
  const colors = item.catalogColors ?? catalog?.colors;
  const rarity = item.catalogRarity ?? catalog?.rarity;
  const setName = item.setName ?? catalog?.setName;
  const finishKind = inferInventoryFinish(item);
  const finishLabel = inventoryFinishBadgeLabel(finishKind);

  const catalogMatch = catalog != null && catalogMatchesInventoryItem(item, catalog);
  const scryfallLinked =
    Boolean(scryfallId && catalog?.imageNormal) &&
    catalog?.id === scryfallId;
  let imageUrl: string | undefined;
  if ((catalogMatch || scryfallLinked) && catalog?.imageNormal) {
    imageUrl = catalog.imageNormal;
  } else {
    const directImage = pickInventoryDisplayImageUrl(item, catalog);
    if (directImage) {
      imageUrl = directImage;
    }
  }

  return {
    inventoryItemId: item.id,
    scryfallId: scryfallId ?? catalog?.id,
    oracleId: item.catalogOracleId ?? catalog?.oracleId,
    name: inventoryName,
    imageUrl,
    imageProxyUrl: inventoryImageProxyPath(storeSlug, item.id),
    qty,
    listPrice: item.listPrice,
    tcgLowPrice: item.tcgLowPrice,
    setName,
    cardNumber: item.cardNumber ?? catalog?.collectorNumber,
    category: inferGame(item),
    gameKey: inventoryBrowseGameKey(item),
    gameLabel: inventoryBrowseGameLabel(inventoryBrowseGameKey(item)),
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
    isFoil: inventoryFinishIsFoil(finishKind),
    finishLabel: finishLabel ?? undefined,
  };
}

function itemMatchesBrowseFilters(
  item: InventoryItem,
  selectedColors: string[],
  colorCount: ColorCountFilter,
  cardType: StoreInventoryTypeFilter,
  semantic?: StoreInventorySemanticFilter,
  semanticBrowseIndex?: ReturnType<typeof loadSemanticBrowseIndex>,
  finish?: InventoryFinishFilter,
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
  if (!itemMatchesSemanticFilter(item, semantic, semanticBrowseIndex)) return false;
  if (!inventoryItemMatchesFinishFilter(item, finish)) return false;
  if (cardType === "commander") {
    return inventoryItemIsSoleCommanderCandidate(item);
  }
  return true;
}

export type StoreInventorySortBy =
  | "name"
  | "price_asc"
  | "price_desc"
  | "cmc_asc"
  | "cmc_desc";

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
  finish?: InventoryFinishFilter;
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
  const finish = input.finish ?? "all";
  const semantic = input.semantic;
  const textQuery = input.semanticOnly ? undefined : input.q?.trim().toLowerCase();

  const semanticBrowseIndex = isRc8SemanticFilterActive(semantic)
    ? loadSemanticBrowseIndex()
    : undefined;

  const matchedItems: InventoryItem[] = [];
  for (const item of all) {
    if (requireClerkEligible && !isClerkEligibleInventory(item)) continue;
    if (!matchesInventoryBrowseGame(item, game)) continue;
    if (textQuery && !inventoryItemMatchesSearch(item, textQuery)) continue;
    if (
      !itemMatchesBrowseFilters(
        item,
        selectedColors,
        colorCount,
        cardType,
        semantic,
        semanticBrowseIndex,
        finish,
      )
    ) {
      continue;
    }
    if (cardType === "commander" && item.catalogCanBeSoleCommander !== true) {
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

    if (input.sortBy === "cmc_desc" || input.sortBy === "cmc_asc") {
      const ca = a.catalogCmc ?? Number.POSITIVE_INFINITY;
      const cb = b.catalogCmc ?? Number.POSITIVE_INFINITY;
      const aMissing = !Number.isFinite(ca);
      const bMissing = !Number.isFinite(cb);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (ca !== cb) {
        return input.sortBy === "cmc_desc" ? cb - ca : ca - cb;
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
  const limit = Math.min(100, Math.max(1, input.limit ?? 100));
  const total = matchedItems.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pageItems = matchedItems.slice(start, start + limit);

  const pageItemIds = new Set(pageItems.map((item) => item.id));
  const crosswalkByItem = new Map<string, string>();
  const needsCrosswalk = pageItems.some(
    (item) => isEnrichableMagicSingle(item) && !item.catalogScryfallId,
  );
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
    if (!cardMatchesSemanticFilter(card, semantic, semanticBrowseIndex)) continue;
    enriched.push(card);
  }

  const items = enriched;

  let commanderCount = 0;
  let inStockRows = 0;
  for (const item of all) {
    if (inventoryEffectiveQuantity(item) > 0) inStockRows += 1;
    if (inventoryItemIsSoleCommanderCandidate(item)) {
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
      games: inventoryBrowseGameFacets(all),
      commanders: commanderCount,
      inStock: inStockRows,
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
