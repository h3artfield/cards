import {
  inventoryEffectiveQuantity,
  inventoryItemMatchesChannelFilter,
  inventoryOnlineQuantity,
  type InventoryChannelFilter,
} from "../inventory/status";
import {
  buildInventoryIdentityExclusionTrace,
  isClerkEligibleInventory,
  type InventoryIdentityExclusionTrace,
} from "../inventory/catalog-link-identity";
import {
  inventoryImageProxyPath,
  pickInventoryDisplayImageUrl,
  catalogMatchesInventoryItem,
  catalogPrintingMatchesInventoryItem,
  collectorNumbersAgree,
} from "../inventory/resolve-display-image";
import { normalizeCardNameForMatch } from "../store-inventory/clerk-tools/magic-commander-inventory";
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
  /** Units that can be bought online; 0 means in-store purchase only. */
  onlineQty?: number;
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

export function inferGame(item: InventoryItem): CardCategory {
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

export type ColorMatchMode = "exact" | "including" | "atmost";

/**
 * Scryfall color row.
 * exact: the card's colors are these pips and no others.
 * including: the card has every selected pip, and may have more.
 * atmost: every color on the card is one of the selected pips.
 */
export function matchesColorMode(
  colors: string[],
  selectedColors: string[],
  mode: ColorMatchMode,
): boolean {
  const id = (colors ?? []).filter((c) => c !== "C");
  const wanted = selectedColors.filter((c) => c !== "C");
  if (selectedColors.length === 1 && selectedColors[0] === "C") {
    return id.length === 0;
  }
  if (wanted.length === 0) return true;

  if (mode === "exact") {
    return id.length === wanted.length && wanted.every((c) => id.includes(c));
  }
  if (mode === "including") {
    return wanted.every((c) => id.includes(c));
  }
  return id.every((c) => wanted.includes(c));
}

/** A card can be played in a deck whose commander has this color identity. */
export function matchesCommanderIdentity(
  colorIdentity: string[],
  commanderColors: string[],
): boolean {
  if (commanderColors.length === 0) return true;
  const allowed = new Set(commanderColors.filter((c) => c !== "C"));
  return (colorIdentity ?? []).every((c) => allowed.has(c));
}

export function cardColorsForBrowse(item: InventoryItem): string[] {
  if (item.catalogColors) return item.catalogColors;
  return item.catalogColorIdentity ?? [];
}

export function cardNameIncludes(item: InventoryItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [item.productName, item.displayName, item.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function matchesRulesText(oracleText: string | undefined, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = (oracleText ?? "").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function matchesTypeLineQuery(
  typeLine: string | undefined,
  query: string,
  partial: boolean,
): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;
  const line = (typeLine ?? "").toLowerCase();
  const tokens = wanted.split(/\s+/).filter(Boolean);
  // Several chosen types all have to be on the line. Partial only applies to one word.
  if (partial && tokens.length === 1) return line.includes(wanted);
  return tokens.every((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`).test(line);
  });
}

export function manaCostSymbols(raw: string): string[] {
  const braced = [...raw.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!.toUpperCase());
  if (braced.length > 0) return braced;
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  return [...compact.matchAll(/\d+|[WUBRGCXPYS]/g)].map((match) => match[0]);
}

export function matchesExactManaCost(
  manaCost: string | undefined,
  query: string,
): boolean {
  const wanted = manaCostSymbols(query);
  if (wanted.length === 0) return true;
  const have = manaCostSymbols(manaCost ?? "");
  return have.length === wanted.length && have.every((symbol, i) => symbol === wanted[i]);
}

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

type SharedPrintingFacts = {
  colorIdentity: string[];
  colors?: string[];
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
};

/** A promo row often has no catalog link. The same card's main printing does. */
function sharedPrintingFacts(items: InventoryItem[]): Map<string, SharedPrintingFacts> {
  const facts = new Map<string, SharedPrintingFacts>();
  for (const item of items) {
    const name =
      item.productName?.trim() ||
      item.displayName.split(" — ")[0]?.trim() ||
      item.displayName;
    const key = normalizeCardNameForMatch(name);
    if (!key || facts.has(key)) continue;
    const colorIdentity = item.catalogColorIdentity ?? [];
    const manaCost = item.catalogManaCost?.trim();
    if (!colorIdentity.length && !manaCost) continue;
    facts.set(key, {
      colorIdentity,
      colors: item.catalogColors,
      manaCost,
      cmc: item.catalogCmc,
      typeLine: item.catalogTypeLine,
    });
  }
  return facts;
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

  // A saved link whose name is a different card (Alpha 203 on a Prerelease 203 row)
  // must not paint that card's mana cost onto this shelf row.
  const catalogFactsOk = catalogMatchesInventoryItem(item, catalog);
  let colorIdentity = catalogFactsOk ? (item.catalogColorIdentity ?? catalog?.colorIdentity ?? []) : [];
  let typeLine = catalogFactsOk ? (item.catalogTypeLine ?? catalog?.typeLine) : undefined;
  let isCommander = inventoryItemIsSoleCommanderCandidate(item, catalogFactsOk ? catalog : null);
  const cmc = catalogFactsOk ? (item.catalogCmc ?? catalog?.cmc) : undefined;
  const manaCost = catalogFactsOk ? (item.catalogManaCost ?? catalog?.manaCost) : undefined;
  const oracleText = catalogFactsOk ? (item.catalogOracleText ?? catalog?.oracleText) : undefined;
  const keywords = catalogFactsOk ? (item.catalogKeywords ?? catalog?.keywords) : undefined;
  const oracleTags = catalogFactsOk ? item.catalogOracleTags : undefined;
  const colors = catalogFactsOk ? (item.catalogColors ?? catalog?.colors) : undefined;
  const rarity = item.rarity?.trim() || item.catalogRarity || catalog?.rarity;
  const setName = item.setName ?? catalog?.setName;
  const finishKind = inferInventoryFinish(item);
  const finishLabel = inventoryFinishBadgeLabel(finishKind);

  const samePrinting = catalogPrintingMatchesInventoryItem(item, catalog);
  const nameMatch = catalog != null && catalogMatchesInventoryItem(item, catalog);
  // A same-name scan is fine when the printed number agrees (promo 255p on a
  // 255 shelf row). It is not fine when the number is a different card, such
  // as Endstone 391 on the promo-pack 240 row.
  const numberAgrees = collectorNumbersAgree(item.cardNumber, catalog?.collectorNumber);
  let imageUrl: string | undefined;
  if (numberAgrees && (samePrinting || nameMatch) && catalog?.imageNormal) {
    imageUrl = catalog.imageNormal;
  } else if (numberAgrees && (samePrinting || nameMatch)) {
    const directImage = pickInventoryDisplayImageUrl(item, catalog);
    if (directImage) imageUrl = directImage;
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
    onlineQty: inventoryOnlineQuantity(item),
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
  extra?: {
    colorMode?: ColorMatchMode;
    commanderColors?: string[];
    rulesText?: string;
    typeLine?: string;
    typeLinePartial?: boolean;
    manaCost?: string;
    baseSemantic?: StoreInventorySemanticFilter;
  },
): boolean {
  const identity = item.catalogColorIdentity ?? [];
  const cardColors = cardColorsForBrowse(item);
  if (selectedColors.length > 0 || colorCount !== "all") {
    if (extra?.colorMode && colorCount === "all") {
      if (!matchesColorMode(cardColors, selectedColors, extra.colorMode)) return false;
    } else if (!matchesSelectedColorFilters(identity, selectedColors, colorCount)) {
      return false;
    }
  }
  if (
    extra?.commanderColors?.length &&
    !matchesCommanderIdentity(identity, extra.commanderColors)
  ) {
    return false;
  }
  if (extra?.rulesText && !matchesRulesText(item.catalogOracleText, extra.rulesText)) {
    return false;
  }
  if (
    extra?.typeLine &&
    !matchesTypeLineQuery(item.catalogTypeLine, extra.typeLine, extra.typeLinePartial === true)
  ) {
    return false;
  }
  if (extra?.manaCost && !matchesExactManaCost(item.catalogManaCost, extra.manaCost)) {
    return false;
  }
  if (!itemMatchesSemanticFilter(item, semantic, semanticBrowseIndex)) return false;
  if (
    extra?.baseSemantic &&
    !itemMatchesSemanticFilter(item, extra.baseSemantic, semanticBrowseIndex)
  ) {
    return false;
  }
  if (!inventoryItemMatchesFinishFilter(item, finish)) return false;
  if (cardType === "commander") {
    return inventoryItemIsSoleCommanderCandidate(item);
  }
  return true;
}

export type StoreInventorySortBy =
  | "name"
  | "newest"
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
  channel?: InventoryChannelFilter;
  colorMode?: ColorMatchMode;
  commanderColors?: string[];
  rulesText?: string;
  typeLine?: string;
  typeLinePartial?: boolean;
  manaCost?: string;
  /** Natural-language search that stays in effect while the shopper narrows with filters. */
  baseSemantic?: StoreInventorySemanticFilter;
  pokemonTypes?: string[];
  pokemonCards?: string[];
  pokemonStages?: string[];
  pokemonTrainers?: string[];
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

  const semanticBrowseIndex =
    isRc8SemanticFilterActive(semantic) || isRc8SemanticFilterActive(input.baseSemantic)
      ? loadSemanticBrowseIndex()
      : undefined;

  const pokemonFilters = {
    types: input.pokemonTypes ?? [],
    cards: input.pokemonCards ?? [],
    stages: input.pokemonStages ?? [],
    trainers: input.pokemonTrainers ?? [],
  };
  const pokemonFilterActive =
    game === "pokemon" &&
    (pokemonFilters.types.length > 0 ||
      pokemonFilters.cards.length > 0 ||
      pokemonFilters.stages.length > 0 ||
      pokemonFilters.trainers.length > 0);
  const matchPokemon = pokemonFilterActive
    ? (await import("../inventory/pokemon-shelf-traits")).matchesPokemonShelfFilters
    : null;

  const matchedItems: InventoryItem[] = [];
  for (const item of all) {
    if (requireClerkEligible && !isClerkEligibleInventory(item)) continue;
    if (!matchesInventoryBrowseGame(item, game)) continue;
    if (textQuery && !cardNameIncludes(item, textQuery)) continue;
    if (!inventoryItemMatchesChannelFilter(item, input.channel)) continue;
    if (matchPokemon && !matchPokemon(item, pokemonFilters)) continue;
    if (
      !itemMatchesBrowseFilters(
        item,
        selectedColors,
        colorCount,
        cardType,
        semantic,
        semanticBrowseIndex,
        finish,
        {
          colorMode: input.colorMode,
          commanderColors: input.commanderColors,
          rulesText: input.rulesText,
          typeLine: input.typeLine,
          typeLinePartial: input.typeLinePartial,
          manaCost: input.manaCost,
          baseSemantic: input.baseSemantic,
        },
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

    if (input.sortBy === "newest") {
      const addedAt = (item: InventoryItem) => {
        const parsed = Date.parse(item.acquiredAt ?? "");
        return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
      };
      const ta = addedAt(a);
      const tb = addedAt(b);
      if (ta !== tb) return tb - ta;
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
  const sharedFacts = sharedPrintingFacts(all);
  for (const item of pageItems) {
    const card = cardFromInventoryItemSync(
      item,
      crosswalkByItem,
      input.storeSlug,
      catalogCache,
    );
    if (!card) continue;
    if (!card.colorIdentity.length && !card.manaCost) {
      const shared = sharedFacts.get(normalizeCardNameForMatch(card.name));
      const linked = item.catalogScryfallId
        ? catalogCache.get(item.catalogScryfallId)
        : undefined;
      const rejectedOwn =
        linked != null &&
        !catalogMatchesInventoryItem(item, linked) &&
        Boolean(item.catalogManaCost) &&
        shared?.manaCost === item.catalogManaCost;
      if (shared && !rejectedOwn) {
        card.colorIdentity = shared.colorIdentity;
        if (!card.colors?.length) card.colors = shared.colors;
        card.manaCost = shared.manaCost;
        card.cmc = card.cmc ?? shared.cmc;
        card.typeLine = card.typeLine || shared.typeLine;
      }
    }
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
