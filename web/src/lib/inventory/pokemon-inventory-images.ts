import type { PokemonScanIdentity } from "../card-flow-v2/pokemon-japanese-fallback";
import {
  isExactJapanesePokemonPriceChartingMatch,
  tryPriceChartingExactJapanesePokemon,
} from "../card-flow-v2/pokemon-japanese-fallback";
import {
  fetchTcgplayerProductDetails,
  resolveTcgplayerJapanPokemon,
  tcgplayerProductImageUrl,
} from "../card-flow-v2/tcgplayer-japan-catalog";
import {
  pokemonCatalogNameVariants,
  pokemonCollectorQuery,
  pokemonSetIdsFromVision,
} from "../processing/pokemon-utils";
import type { VisionResult } from "../types";
import {
  pokemonImageLocalId,
  pokemonShelfCatalogName,
  pokemonShelfImageUrls,
  pokemonShelfSetId,
  pokemonTcgSetName,
} from "./pokemon-shelf-set";
import { fetchTcgplayerCdnImage } from "../tcgplayer-inventory/cdn-image-fetch";
import { isPokemonJapanInventoryItem } from "./image-cache-trust";
import { INVENTORY_IMAGE_FETCH_TIMEOUT_MS } from "./resolve-display-image";
import type { InventoryItem } from "../types";

type ImageFetchResult = {
  buffer: Buffer;
  contentType: string;
  tcgLowPrice?: number;
};

/** Scrydex answers unknown ids with this placeholder instead of a 404. */
const SCRYDEX_PLACEHOLDER_ETAG = "cfl2loWl84E8tUjrC-Q-I0D0Jh";

async function fetchRemoteImage(url: string): Promise<ImageFetchResult> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "CardScanner/1.0 (https://cardscanner9000.com)",
      Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 100) throw new Error("Image response too small");
  return { buffer, contentType };
}

async function fetchPokemonCatalogImage(
  url: string,
): Promise<ImageFetchResult | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": "CardScanner/1.0 (https://cardscanner9000.com)",
        Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const etag = res.headers.get("etag") ?? "";
    if (etag.includes(SCRYDEX_PLACEHOLDER_ETAG)) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

function inventoryCardName(item: InventoryItem): string {
  const raw =
    item.displayName.split(" — ")[0]?.trim() ||
    item.productName?.trim() ||
    item.title?.trim() ||
    item.displayName.trim();
  return raw
    .replace(/\s*-\s*Near Mint.*$/i, "")
    .replace(/\s*-\s*[A-Z]{2,}\d+[A-Z0-9-]*\s*$/i, "")
    .trim();
}

/** Strip TCGplayer suffixes like " - 090/063" from Japanese product titles. */
function pokemonJapanDisplayName(item: InventoryItem): string {
  const raw = inventoryCardName(item);
  return raw
    .replace(/\s*-\s*\d{1,3}\/\d{1,3}\s*$/, "")
    .replace(/\s*\(\d{1,3}\)\s*$/, "")
    .trim();
}

export function pokemonJapanIdentityFromInventoryItem(
  item: InventoryItem,
): PokemonScanIdentity {
  const setRaw = item.setName?.trim();
  const codeSplit = setRaw?.match(/^([A-Za-z0-9]+):\s*(.+)$/);
  return {
    detectedName: pokemonJapanDisplayName(item),
    displayName: pokemonJapanDisplayName(item),
    setName: codeSplit?.[2]?.trim() ?? setRaw,
    setCode: codeSplit?.[1]?.trim() ?? normalizeSetCodeFromName(setRaw),
    collectorNumber: item.cardNumber?.trim(),
    language: "jp",
  };
}

function normalizeSetCodeFromName(setName?: string): string | undefined {
  if (!setName?.trim()) return undefined;
  const m = setName.trim().match(/^([A-Za-z0-9]+):/);
  return m?.[1];
}

function priceChartingImageUrl(
  product: Record<string, unknown>,
): string | undefined {
  const url =
    (product["image-url"] as string | undefined) ??
    (product.imageUrl as string | undefined);
  return url?.trim() || undefined;
}

/** Japanese Pokémon — TCGplayer Japan + PriceCharting only (never English pokemontcg.io). */
export async function fetchPokemonJapanInventoryImage(
  item: InventoryItem,
): Promise<ImageFetchResult | null> {
  if (!isPokemonJapanInventoryItem(item)) return null;

  const identity = pokemonJapanIdentityFromInventoryItem(item);
  const productId = item.tcgplayerProductId?.trim();

  if (productId) {
    try {
      const fetched = await fetchTcgplayerCdnImage(
        productId,
        item.frontImageUrl?.includes("tcgplayer-cdn")
          ? item.frontImageUrl
          : tcgplayerProductImageUrl(productId),
      );
      const details = await fetchTcgplayerProductDetails(productId);
      return {
        buffer: fetched.buffer,
        contentType: fetched.contentType,
        tcgLowPrice:
          details?.lowestPrice != null && details.lowestPrice > 0
            ? details.lowestPrice
            : details?.marketPrice,
      };
    } catch {
      /* fall through to catalog match */
    }
  }

  const pcProduct = await tryPriceChartingExactJapanesePokemon(identity);
  if (
    pcProduct &&
    isExactJapanesePokemonPriceChartingMatch(pcProduct, identity)
  ) {
    const direct = priceChartingImageUrl(pcProduct);
    if (direct) {
      try {
        return await fetchRemoteImage(direct);
      } catch {
        /* try tcg-id bridge next */
      }
    }
  }

  const tcgMeta = await resolveTcgplayerJapanPokemon(identity, {
    priceChartingProduct: pcProduct ?? undefined,
  });
  if (tcgMeta?.imageUrl) {
    try {
      const fetched = await fetchRemoteImage(tcgMeta.imageUrl);
      return {
        ...fetched,
        tcgLowPrice:
          tcgMeta.lowestPrice != null && tcgMeta.lowestPrice > 0
            ? tcgMeta.lowestPrice
            : tcgMeta.marketPrice,
      };
    } catch {
      if (tcgMeta.productId) {
        try {
          const fetched = await fetchTcgplayerCdnImage(
            tcgMeta.productId,
            tcgMeta.imageUrl,
          );
          return {
            buffer: fetched.buffer,
            contentType: fetched.contentType,
            tcgLowPrice: tcgMeta.lowestPrice ?? tcgMeta.marketPrice,
          };
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function englishPokemonNameVariants(item: InventoryItem): string[] {
  const names = new Set<string>();
  const add = (raw?: string) => {
    const cleaned = pokemonShelfCatalogName(raw);
    for (const base of [cleaned, raw?.trim() ?? ""]) {
      if (!base) continue;
      names.add(base);
      for (const variant of pokemonCatalogNameVariants(base)) names.add(variant);
      const gx = base.replace(/\s+GX\b/g, "-GX");
      if (gx !== base) names.add(gx);
    }
  };
  add(inventoryCardName(item));
  add(item.productName?.trim());
  add(item.displayName.split(" — ")[0]?.trim());
  return [...names].filter(Boolean);
}

function printedNumbersAgree(
  cardNumber: string | undefined,
  expected: string,
): boolean {
  const want = expected.toUpperCase();
  const local = pokemonImageLocalId(cardNumber)?.toUpperCase();
  if (local === want) return true;
  const stem = cardNumber?.split("/")[0]?.trim().toUpperCase();
  return stem === want;
}

function inventoryItemToVision(item: InventoryItem): VisionResult {
  return {
    category: "pokemon",
    confidence: 0.5,
    itemType: "raw",
    conditionEstimate: "NM",
    cardName: inventoryCardName(item),
    setName: item.setName,
    cardNumber: item.cardNumber,
  };
}

/** English Pokémon via pokemontcg.io with TCGplayer-aware name/set normalization. */
export async function fetchEnglishPokemonTcgImage(
  item: InventoryItem,
): Promise<ImageFetchResult | null> {
  if (isPokemonJapanInventoryItem(item)) return null;

  const direct = await fetchDirectPokemonShelfImage(item);
  if (direct) return direct;

  const setId = pokemonShelfSetId(item.setName, item.cardNumber, item.productName);
  const catalogSetName = pokemonTcgSetName(setId);
  const collector = pokemonCollectorQuery(item.cardNumber);
  const localId = pokemonImageLocalId(item.cardNumber);
  const numberToken = localId ?? collector ?? item.cardNumber?.trim();
  const setIds = [
    setId,
    ...pokemonSetIdsFromVision(inventoryItemToVision(item)),
  ].filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index);
  const apiKey = process.env.POKEMON_TCG_API_KEY?.trim();

  for (const name of englishPokemonNameVariants(item)) {
    const queries = [
      numberToken && setIds[0]
        ? `name:"${name}" number:${numberToken} set.id:${setIds[0]}`
        : null,
      numberToken && catalogSetName
        ? `name:"${name}" number:${numberToken} set.name:"${catalogSetName}"`
        : null,
      catalogSetName ? `name:"${name}" set.name:"${catalogSetName}"` : null,
      numberToken ? `name:"${name}" number:${numberToken}` : null,
      `name:"${name}"`,
    ].filter(Boolean) as string[];

    for (const q of queries) {
      let body: {
        data?: Array<{
          name?: string;
          number?: string;
          images?: { large?: string; small?: string };
        }>;
      } = {};
      try {
        const res = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=3&select=id,name,number,set,images`,
          {
            headers: {
              Accept: "application/json",
              ...(apiKey ? { "X-Api-Key": apiKey } : {}),
            },
            signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
          },
        );
        if (!res.ok) continue;
        body = (await res.json()) as typeof body;
      } catch {
        continue;
      }

      for (const card of body.data ?? []) {
        if (numberToken && card.number && !printedNumbersAgree(card.number, numberToken)) {
          continue;
        }
        for (const url of [card.images?.large, card.images?.small]) {
          if (!url) continue;
          const img = await fetchPokemonCatalogImage(url);
          if (img) return img;
        }
      }
    }
  }
  return null;
}

async function fetchDirectPokemonShelfImage(
  item: InventoryItem,
): Promise<ImageFetchResult | null> {
  for (const url of pokemonShelfImageUrls(item.setName, item.cardNumber, item.productName)) {
    const img = await fetchPokemonCatalogImage(url);
    if (img) return img;
  }
  return null;
}
