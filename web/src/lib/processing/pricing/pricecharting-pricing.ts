import type { VisionResult } from "../../types";
import type { CompCandidate } from "./comp-stats";
import {
  buildPriceChartingQueries,
  centsToUsd,
  isPriceChartingSuccess,
  pickPriceChartingMarket,
  pickPriceChartingTiers,
  priceChartingProductUrl,
  scorePriceChartingProduct,
} from "./pricecharting-utils";
import { buildSportsSearchQueries } from "./sports-search-queries";
import { priceChartingProductMatchesVision } from "./pricecharting-match";

export interface PriceChartingProduct {
  id?: string;
  "product-name"?: string;
  "console-name"?: string;
  "loose-price"?: number;
  "cib-price"?: number;
  "new-price"?: number;
  "graded-price"?: number;
  "manual-only-price"?: number;
  "bgs-10-price"?: number;
  "condition-17-price"?: number;
  "condition-18-price"?: number;
  "sales-volume"?: number;
  status?: string;
}

export interface PriceChartingLookup {
  product: PriceChartingProduct;
  candidates: CompCandidate[];
  sourceUrl?: string;
}

export { pickPriceChartingMarket };

const API_BASE = "https://www.pricecharting.com/api";

function tiersToCandidates(
  product: PriceChartingProduct,
  tiers: { label: string; cents?: number }[],
): CompCandidate[] {
  const title = product["product-name"];
  const candidates: CompCandidate[] = [];

  for (const tier of tiers) {
    const price = centsToUsd(tier.cents);
    if (price == null) continue;
    candidates.push({
      price,
      source: "pricecharting",
      condition: tier.label,
      title,
    });
  }

  return candidates;
}

async function fetchProductById(
  apiKey: string,
  id: string,
): Promise<PriceChartingProduct | null> {
  const url = `${API_BASE}/product?t=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(id)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const product = (await res.json()) as PriceChartingProduct;
  if (!isPriceChartingSuccess(product)) return null;
  return product;
}

async function fetchProductByQuery(
  apiKey: string,
  query: string,
): Promise<PriceChartingProduct | null> {
  const url = `${API_BASE}/product?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const product = (await res.json()) as PriceChartingProduct;
  if (!isPriceChartingSuccess(product)) return null;
  return product;
}

async function resolveProductId(
  apiKey: string,
  query: string,
  vision: VisionResult,
): Promise<string | null> {
  const url = `${API_BASE}/products?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    products?: PriceChartingProduct[];
  };
  if (data.status === "error" || !data.products?.length) return null;

  const scored = data.products
    .map((p) => ({ p, score: scorePriceChartingProduct(p, vision) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const minScore = vision.category === "sports" ? 18 : 35;
  if (!best?.p.id || best.score < minScore) return null;
  if (!priceChartingProductMatchesVision(best.p, vision)) return null;
  return String(best.p.id);
}

function acceptProduct(
  product: PriceChartingProduct | null,
  vision: VisionResult,
): PriceChartingProduct | null {
  if (!product) return null;
  if (!priceChartingProductMatchesVision(product, vision)) return null;
  return product;
}

async function lookupProduct(
  apiKey: string,
  query: string,
  vision: VisionResult,
): Promise<PriceChartingProduct | null> {
  const productId = await resolveProductId(apiKey, query, vision);
  if (productId) {
    const byId = await fetchProductById(apiKey, productId);
    const accepted = acceptProduct(byId, vision);
    if (accepted) return accepted;
  }
  const direct = await fetchProductByQuery(apiKey, query);
  return acceptProduct(direct, vision);
}

export async function fetchPriceChartingComps(
  vision: VisionResult,
): Promise<PriceChartingLookup | null> {
  const apiKey = process.env.PRICECHARTING_API_KEY?.trim();
  if (!apiKey) return null;

  const queries = [
    ...buildSportsSearchQueries(vision),
    ...buildPriceChartingQueries(vision),
  ].filter((q, i, arr) => arr.indexOf(q) === i);

  for (const query of queries) {
    try {
      const product = await lookupProduct(apiKey, query, vision);
      if (!product) continue;

      const tiers = pickPriceChartingTiers(product, vision);
      const candidates = tiersToCandidates(product, tiers);
      if (!candidates.length) continue;

      return {
        product,
        candidates,
        sourceUrl: priceChartingProductUrl(product),
      };
    } catch {
      continue;
    }
  }

  return null;
}

export interface PriceChartingSearchHit {
  product: PriceChartingProduct;
  candidates: CompCandidate[];
  sourceUrl?: string;
  score: number;
}

/** Raw PriceCharting product search — no vision scoring filter (JP identity recovery). */
export async function fetchPriceChartingProductsRaw(
  query: string,
  limit = 12,
): Promise<PriceChartingProduct[]> {
  const apiKey = process.env.PRICECHARTING_API_KEY?.trim();
  const trimmed = query.trim();
  if (!apiKey || !trimmed) return [];

  const url = `${API_BASE}/products?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      status?: string;
      products?: PriceChartingProduct[];
    };
    if (data.status === "error" || !data.products?.length) return [];
    return data.products.slice(0, limit);
  } catch {
    return [];
  }
}

/** Search PriceCharting for multiple product matches (admin lookup / identity recovery). */
export async function searchPriceChartingProducts(
  query: string,
  visionHint?: VisionResult,
  limit = 12,
): Promise<PriceChartingSearchHit[]> {
  const apiKey = process.env.PRICECHARTING_API_KEY?.trim();
  const trimmed = query.trim();
  if (!apiKey || !trimmed) return [];

  const vision: VisionResult =
    visionHint ?? {
      category: "sports",
      confidence: 0.5,
      itemType: "raw",
      conditionEstimate: "NM",
      cardName: trimmed,
      playerName: trimmed,
    };

  const url = `${API_BASE}/products?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      status?: string;
      products?: PriceChartingProduct[];
    };
    if (data.status === "error" || !data.products?.length) return [];

    return data.products
      .map((product) => {
        const tiers = pickPriceChartingTiers(product, vision);
        const candidates = tiersToCandidates(product, tiers);
        return {
          product,
          candidates,
          sourceUrl: priceChartingProductUrl(product),
          score: scorePriceChartingProduct(product, vision),
        };
      })
      .filter(
        (hit) =>
          hit.score >= 15 && priceChartingProductMatchesVision(hit.product, vision),
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch {
    return [];
  }
}
