import { classifyInventoryGame } from "./analytics";
import { isEnrichableMagicSingle } from "./magic-items";
import { fetchTcgplayerProductDetails } from "../card-flow-v2/tcgplayer-japan-catalog";
import { fetchTcgplayerCdnImage } from "../tcgplayer-inventory/cdn-image-fetch";
import { scryfallFetch } from "../processing/scryfall-client";
import { INVENTORY_IMAGE_FETCH_TIMEOUT_MS } from "./resolve-display-image";
import type { InventoryItem } from "../types";

/** Strip condition suffix and promo SKU tails from TCGplayer display names. */
export function cardNameFromInventoryItem(item: InventoryItem): string {
  const raw =
    item.displayName.split(" — ")[0]?.trim() ||
    item.productName?.trim() ||
    item.title?.trim() ||
    item.displayName.trim();

  return raw
    .replace(/\s*-\s*Near Mint.*$/i, "")
    .replace(/\s*-\s*Lightly Played.*$/i, "")
    .replace(/\s*-\s*Moderately Played.*$/i, "")
    .replace(/\s*-\s*Heavily Played.*$/i, "")
    .replace(/\s*-\s*Damaged.*$/i, "")
    .replace(/\s*-\s*[A-Z]{2,}\d+[A-Z0-9-]*\s*$/i, "")
    .trim();
}

/** Names to try against Scryfall — TCGplayer titles often append parenthetical variant tags. */
export function scryfallLookupNames(item: InventoryItem): string[] {
  const names = new Set<string>();
  const raw = cardNameFromInventoryItem(item);
  if (raw) names.add(raw);

  let stripped = raw;
  while (/\([^)]*\)/.test(stripped)) {
    stripped = stripped.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (stripped) names.add(stripped);
  }

  const beforeParen = raw.split("(")[0]?.trim();
  if (beforeParen && beforeParen.length > 2) names.add(beforeParen);

  const productName = item.productName?.trim();
  if (productName && productName !== raw) names.add(productName);

  return [...names].filter(Boolean);
}

const MAGIC_TCGPLAYER_LINES = [
  "Magic",
  "Magic: The Gathering",
  "Magic Singles",
  "Magic Sealed Products",
  "Magic Sealed Product",
  "Magic: The Gathering Singles",
  "Magic: The Gathering Sealed",
];

const POKEMON_TCGPLAYER_LINES = ["Pokemon", "Pokémon"];

function tcgplayerProductLinesForGame(game: string): string[] | undefined {
  if (game === "Magic") return MAGIC_TCGPLAYER_LINES;
  if (game === "Pokémon") return POKEMON_TCGPLAYER_LINES;
  return undefined;
}

/** Reject cross-game TCGplayer hits (e.g. Pokémon "Survival Brace" for MTG "Survival of the Fittest"). */
export function tcgplayerProductLineMatchesGame(
  productLineName: string | undefined,
  game: string,
): boolean {
  const line = (productLineName ?? "").toLowerCase();
  if (!line) return true;
  if (game === "Magic") return line.includes("magic");
  if (game === "Pokémon") return line.includes("pokemon") || line.includes("pokémon");
  if (game === "Yu-Gi-Oh!") return line.includes("yugioh") || line.includes("yu-gi-oh");
  return true;
}

/** Extra search queries for Secret Lair sealed SKUs on TCGplayer. */
function secretLairImageSearchQueries(name: string): string[] {
  if (!/secret lair/i.test(name)) return [];
  const queries = new Set<string>();
  const withoutPrefix = name.replace(/^Secret Lair Drop:\s*/i, "").trim();
  if (withoutPrefix) queries.add(withoutPrefix);
  const withoutFoil = withoutPrefix.replace(/\s*-\s*Foil Edition$/i, "").trim();
  if (withoutFoil) queries.add(withoutFoil);
  const title = withoutFoil.replace(/^Secret Lair x\s*/i, "").trim();
  if (title) queries.add(title);
  if (title) queries.add(`Secret Lair ${title}`);
  return [...queries];
}

type TcgplayerSearchHit = {
  productId?: number;
  productName?: string;
  productLineName?: string;
  imageUrl?: string;
};

async function searchTcgplayerInventoryProducts(input: {
  q: string;
  productLineNames?: string[];
  limit?: number;
}): Promise<TcgplayerSearchHit[]> {
  const trimmed = input.q.trim();
  if (!trimmed) return [];

  const body = {
    algorithm: "sales",
    from: 0,
    size: input.limit ?? 8,
    filters: {
      ...(input.productLineNames?.length
        ? { term: { productLineName: input.productLineNames } }
        : {}),
      range: { quantity: { gte: 1 } },
      exclude: { channelExclusion: 0 },
    },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
  };

  try {
    const res = await fetch(
      `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(trimmed)}&isList=false`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.tcgplayer.com",
          Referer: "https://www.tcgplayer.com/",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ results?: TcgplayerSearchHit[] }>;
    };
    return data.results?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

export function inventoryImageSearchQueries(item: InventoryItem): string[] {
  const name = cardNameFromInventoryItem(item);
  const set = item.setName?.trim();
  const num = item.cardNumber?.trim();
  const queries = new Set<string>();

  if (item.productName?.trim()) queries.add(item.productName.trim());
  for (const q of secretLairImageSearchQueries(name)) queries.add(q);
  if (name && set && num) queries.add(`${name} ${set} ${num}`);
  if (name && set) queries.add(`${name} ${set}`);
  if (name && num) queries.add(`${name} ${num}`);
  if (name) queries.add(name);

  for (const variant of scryfallLookupNames(item)) {
    if (variant !== name) queries.add(variant);
    if (set && num) queries.add(`${variant} ${set} ${num}`);
    if (set) queries.add(`${variant} ${set}`);
  }

  const rawTitle = item.displayName.split(" — ")[0]?.trim();
  if (rawTitle && rawTitle !== name) queries.add(rawTitle);

  return [...queries].filter(Boolean);
}

async function fetchRemoteImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "CardScanner/1.0 (https://cardscanner9000.com)",
    },
  });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 100) throw new Error("Image response too small");
  return { buffer, contentType };
}

type ScryfallCardImageJson = {
  image_uris?: { normal?: string };
  card_faces?: Array<{ image_uris?: { normal?: string } }>;
};

function scryfallImageFromJson(
  card: ScryfallCardImageJson | undefined,
): string | undefined {
  return card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal;
}

async function lookupScryfallDisplayImageUrl(
  item: InventoryItem,
): Promise<string | undefined> {
  const scryfallId = item.catalogScryfallId?.trim();
  if (scryfallId) {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`,
    );
    if (res.ok) {
      const card = (await res.json()) as ScryfallCardImageJson;
      const img = scryfallImageFromJson(card);
      if (img) return img;
    }
  }

  const setName = item.setName?.trim();
  const number = item.cardNumber?.trim();

  for (const cardName of scryfallLookupNames(item)) {
    const searchQueries: string[] = [];
    if (number && setName) {
      searchQueries.push(`!"${cardName}" set:"${setName}" cn:${number}`);
      searchQueries.push(`${cardName} set:"${setName}" cn:${number}`);
    }
    if (number) searchQueries.push(`!"${cardName}" cn:${number}`);
    if (setName) searchQueries.push(`!"${cardName}" set:"${setName}"`);
    searchQueries.push(`!"${cardName}"`);

    for (const query of searchQueries) {
      const searchRes = await scryfallFetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards`,
      );
      if (!searchRes.ok) continue;

      const search = (await searchRes.json()) as {
        data?: ScryfallCardImageJson[];
      };
      const img = scryfallImageFromJson(search.data?.[0]);
      if (img) return img;
    }

    const namedRes = await scryfallFetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`,
    );

    if (namedRes.ok) {
      const card = (await namedRes.json()) as ScryfallCardImageJson;
      const img = scryfallImageFromJson(card);
      if (img) return img;
    }
  }

  return undefined;
}

/** Resolve a Scryfall CDN art URL without downloading the image bytes. */
export async function resolveScryfallDisplayImageUrl(
  item: InventoryItem,
): Promise<string | undefined> {
  return lookupScryfallDisplayImageUrl(item);
}

async function fetchScryfallImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const img = await lookupScryfallDisplayImageUrl(item);
  if (!img) return null;
  return fetchRemoteImage(img);
}

async function fetchPokemonTcgImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const names = [
    cardNameFromInventoryItem(item),
    item.productName?.trim(),
    item.displayName.split(" — ")[0]?.trim(),
  ].filter(Boolean) as string[];

  const setName = item.setName?.trim();
  const number = item.cardNumber?.trim();

  const unique = [...new Set(names)];
  for (const name of unique) {
    const queries = [
      number && setName ? `name:"${name}" number:${number} set.name:"${setName}"` : null,
      number ? `name:"${name}" number:${number}` : null,
      setName ? `name:"${name}" set.name:"${setName}"` : null,
      `name:"${name}"`,
    ].filter(Boolean) as string[];

    for (const q of queries) {
      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=1&select=id,images`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!res.ok) continue;

      const body = (await res.json()) as {
        data?: Array<{ images?: { large?: string; small?: string } }>;
      };
      const img =
        body.data?.[0]?.images?.large ?? body.data?.[0]?.images?.small;
      if (img) return fetchRemoteImage(img);
    }
  }
  return null;
}

async function fetchPriceChartingImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const game = classifyInventoryGame(item);
  // PriceCharting fuzzy search routinely cross-matches games (e.g. Pokémon for MTG names).
  if (game === "Magic" || game === "Pokémon") return null;

  const apiKey = process.env.PRICECHARTING_API_KEY?.trim();
  if (!apiKey) return null;

  for (const query of inventoryImageSearchQueries(item)) {
    const res = await fetch(
      `https://www.pricecharting.com/api/product?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) continue;

    const product = (await res.json()) as Record<string, unknown>;
    if (product.status === "error") continue;

    const img =
      (product["image-url"] as string | undefined) ??
      (product.imageUrl as string | undefined);
    if (img?.trim()) return fetchRemoteImage(img.trim());
  }
  return null;
}

async function fetchTcgplayerProductImageById(
  item: InventoryItem,
  productId: string,
  existingUrl?: string,
): Promise<{
  buffer: Buffer;
  contentType: string;
  tcgLowPrice?: number;
} | null> {
  const game = classifyInventoryGame(item);
  const details = await fetchTcgplayerProductDetails(productId);
  if (
    details?.productLineName &&
    !tcgplayerProductLineMatchesGame(details.productLineName, game)
  ) {
    return null;
  }

  const tcgLowPrice =
    details?.lowestPrice != null && details.lowestPrice > 0
      ? details.lowestPrice
      : details?.marketPrice != null && details.marketPrice > 0
        ? details.marketPrice
        : undefined;

  try {
    const fetched = await fetchTcgplayerCdnImage(productId, existingUrl);
    return {
      buffer: fetched.buffer,
      contentType: fetched.contentType,
      tcgLowPrice,
    };
  } catch {
    return null;
  }
}

async function fetchTcgplayerCatalogImage(
  item: InventoryItem,
): Promise<{
  buffer: Buffer;
  contentType: string;
  tcgLowPrice?: number;
} | null> {
  if (!item.tcgplayerProductId) return null;
  return fetchTcgplayerProductImageById(item, item.tcgplayerProductId);
}

async function fetchTcgplayerSearchImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const game = classifyInventoryGame(item);
  const productLineNames = tcgplayerProductLinesForGame(game);
  const queries = inventoryImageSearchQueries(item).slice(0, 6);
  const preferredId = item.tcgplayerProductId?.trim();

  for (const query of queries) {
    const hits = await searchTcgplayerInventoryProducts({
      q: query,
      productLineNames,
      limit: 8,
    });
    const gameFiltered = hits.filter((hit) =>
      tcgplayerProductLineMatchesGame(hit.productLineName, game),
    );
    const ordered = preferredId
      ? [
          ...gameFiltered.filter((h) => String(h.productId) === preferredId),
          ...gameFiltered.filter((h) => String(h.productId) !== preferredId),
        ]
      : gameFiltered;

    for (const hit of ordered.slice(0, 4)) {
      if (hit.imageUrl?.trim()) {
        try {
          return await fetchRemoteImage(hit.imageUrl.trim());
        } catch {
          /* try CDN next */
        }
      }
      if (!hit.productId) continue;
      const fetched = await fetchTcgplayerProductImageById(
        item,
        String(hit.productId),
      );
      if (fetched) {
        return { buffer: fetched.buffer, contentType: fetched.contentType };
      }
    }
  }
  return null;
}

/**
 * Resolve card art for server-side caching. Game catalogs (Scryfall, Pokémon TCG)
 * are tried first — TCGplayer CDN/API often blocks datacenter IPs (403).
 */
export async function fetchInventoryImageBuffer(
  item: InventoryItem,
  sourceUrl: string,
): Promise<{ buffer: Buffer; contentType: string; tcgLowPrice?: number }> {
  const game = classifyInventoryGame(item);
  const magicSingle = game === "Magic" && isEnrichableMagicSingle(item);

  if (magicSingle) {
    const scryfall = await fetchScryfallImage(item);
    if (scryfall) return scryfall;
  }

  if (game === "Pokémon") {
    const pokemon = await fetchPokemonTcgImage(item);
    if (pokemon) return pokemon;
  }

  if (item.tcgplayerProductId) {
    const fetched = await fetchTcgplayerProductImageById(
      item,
      item.tcgplayerProductId,
      sourceUrl.includes("tcgplayer-cdn") ? sourceUrl : undefined,
    );
    if (fetched) {
      return {
        buffer: fetched.buffer,
        contentType: fetched.contentType,
        tcgLowPrice: fetched.tcgLowPrice,
      };
    }
  }

  const tcgCatalog = await fetchTcgplayerCatalogImage(item);
  if (tcgCatalog) {
    return {
      buffer: tcgCatalog.buffer,
      contentType: tcgCatalog.contentType,
      tcgLowPrice: tcgCatalog.tcgLowPrice,
    };
  }

  const tcgSearch = await fetchTcgplayerSearchImage(item);
  if (tcgSearch) return tcgSearch;

  if (game === "Magic") {
    const scryfall = await fetchScryfallImage(item);
    if (scryfall) return scryfall;
  }

  const priceCharting = await fetchPriceChartingImage(item);
  if (priceCharting) return priceCharting;

  if (game !== "Magic") {
    const scryfall = await fetchScryfallImage(item);
    if (scryfall) return scryfall;
  }

  throw new Error("No image source available");
}
