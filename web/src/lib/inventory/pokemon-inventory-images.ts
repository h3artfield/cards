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
import { fetchTcgplayerCdnImage } from "../tcgplayer-inventory/cdn-image-fetch";
import { isPokemonJapanInventoryItem } from "./image-cache-trust";
import { INVENTORY_IMAGE_FETCH_TIMEOUT_MS } from "./resolve-display-image";
import type { InventoryItem } from "../types";

type ImageFetchResult = {
  buffer: Buffer;
  contentType: string;
  tcgLowPrice?: number;
};

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
  for (const raw of [
    inventoryCardName(item),
    item.productName?.trim(),
    item.displayName.split(" — ")[0]?.trim(),
  ]) {
    if (!raw) continue;
    names.add(raw);
    const withoutParenNum = raw.replace(/\s*\(\d{1,3}\)\s*$/, "").trim();
    if (withoutParenNum) names.add(withoutParenNum);
    for (const variant of pokemonCatalogNameVariants(raw)) {
      names.add(variant);
    }
  }
  return [...names].filter(Boolean);
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

  const setName = item.setName?.trim();
  const collector = pokemonCollectorQuery(item.cardNumber);
  const numberToken = collector ?? item.cardNumber?.trim();
  const setIds = pokemonSetIdsFromVision(inventoryItemToVision(item));
  const apiKey = process.env.POKEMON_TCG_API_KEY?.trim();

  for (const name of englishPokemonNameVariants(item)) {
    const queries = [
      numberToken && setIds[0]
        ? `name:"${name}" number:${numberToken} set.id:${setIds[0]}`
        : null,
      numberToken && setName
        ? `name:"${name}" number:${numberToken} set.name:"${setName}"`
        : null,
      setName ? `name:"${name}" set.name:"${setName}"` : null,
      numberToken ? `name:"${name}" number:${numberToken}` : null,
      `name:"${name}"`,
    ].filter(Boolean) as string[];

    for (const q of queries) {
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

      const body = (await res.json()) as {
        data?: Array<{
          name?: string;
          number?: string;
          set?: { name?: string };
          images?: { large?: string; small?: string };
        }>;
      };

      for (const card of body.data ?? []) {
        if (
          numberToken &&
          collector &&
          card.number &&
          !card.number.startsWith(collector) &&
          card.number.split("/")[0] !== collector
        ) {
          continue;
        }
        const img = card.images?.large ?? card.images?.small;
        if (img) return fetchRemoteImage(img);
      }
    }
  }
  return null;
}
