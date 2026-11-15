import type { CollectionCard } from "../types";
import { collectionPriceCategory } from "./collection-price";

export type CollectionTcgplayerSearchHit = {
  productId?: number;
  productName?: string;
  productLineName?: string;
  setName?: string;
  customAttributes?: { number?: string };
};

const SEALED_PRODUCT =
  /\b(booster|box|case|bundle|playset|fat pack|precon|sealed|display|commander deck|theme deck)\b/i;

const PRODUCT_LINES: Record<string, string[]> = {
  mtg: ["Magic: The Gathering", "Magic"],
  pokemon: ["Pokemon", "Pokémon"],
  yugioh: ["Yu-Gi-Oh!", "YuGiOh", "Yu-Gi-Oh"],
};

export function tcgplayerProductLinesForCard(
  card: Pick<CollectionCard, "category">,
): string[] {
  const category = collectionPriceCategory(card);
  return PRODUCT_LINES[category] ?? [];
}

export function normalizeTcgplayerName(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function chooseTcgplayerUnitPrice(
  listing?: number,
  productLow?: number,
): number | undefined {
  const listingOk = listing != null && listing > 0;
  const productOk = productLow != null && productLow > 0;
  if (listingOk && productOk) {
    return listing > productLow * 4 ? productLow : listing;
  }
  if (listingOk) return listing;
  if (productOk) return productLow;
  return undefined;
}

export function collectionTcgplayerSearchQueries(
  card: Pick<CollectionCard, "displayName" | "setName" | "cardNumber">,
): string[] {
  const name = card.displayName.trim();
  if (!name) return [];
  const set = card.setName?.trim();
  const number = card.cardNumber?.replace(/^#/, "").trim();
  return [
    [name, set, number].filter(Boolean).join(" "),
    [name, set].filter(Boolean).join(" "),
    name,
  ].filter((query, index, all) => all.indexOf(query) === index);
}

function productLineMatches(
  hit: CollectionTcgplayerSearchHit,
  lines: string[],
): boolean {
  if (!lines.length) return true;
  const line = (hit.productLineName ?? "").toLowerCase();
  if (!line) return false;
  return lines.some((wanted) => {
    const needle = wanted.toLowerCase();
    return line.includes(needle) || needle.includes(line);
  });
}

function nameMatchesCard(
  productName: string,
  cardName: string,
): boolean {
  const product = normalizeTcgplayerName(productName);
  const card = normalizeTcgplayerName(cardName.split("//")[0] ?? cardName);
  if (!product || !card) return false;
  return product === card || product.startsWith(`${card} `);
}

export function pickTcgplayerSearchHit(
  hits: CollectionTcgplayerSearchHit[],
  card: Pick<CollectionCard, "displayName" | "setName" | "cardNumber" | "category">,
): CollectionTcgplayerSearchHit | undefined {
  const lines = tcgplayerProductLinesForCard(card);
  const set = normalizeTcgplayerName(card.setName ?? "");
  const number = card.cardNumber?.replace(/^#/, "").trim().toLowerCase();

  const singles = hits.filter((hit) => {
    if (!hit.productId) return false;
    if (SEALED_PRODUCT.test(hit.productName ?? "")) return false;
    if (!productLineMatches(hit, lines)) return false;
    return nameMatchesCard(hit.productName ?? "", card.displayName);
  });

  if (!singles.length) return undefined;

  const numbered = number
    ? singles.filter((hit) => {
        const hitNumber = hit.customAttributes?.number?.replace(/^#/, "").trim().toLowerCase();
        return hitNumber === number;
      })
    : [];
  const setMatched = set
    ? singles.filter((hit) => normalizeTcgplayerName(hit.setName ?? "") === set)
    : [];

  return numbered[0] ?? setMatched[0] ?? singles[0];
}

async function searchTcgplayerProducts(input: {
  q: string;
  productLineNames: string[];
}): Promise<CollectionTcgplayerSearchHit[]> {
  const trimmed = input.q.trim();
  if (!trimmed) return [];

  const body = {
    algorithm: "sales",
    from: 0,
    size: 12,
    filters: {
      ...(input.productLineNames.length
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
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ results?: CollectionTcgplayerSearchHit[] }>;
    };
    return data.results?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

export async function resolveTcgplayerProductIdBySearch(
  card: CollectionCard,
): Promise<string | undefined> {
  const lines = tcgplayerProductLinesForCard(card);
  for (const query of collectionTcgplayerSearchQueries(card)) {
    const hits = await searchTcgplayerProducts({
      q: query,
      productLineNames: lines,
    });
    const picked = pickTcgplayerSearchHit(hits, card);
    if (picked?.productId) return String(picked.productId);
  }
  return undefined;
}
