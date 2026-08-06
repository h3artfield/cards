import type { PricingResult, VisionResult } from "../types";
import { scorePokemonCatalogCard, isJapanesePokemonVision } from "./pokemon-utils";
import {
  buildPokemonQueries,
  buildScryfallQueries,
  fetchPokemonCards,
  pickBestNameMatch,
  pickPokemonCard,
  lookupCatalogPrice,
  lookupScryfall,
  lookupYgoProDeck,
} from "./catalog-pricing";
import { resolveMtgVisionSetCode } from "./mtg-catalog-set";
import { resolveMarketPrice, type ResolveMarketPriceOptions } from "./pricing/resolve-market-price";
import { mergeVisionSlabFields } from "./slab-pricing";
import {
  fetchPriceChartingComps,
  searchPriceChartingProducts,
} from "./pricing/pricecharting-pricing";
import { buildPriceChartingQueries } from "./pricing/pricecharting-utils";
import { buildSportsSearchQueries } from "./pricing/sports-search-queries";
import {
  fetchScryfallBySetAndNumber,
  searchScryfallCards,
} from "./scryfall-client";

export async function lookupMarketPrice(
  vision: VisionResult,
  options?: ResolveMarketPriceOptions,
): Promise<PricingResult> {
  return resolveMarketPrice(mergeVisionSlabFields(vision), options);
}

export { lookupCatalogPrice };

export interface CatalogMatch {
  raw: Record<string, unknown>;
  source: string;
  sourceUrl?: string;
}

/** Resolve official catalog record (with art) even when market price is missing. */
export async function findCatalogCard(
  vision: VisionResult,
): Promise<CatalogMatch | null> {
  switch (vision.category) {
    case "pokemon": {
      const queries = buildPokemonQueries(vision);
      for (const query of queries) {
        const cards = await fetchPokemonCards(query);
        if (!cards.length) continue;
        const card =
          pickPokemonCard(cards, vision) ?? pickBestNameMatch(cards, vision);
        if (!card) continue;
        const tcgplayer = card.tcgplayer as { url?: string } | undefined;
        return {
          raw: card,
          source: "pokemon_tcg",
          sourceUrl: tcgplayer?.url,
        };
      }
      return null;
    }
    case "magic": {
      const pricing = await lookupScryfall(vision);
      if (pricing.raw) {
        return {
          raw: pricing.raw as Record<string, unknown>,
          source: "scryfall",
          sourceUrl: pricing.sourceUrl,
        };
      }
      return null;
    }
    case "yugioh": {
      const pricing = await lookupYgoProDeck(vision);
      if (pricing.raw) {
        return {
          raw: pricing.raw as Record<string, unknown>,
          source: "ygoprodeck",
          sourceUrl: pricing.sourceUrl,
        };
      }
      return null;
    }
    case "sports": {
      const lookup = await fetchPriceChartingComps(vision);
      if (!lookup) return null;
      return {
        raw: lookup.product as unknown as Record<string, unknown>,
        source: "pricecharting",
        sourceUrl: lookup.sourceUrl,
      };
    }
    default:
      return null;
  }
}

/** All plausible catalog records for identity recovery (multiple printings / queries). */
export async function findCatalogCandidates(
  vision: VisionResult,
  limit = 12,
): Promise<CatalogMatch[]> {
  const seen = new Set<string>();
  const pool: CatalogMatch[] = [];
  const maxPokemonQueries = 8;

  const push = (
    raw: Record<string, unknown>,
    source: string,
    sourceUrl?: string,
  ) => {
    const id = String(
      raw.id ??
        raw["product-name"] ??
        `${raw.name}-${(raw as { number?: string }).number ?? raw.collector_number ?? ""}`,
    );
    if (seen.has(id)) return;
    seen.add(id);
    pool.push({ raw, source, sourceUrl });
  };

  switch (vision.category) {
    case "pokemon": {
      const queries = buildPokemonQueries(vision);
      const jp = isJapanesePokemonVision(vision);
      for (let i = 0; i < Math.min(queries.length, maxPokemonQueries); i++) {
        const query = queries[i]!;
        const cards = await fetchPokemonCards(query);
        for (const card of cards) {
          push(
            card,
            "pokemon_tcg",
            (card.tcgplayer as { url?: string } | undefined)?.url,
          );
        }
        if (pool.length >= limit) break;
        if (!jp && pool.length >= 3) break;
        if (
          !jp &&
          pool.length > 0 &&
          query.includes("set.id:") &&
          query.includes("name:")
        ) {
          break;
        }
        if (
          jp &&
          pool.length > 0 &&
          query.includes("set.id:") &&
          query.includes("name:") &&
          query.includes("number:")
        ) {
          break;
        }
      }
      break;
    }
    case "magic": {
      const magicVision = await resolveMtgVisionSetCode(vision);
      const setCode = magicVision.setCode?.trim().toLowerCase();
      const cn = magicVision.cardNumber?.trim();
      if (setCode && cn) {
        const exact = await fetchScryfallBySetAndNumber(setCode, cn);
        if (exact) {
          push(exact, "scryfall", String(exact.scryfall_uri ?? ""));
        }
        const prints = await searchScryfallCards(`set:${setCode} cn:${cn}`);
        for (const card of prints) {
          push(card, "scryfall", String(card.scryfall_uri ?? ""));
        }
      }
      const cardName = magicVision.cardName?.trim();
      if (cardName) {
        const listPrints = await searchScryfallCards(
          `set:plst !"${cardName.replace(/"/g, "")}"`,
        );
        for (const card of listPrints.slice(0, 6)) {
          push(card, "scryfall", String(card.scryfall_uri ?? ""));
        }
      }
      for (const query of buildScryfallQueries(magicVision)) {
        try {
          const cards = await searchScryfallCards(query);
          for (const card of cards) {
            push(card, "scryfall", String(card.scryfall_uri ?? ""));
          }
        } catch {
          /* ignore */
        }
      }
      break;
    }
    case "yugioh": {
      const match = await findCatalogCard(vision);
      if (match) push(match.raw, match.source, match.sourceUrl);
      break;
    }
    case "sports": {
      const query =
        buildSportsSearchQueries(vision)[0] ??
        buildPriceChartingQueries(vision)[0];
      if (query) {
        const hits = await searchPriceChartingProducts(query, vision, limit);
        for (const hit of hits) {
          push(
            hit.product as unknown as Record<string, unknown>,
            "pricecharting",
            hit.sourceUrl,
          );
        }
      }
      break;
    }
    default:
      break;
  }

  if (vision.category === "pokemon" && pool.length) {
    pool.sort(
      (a, b) =>
        scorePokemonCatalogCard(b.raw, vision) -
        scorePokemonCatalogCard(a.raw, vision),
    );
  }

  return pool.slice(0, limit);
}

export { enrichVisionFromPokemonCard } from "./pokemon-utils";
export { resolveMarketPrice, pricingResultToSalesComps } from "./pricing/resolve-market-price";
