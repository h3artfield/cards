import { classifyInventoryGame } from "./analytics";
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

export function inventoryImageSearchQueries(item: InventoryItem): string[] {
  const name = cardNameFromInventoryItem(item);
  const set = item.setName?.trim();
  const num = item.cardNumber?.trim();
  const queries = new Set<string>();

  if (item.productName?.trim()) queries.add(item.productName.trim());
  if (name && set && num) queries.add(`${name} ${set} ${num}`);
  if (name && set) queries.add(`${name} ${set}`);
  if (name && num) queries.add(`${name} ${num}`);
  if (name) queries.add(name);

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

async function fetchScryfallImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cardName = cardNameFromInventoryItem(item);
  const setName = item.setName?.trim();
  const number = item.cardNumber?.trim();

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
      data?: Array<{
        image_uris?: { normal?: string };
        card_faces?: Array<{ image_uris?: { normal?: string } }>;
      }>;
    };
    const card = search.data?.[0];
    const img =
      card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal;
    if (img) return fetchRemoteImage(img);
  }

  const namedRes = await scryfallFetch(
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`,
  );

  if (namedRes.ok) {
    const card = (await namedRes.json()) as {
      image_uris?: { normal?: string };
      card_faces?: Array<{ image_uris?: { normal?: string } }>;
    };
    const img =
      card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
    if (img) return fetchRemoteImage(img);
  }

  return null;
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
      `name:${name.split(/\s+/)[0]}`,
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

async function fetchTcgplayerCatalogImage(
  item: InventoryItem,
): Promise<{
  buffer: Buffer;
  contentType: string;
  tcgLowPrice?: number;
} | null> {
  if (!item.tcgplayerProductId) return null;

  const details = await fetchTcgplayerProductDetails(item.tcgplayerProductId);
  const tcgLowPrice =
    details?.lowestPrice != null && details.lowestPrice > 0
      ? details.lowestPrice
      : details?.marketPrice != null && details.marketPrice > 0
        ? details.marketPrice
        : undefined;

  try {
    const fetched = await fetchTcgplayerCdnImage(item.tcgplayerProductId);
    return {
      buffer: fetched.buffer,
      contentType: fetched.contentType,
      tcgLowPrice,
    };
  } catch {
    return null;
  }
}

async function fetchTcgplayerSearchImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const queries = inventoryImageSearchQueries(item).slice(0, 4);
  for (const query of queries) {
    try {
      const res = await fetch(
        `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(query)}&isList=false`,
        {
          headers: {
            Accept: "application/json",
            Origin: "https://www.tcgplayer.com",
            Referer: "https://www.tcgplayer.com/",
          },
          signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
        },
      );
      if (!res.ok) continue;

      const body = (await res.json()) as {
        results?: Array<{ productId?: number }>;
      };
      const hits = body.results ?? [];
      const preferredId = item.tcgplayerProductId?.trim();
      const ordered = preferredId
        ? [
            ...hits.filter((h) => String(h.productId) === preferredId),
            ...hits.filter((h) => String(h.productId) !== preferredId),
          ]
        : hits;

      for (const hit of ordered.slice(0, 3)) {
        if (!hit.productId) continue;
        try {
          const fetched = await fetchTcgplayerCdnImage(String(hit.productId));
          return { buffer: fetched.buffer, contentType: fetched.contentType };
        } catch {
          continue;
        }
      }
    } catch {
      continue;
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

  if (game === "Pokémon") {
    const pokemon = await fetchPokemonTcgImage(item);
    if (pokemon) return pokemon;
  }

  if (item.tcgplayerProductId) {
    try {
      const fetched = await fetchTcgplayerCdnImage(
        item.tcgplayerProductId,
        sourceUrl.includes("tcgplayer-cdn") ? sourceUrl : undefined,
      );
      return { buffer: fetched.buffer, contentType: fetched.contentType };
    } catch {
      /* fall through */
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

  const priceCharting = await fetchPriceChartingImage(item);
  if (priceCharting) return priceCharting;

  if (game !== "Magic") {
    const scryfall = await fetchScryfallImage(item);
    if (scryfall) return scryfall;
  }

  if (game !== "Pokémon") {
    const pokemon = await fetchPokemonTcgImage(item);
    if (pokemon) return pokemon;
  }

  throw new Error("No image source available");
}
