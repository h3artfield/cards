import { catalogCardFromScryfall } from "./scryfall-catalog";
import type { StoreInventoryCard } from "./store-inventory-browse";
import {
  matchesSelectedColorFilters,
  parseBrowseColorParams,
  type ColorCountFilter,
  type StoreInventorySortBy,
  type StoreInventoryTypeFilter,
} from "./store-inventory-browse";
import type { StoreInventorySemanticFilter } from "./store-inventory-semantic";
import { scryfallFetch } from "../processing/scryfall-client";

export type CatalogBrowseGame = "magic" | "pokemon" | "riftbound";

function scryfallOrder(sortBy?: StoreInventorySortBy): string {
  switch (sortBy) {
    case "price_asc":
      return "usd";
    case "price_desc":
      return "-usd";
    case "cmc_asc":
      return "cmc";
    case "cmc_desc":
      return "-cmc";
    default:
      return "name";
  }
}

function buildScryfallQuery(input: {
  q: string;
  selectedColors: string[];
  colorCount: ColorCountFilter;
  cardType: StoreInventoryTypeFilter;
  semantic?: StoreInventorySemanticFilter;
}): string {
  const parts: string[] = [];
  const text = input.q.trim();
  if (text) parts.push(text.includes(" ") ? `name:"${text}"` : text);

  if (input.cardType === "commander") {
    parts.push("is:commander");
  }

  for (const typeFragment of input.semantic?.typeIncludes ?? []) {
    parts.push(`t:${typeFragment}`);
  }

  if (input.semantic?.cmcMin != null && input.semantic?.cmcMax != null) {
    parts.push(`mv>=${input.semantic.cmcMin} mv<=${input.semantic.cmcMax}`);
  } else if (input.semantic?.cmcMin != null) {
    parts.push(`mv>=${input.semantic.cmcMin}`);
  } else if (input.semantic?.cmcMax != null) {
    parts.push(`mv<=${input.semantic.cmcMax}`);
  }

  for (const tag of input.semantic?.oracleTagsAny ?? []) {
    parts.push(`otag:${tag}`);
  }

  if (input.colorCount !== "all") {
    if (input.colorCount === "multicolor") parts.push("c>=2");
    else if (input.colorCount === "two") parts.push("c=2");
    else if (input.colorCount === "three") parts.push("c=3");
    else if (input.colorCount === "four") parts.push("c=4");
    else if (input.colorCount === "five") parts.push("c>=5");
  } else if (input.selectedColors.length === 1 && input.selectedColors[0] === "C") {
    parts.push("c=c");
  } else if (input.selectedColors.length === 1) {
    parts.push(`c:${input.selectedColors[0].toLowerCase()}`);
  } else if (input.selectedColors.length > 1) {
    parts.push(`c:${input.selectedColors.join("").toLowerCase()}`);
  }

  parts.push("-is:token");
  parts.push("game:paper");
  return parts.filter(Boolean).join(" ");
}

function catalogCardToGridCard(
  card: NonNullable<ReturnType<typeof catalogCardFromScryfall>>,
): StoreInventoryCard {
  return {
    inventoryItemId: `catalog:magic:${card.id}`,
    scryfallId: card.id,
    oracleId: card.oracleId,
    name: card.name,
    imageUrl: card.imageNormal,
    qty: 0,
    setName: card.setName,
    cardNumber: card.collectorNumber,
    category: "magic",
    colorIdentity: card.colorIdentity ?? [],
    colors: card.colors,
    isCommander: card.isCommander ?? false,
    typeLine: card.typeLine,
    cmc: card.cmc,
    manaCost: card.manaCost,
    oracleText: card.oracleText,
    keywords: card.keywords,
    rarity: card.rarity,
  };
}

async function browseMagicCatalog(input: {
  q: string;
  page: number;
  limit: number;
  selectedColors: string[];
  colorCount: ColorCountFilter;
  cardType: StoreInventoryTypeFilter;
  sortBy?: StoreInventorySortBy;
  semantic?: StoreInventorySemanticFilter;
}): Promise<{
  items: StoreInventoryCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const query = buildScryfallQuery(input);
  const order = scryfallOrder(input.sortBy);
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=${order}&page=${input.page}`;
  const res = await scryfallFetch(url);
  if (!res.ok) {
    return { items: [], total: 0, page: input.page, limit: input.limit, totalPages: 1 };
  }

  const body = (await res.json()) as {
    data?: Record<string, unknown>[];
    total_cards?: number;
  };

  const items: StoreInventoryCard[] = [];
  for (const raw of body.data ?? []) {
    const card = catalogCardFromScryfall(raw);
    if (!card) continue;
    const grid = catalogCardToGridCard(card);
    if (
      input.selectedColors.length > 1 &&
      input.colorCount === "all" &&
      !matchesSelectedColorFilters(grid.colorIdentity, input.selectedColors, "all")
    ) {
      continue;
    }
    items.push(grid);
    if (items.length >= input.limit) break;
  }

  const total = body.total_cards ?? items.length;
  const totalPages = Math.max(1, Math.ceil(total / input.limit));

  return {
    items,
    total,
    page: input.page,
    limit: input.limit,
    totalPages,
  };
}

type TcgplayerCatalogHit = {
  productId?: number;
  productName?: string;
  setName?: string;
  productLineName?: string;
  imageUrl?: string;
  marketPrice?: number;
};

const TCGPLAYER_PRODUCT_LINES: Record<Exclude<CatalogBrowseGame, "magic">, string[]> = {
  pokemon: ["Pokemon", "Pokémon"],
  riftbound: ["Riftbound"],
};

async function searchTcgplayerCatalog(input: {
  q: string;
  game: Exclude<CatalogBrowseGame, "magic">;
  limit: number;
  offset: number;
}): Promise<TcgplayerCatalogHit[]> {
  const lines = TCGPLAYER_PRODUCT_LINES[input.game];
  const body = {
    algorithm: "sales",
    from: input.offset,
    size: input.limit,
    filters: {
      term: { productLineName: lines },
      range: { quantity: { gte: 1 } },
      exclude: { channelExclusion: 0 },
    },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
  };

  try {
    const res = await fetch(
      `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(input.q.trim())}&isList=false`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.tcgplayer.com",
          Referer: "https://www.tcgplayer.com/",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ results?: TcgplayerCatalogHit[]; totalResults?: number }>;
    };
    return data.results?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

function tcgplayerHitToGridCard(
  hit: TcgplayerCatalogHit,
  game: Exclude<CatalogBrowseGame, "magic">,
): StoreInventoryCard | null {
  const name = hit.productName?.trim();
  const productId = hit.productId;
  if (!name || !productId) return null;

  return {
    inventoryItemId: `catalog:${game}:${productId}`,
    name,
    imageUrl: hit.imageUrl,
    qty: 0,
    listPrice: hit.marketPrice,
    setName: hit.setName,
    category: game === "pokemon" ? "pokemon" : "other",
    productLine: hit.productLineName,
    colorIdentity: [],
    isCommander: false,
  };
}

async function browseTcgplayerCatalog(input: {
  q: string;
  game: Exclude<CatalogBrowseGame, "magic">;
  page: number;
  limit: number;
}): Promise<{
  items: StoreInventoryCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const q = input.q.trim() || (input.game === "pokemon" ? "pokemon" : "riftbound");
  const offset = (input.page - 1) * input.limit;
  const hits = await searchTcgplayerCatalog({
    q,
    game: input.game,
    limit: input.limit,
    offset,
  });

  const items = hits
    .map((hit) => tcgplayerHitToGridCard(hit, input.game))
    .filter(Boolean) as StoreInventoryCard[];

  const total = offset + items.length + (items.length >= input.limit ? input.limit : 0);
  const totalPages = items.length >= input.limit ? input.page + 1 : input.page;

  return {
    items,
    total,
    page: input.page,
    limit: input.limit,
    totalPages: Math.max(1, totalPages),
  };
}

export async function browseCatalogPrintings(input: {
  q?: string;
  game: CatalogBrowseGame;
  selectedColors?: string[];
  colorCount?: ColorCountFilter;
  cardType?: StoreInventoryTypeFilter;
  page?: number;
  limit?: number;
  sortBy?: StoreInventorySortBy;
  semantic?: StoreInventorySemanticFilter;
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
}> {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 100));
  const parsedColors = parseBrowseColorParams({
    colors: input.selectedColors?.join(","),
    colorCount: input.colorCount,
  });
  const selectedColors =
    input.selectedColors && input.selectedColors.length > 0
      ? input.selectedColors
      : parsedColors.selectedColors;
  const colorCount = input.colorCount ?? parsedColors.colorCount;
  const cardType = input.cardType ?? "all";
  const q = input.q?.trim() ?? "";

  const result =
    input.game === "magic"
      ? await browseMagicCatalog({
          q,
          page,
          limit,
          selectedColors,
          colorCount,
          cardType,
          sortBy: input.sortBy,
          semantic: input.semantic,
        })
      : await browseTcgplayerCatalog({
          q,
          game: input.game,
          page,
          limit,
        });

  return {
    ...result,
    facets: {
      games: { magic: 0, pokemon: 0, yugioh: 0, sports: 0, other: 0, riftbound: 0 },
      commanders: 0,
      inStock: 0,
    },
  };
}
