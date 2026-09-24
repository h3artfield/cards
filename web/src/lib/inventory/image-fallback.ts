import {
  isPokemonInventoryItem,
  isPokemonJapanInventoryItem,
} from "./image-cache-trust";
import { fetchGameCatalogInventoryImage } from "./game-catalog-images";
import {
  fetchEnglishPokemonTcgImage,
  fetchPokemonJapanInventoryImage,
} from "./pokemon-inventory-images";
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
  // Each pass must shorten the string. Matching a tag anywhere while only
  // stripping one at the end spins forever on names like "Foo (Inks) - Bar".
  while (/\([^)]*\)/.test(stripped)) {
    const next = stripped
      .replace(/\s*\([^)]*\)\s*/, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (next === stripped) break;
    stripped = next;
    if (stripped) names.add(stripped);
  }

  const beforeParen = raw.split("(")[0]?.trim();
  if (beforeParen && beforeParen.length > 2) names.add(beforeParen);

  const productName = item.productName?.trim();
  if (productName && productName !== raw) names.add(productName);

  // TCGplayer dual-face titles use "Front - Back"; Scryfall uses "Front // Back".
  // Do not also add the short front name here — "Bag End" is too loose for
  // PriceCharting / TCGplayer search and can match Pokémon "Adventure Bag".
  for (const candidate of [...names]) {
    const dual = dualFaceScryfallName(candidate);
    if (dual) names.add(dual);
  }

  return [...names].filter(Boolean);
}

const NON_CARD_HYPHEN_TAIL =
  /\b(foil|etched|edition|unopened|near mint|showcase|borderless|extended|promo)\b/i;

/** "Bag End - Horizon Canopy" → "Bag End // Horizon Canopy", or null. */
export function dualFaceScryfallName(name: string): string | null {
  const match = name.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return null;
  const left = match[1]?.trim() ?? "";
  const right = match[2]?.trim() ?? "";
  if (!left || !right) return null;
  if (NON_CARD_HYPHEN_TAIL.test(right)) return null;
  return `${left} // ${right}`;
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
  if (game === "Flesh & Blood") return ["Flesh & Blood TCG", "Flesh & Blood"];
  if (game === "Lorcana") return ["Lorcana TCG", "Disney Lorcana"];
  if (game === "One Piece") return ["One Piece Card Game", "One Piece"];
  if (game === "Star Wars") return ["Star Wars Unlimited", "Star Wars"];
  if (game === "Riftbound") return ["Riftbound"];
  if (game === "Gundam") return ["Gundam Card Game"];
  return undefined;
}

function tcgplayerProductLinesForItem(item: InventoryItem): string[] | undefined {
  const line = item.productLine?.trim();
  if (line) return [line];
  return tcgplayerProductLinesForGame(classifyInventoryGame(item));
}

/** Reject cross-game TCGplayer hits (e.g. Pokémon "Survival Brace" for MTG "Survival of the Fittest"). */
export function tcgplayerProductLineMatchesGame(
  productLineName: string | undefined,
  game: string,
): boolean {
  const line = (productLineName ?? "").toLowerCase();
  if (!line) return false;
  if (game === "Magic") return line.includes("magic");
  if (game === "Pokémon") return line.includes("pokemon") || line.includes("pokémon");
  if (game === "Yu-Gi-Oh!") return line.includes("yugioh") || line.includes("yu-gi-oh");
  if (game === "Flesh & Blood") return line.includes("flesh") && line.includes("blood");
  if (game === "Lorcana") return line.includes("lorcana");
  if (game === "One Piece") return line.includes("one piece");
  if (game === "Star Wars") return line.includes("star wars");
  if (game === "Riftbound") return line.includes("riftbound");
  if (game === "Gundam") return line.includes("gundam");
  return false;
}

export function tcgplayerProductLineMatchesItem(
  productLineName: string | undefined,
  item: InventoryItem,
): boolean {
  const expected = item.productLine?.trim().toLowerCase();
  const hit = (productLineName ?? "").toLowerCase();
  if (expected && hit) {
    return hit.includes(expected) || expected.includes(hit);
  }
  return tcgplayerProductLineMatchesGame(productLineName, classifyInventoryGame(item));
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

/**
 * Loose token overlap, so PriceCharting's fuzzy search cannot hand back a
 * different product entirely (it will happily answer any query with something).
 */
export function priceChartingNameMatches(
  query: string,
  productName: string | undefined,
): boolean {
  if (!productName?.trim()) return false;
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    );
  const wanted = tokens(query);
  const got = tokens(productName);
  if (!wanted.size || !got.size) return false;
  let hits = 0;
  for (const token of wanted) if (got.has(token)) hits += 1;
  // Short queries like "Bag End" must not match "Adventure Bag" (1/2 = 50%).
  const needed = wanted.size <= 2 ? wanted.size : Math.ceil(wanted.size * (2 / 3));
  return hits >= needed;
}

function priceChartingProductMatchesItem(
  item: InventoryItem,
  query: string,
  product: Record<string, unknown>,
): boolean {
  const productName = product["product-name"] as string | undefined;
  if (!priceChartingNameMatches(query, productName)) return false;

  const blob = [
    product["console-name"],
    product.genre,
    product["product-name"],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const line = `${item.productLine ?? ""} ${item.setName ?? ""}`.toLowerCase();
  if (line.includes("lorcana") && !blob.includes("lorcana")) return false;
  if (line.includes("one piece") && !blob.includes("one piece")) return false;
  if (line.includes("flesh") && line.includes("blood") && !blob.includes("flesh")) {
    return false;
  }
  if (line.includes("riftbound") && !blob.includes("riftbound")) return false;
  if (line.includes("pokemon") && !blob.includes("pokemon")) return false;
  if (
    (line.includes("magic") || classifyInventoryGame(item) === "Magic") &&
    !/\bmagic\b|\bmtg\b|gathering/.test(blob)
  ) {
    return false;
  }
  return true;
}

async function fetchPriceChartingImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string; tcgLowPrice?: number } | null> {
  const game = classifyInventoryGame(item);
  if (isPokemonInventoryItem(item)) return null;
  if (game === "Magic" && isEnrichableMagicSingle(item)) return null;

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
    if (!priceChartingProductMatchesItem(item, query, product)) continue;

    const img =
      (product["image-url"] as string | undefined) ??
      (product.imageUrl as string | undefined);
    if (img?.trim()) {
      return fetchRemoteImage(img.trim());
    }

    const tcgId = product["tcg-id"] ?? product.tcgId;
    if (tcgId != null && String(tcgId).trim()) {
      const fetched = await fetchTcgplayerProductImageById(
        item,
        String(tcgId).trim(),
      );
      if (fetched) return fetched;
    }
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
  const details = await fetchTcgplayerProductDetails(productId);
  if (
    details?.productLineName &&
    !tcgplayerProductLineMatchesItem(details.productLineName, item)
  ) {
    return null;
  }
  const lineMatches = Boolean(details?.productLineName);

  const tcgLowPrice = lineMatches
    ? details?.lowestPrice != null && details.lowestPrice > 0
      ? details.lowestPrice
      : details?.marketPrice != null && details.marketPrice > 0
        ? details.marketPrice
        : undefined
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

async function fetchTcgplayerSearchImageByProductId(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string; tcgLowPrice?: number } | null> {
  const preferredId = item.tcgplayerProductId?.trim();
  if (!preferredId) return null;

  const hits = await searchTcgplayerInventoryProducts({
    q: preferredId,
    productLineNames: tcgplayerProductLinesForItem(item),
    limit: 6,
  });
  const match = hits.find((hit) => String(hit.productId) === preferredId);
  if (!match?.productId) return null;
  if (
    match.productLineName &&
    !tcgplayerProductLineMatchesItem(match.productLineName, item)
  ) {
    return null;
  }

  if (match.imageUrl?.trim()) {
    try {
      return await fetchRemoteImage(match.imageUrl.trim());
    } catch {
      /* try CDN next */
    }
  }

  return fetchTcgplayerProductImageById(item, String(match.productId));
}

async function fetchTcgplayerSearchImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const productLineNames = tcgplayerProductLinesForItem(item);
  const queries = inventoryImageSearchQueries(item).slice(0, 6);
  const preferredId = item.tcgplayerProductId?.trim();

  for (const query of queries) {
    const hits = await searchTcgplayerInventoryProducts({
      q: query,
      productLineNames,
      limit: 8,
    });
    const gameFiltered = hits.filter(
      (hit) =>
        tcgplayerProductLineMatchesItem(hit.productLineName, item) &&
        priceChartingNameMatches(query, hit.productName),
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

  if (game === "Magic") {
    const scryfall = await fetchScryfallImage(item);
    if (scryfall) return scryfall;
  }

  if (isPokemonJapanInventoryItem(item)) {
    const japan = await fetchPokemonJapanInventoryImage(item);
    if (japan) {
      return {
        buffer: japan.buffer,
        contentType: japan.contentType,
        tcgLowPrice: japan.tcgLowPrice,
      };
    }
  }

  if (isPokemonInventoryItem(item)) {
    const pokemon = await fetchEnglishPokemonTcgImage(item);
    if (pokemon) {
      return {
        buffer: pokemon.buffer,
        contentType: pokemon.contentType,
      };
    }
  }

  if (item.tcgplayerProductId) {
    const byId = await fetchTcgplayerSearchImageByProductId(item);
    if (byId) {
      return {
        buffer: byId.buffer,
        contentType: byId.contentType,
        tcgLowPrice: byId.tcgLowPrice,
      };
    }

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

  const gameCatalog = await fetchGameCatalogInventoryImage(item);
  if (gameCatalog) return gameCatalog;

  const tcgSearch = await fetchTcgplayerSearchImage(item);
  if (tcgSearch) return tcgSearch;

  const priceCharting = await fetchPriceChartingImage(item);
  if (priceCharting) {
    return {
      buffer: priceCharting.buffer,
      contentType: priceCharting.contentType,
      tcgLowPrice: priceCharting.tcgLowPrice,
    };
  }

  if (game === "Magic") {
    const scryfall = await fetchScryfallImage(item);
    if (scryfall) return scryfall;
  }

  throw new Error("No image source available");
}
