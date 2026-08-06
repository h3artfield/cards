import type { PricingResult, VisionResult } from "../types";
import {
  fetchScryfallBySetAndNumber,
  normalizeScryfallCollectorNumber,
  searchScryfallCards,
} from "./scryfall-client";
import {
  normalizePokemonSetName,
  normalizePokemonSetCode,
  pokemonCatalogNameVariants,
  pokemonCatalogNamesMatch,
  pokemonCatalogSearchNames,
  pokemonCollectorQuery,
  pokemonNumbersMatch,
  pokemonPrintedTotal,
  pokemonSetIdsFromVision,
  pokemonSetMatches,
  scorePokemonCatalogCard,
  isPokemonPromoNumber,
  pokemonPromoSetId,
  tcgPlayerMarketForRarity,
  tcgPlayerAnyPrice,
  isNonLatinPokemonName,
  isJapanesePokemonVision,
  pokemonJapaneseNameToEnglish,
} from "./pokemon-utils";

function estimatedPrice(marketPrice: number, source: string): PricingResult {
  return {
    marketPrice,
    source,
    estimated: true,
  };
}

async function lookupScryfall(vision: VisionResult): Promise<PricingResult> {
  try {
    const exact =
      vision.setCode && vision.cardNumber
        ? await fetchScryfallBySetAndNumber(vision.setCode, vision.cardNumber)
        : null;
    if (exact) {
      const usd = parseFloat(
        String(
          (exact.prices as { usd?: string; usd_foil?: string } | undefined)
            ?.usd ??
            (exact.prices as { usd_foil?: string } | undefined)?.usd_foil ??
            "0",
        ),
      );
      return {
        marketPrice: usd > 0 ? usd : 0,
        source: "scryfall",
        sourceUrl: String(exact.scryfall_uri ?? ""),
        raw: exact,
        estimated: !(usd > 0),
      };
    }

    for (const query of buildScryfallQueries(vision)) {
      const cards = await searchScryfallCards(query);
      if (!cards.length) continue;
      const card = cards[0]!;
      const usd = parseFloat(
        String(
          (card.prices as { usd?: string; usd_foil?: string } | undefined)?.usd ??
            (card.prices as { usd_foil?: string } | undefined)?.usd_foil ??
            "0",
        ),
      );
      return {
        marketPrice: usd > 0 ? usd : 0,
        source: "scryfall",
        sourceUrl: String(card.scryfall_uri ?? ""),
        raw: card,
        estimated: !(usd > 0),
      };
    }
  } catch {
    /* ignore */
  }
  return estimatedPrice(0, "scryfall_estimate");
}

export function buildScryfallQueries(vision: VisionResult): string[] {
  const name = vision.cardName?.trim();
  const setCode = vision.setCode?.trim().toLowerCase();
  const collector = vision.cardNumber?.trim();
  const cn = normalizeScryfallCollectorNumber(collector ?? undefined);
  const queries: string[] = [];

  if (setCode && cn) {
    queries.push(`set:${setCode} cn:${cn}`);
    queries.push(`set:${setCode} number:${cn}`);
  }
  if (name && setCode && cn) {
    queries.push(`!"${name}" set:${setCode} cn:${cn}`);
  }
  if (name && setCode) {
    queries.push(`!"${name}" set:${setCode}`);
  }
  if (name && cn) {
    queries.push(`!"${name}" cn:${cn}`);
  }
  if (name) {
    queries.push(`!"${name}"`);
    queries.push(name);
  }
  if (vision.setName?.trim() && name) {
    queries.push(`${name} ${vision.setName.trim()}`);
  }

  return [...new Set(queries.filter(Boolean))];
}

export function buildPokemonQueries(vision: VisionResult): string[] {
  const rawName = vision.cardName?.trim();
  const englishAlias =
    rawName && isNonLatinPokemonName(rawName)
      ? pokemonJapaneseNameToEnglish(rawName)
      : undefined;
  const catalogName = englishAlias ?? rawName;
  const names = pokemonCatalogSearchNames(rawName);
  const collector = pokemonCollectorQuery(vision.cardNumber);
  const set = normalizePokemonSetName(vision.setName);
  const queries: string[] = [];
  const setIds = pokemonSetIdsFromVision(vision);

  if (!catalogName && !names.length) {
    if (collector && set) {
      queries.push(`number:${collector} set.name:"${set}"`);
      queries.push(`number:"${collector}" set.name:"${set}"`);
    }
    for (const setId of setIds) {
      if (collector) {
        queries.unshift(`number:${collector} set.id:${setId}`);
        queries.unshift(`number:"${collector}" set.id:${setId}`);
      }
    }
    return [...new Set(queries)];
  }

  const nameList = names.length ? names : catalogName ? [catalogName] : [];
  const queryNames = nameList.filter((n) => !isNonLatinPokemonName(n));

  for (const setId of setIds) {
    if (collector) {
      queries.unshift(`number:${collector} set.id:${setId}`);
      queries.unshift(`number:"${collector}" set.id:${setId}`);
    }
    for (const variant of queryNames) {
      if (/-EX$/i.test(variant)) {
        queries.unshift(`name:"${variant}" set.id:${setId}`);
      }
    }
  }

  for (const name of queryNames) {
    if (collector && set) {
      queries.push(`name:"${name}" number:${collector} set.name:"${set}"`);
      queries.push(`name:"${name}" number:"${collector}" set.name:"${set}"`);
    }
    for (const setId of setIds) {
      if (collector) {
        queries.push(`name:"${name}" number:${collector} set.id:${setId}`);
        queries.push(`name:"${name}" number:"${collector}" set.id:${setId}`);
      }
      queries.push(`name:"${name}" set.id:${setId}`);
    }
    if (collector) {
      queries.push(`name:"${name}" number:${collector}`);
      queries.push(`name:"${name}" number:"${collector}"`);
    }
    if (set) {
      queries.push(`name:"${name}" set.name:"${set}"`);
    }
    queries.push(`name:"${name}"`);
  }

  if (isPokemonPromoNumber(vision.cardNumber)) {
    const promoCode = pokemonCollectorQuery(vision.cardNumber);
    const promoSetId = pokemonPromoSetId(vision.cardNumber);
    if (promoCode) {
      queries.unshift(`number:"${promoCode}"`);
      if (promoSetId) {
        queries.unshift(`number:"${promoCode}" set.id:${promoSetId}`);
        const promoName = queryNames[0];
        if (promoName) {
          queries.unshift(
            `name:"${promoName}" number:"${promoCode}" set.id:${promoSetId}`,
          );
        }
      }
    }
  }

  let result = [...new Set(queries)];

  if (isJapanesePokemonVision(vision)) {
    result = result.filter((q) => {
      if (/^name:"[^"]+"$/.test(q)) return false;
      if (
        queryNames.length > 0 &&
        /^number:\d+ set\.id:[a-z0-9]+$/i.test(q)
      ) {
        return false;
      }
      if (
        queryNames.length > 0 &&
        /^number:"\d+" set\.id:[a-z0-9]+$/i.test(q)
      ) {
        return false;
      }
      return true;
    });
    if (normalizePokemonSetCode(vision.setCode) && collector) {
      const anchored = result.filter(
        (q) => q.includes("set.id:") || q.includes("set.name:"),
      );
      if (anchored.length > 0) result = anchored;
    }
  }

  return result;
}

export function pickPokemonCard(
  cards: Array<Record<string, unknown>>,
  vision: VisionResult,
): Record<string, unknown> | undefined {
  if (!cards.length) return undefined;
  const collector = pokemonCollectorQuery(vision.cardNumber);
  const setNorm = normalizePokemonSetName(vision.setName);

  const visionNumberMatchesAny =
    !!collector &&
    cards.some((card) => {
      const num = String(card.number ?? "");
      return (
        pokemonNumbersMatch(vision.cardNumber, num) ||
        num.startsWith(`${collector}/`)
      );
    });

  const scored = cards.map((card) => ({
    card,
    score: scorePokemonCatalogCard(card, vision),
  }));

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score >= 45) return best.card;

  const nameSetFallback = scored.find((entry) => {
    const num = String(entry.card.number ?? "");
    const setName = String(
      (entry.card.set as { name?: string } | undefined)?.name ?? "",
    );
    const name = String(entry.card.name ?? "").toLowerCase();
    return (
      setNorm &&
      pokemonSetMatches(setNorm, setName) &&
      vision.cardName &&
      pokemonCatalogNamesMatch(vision.cardName, String(entry.card.name ?? "")) &&
      !(
        collector &&
        visionNumberMatchesAny &&
        !pokemonNumbersMatch(vision.cardNumber, num)
      )
    );
  });
  if (nameSetFallback) return nameSetFallback.card;

  return undefined;
}

export function pickBestNameMatch(
  cards: Array<Record<string, unknown>>,
  vision: VisionResult,
): Record<string, unknown> | undefined {
  const name = vision.cardName?.trim().toLowerCase();
  if (!name) return undefined;
  const matches = cards.filter((c) =>
    pokemonCatalogNamesMatch(vision.cardName, String(c.name ?? "")),
  );
  if (!matches.length) return undefined;
  if (matches.length === 1) return matches[0];

  const setNorm = normalizePokemonSetName(vision.setName);
  if (setNorm) {
    const bySet = matches.find((c) =>
      pokemonSetMatches(
        setNorm,
        String((c.set as { name?: string } | undefined)?.name ?? ""),
      ),
    );
    if (bySet) return bySet;
  }
  return matches[0];
}

export async function fetchPokemonCards(
  query: string,
): Promise<Record<string, unknown>[]> {
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  const headers: HeadersInit = apiKey ? { "X-Api-Key": apiKey } : {};

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=25&orderBy=-set.releaseDate`,
      { headers, signal: controller.signal },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupPokemonTcg(vision: VisionResult): Promise<PricingResult> {
  const cardName = vision.cardName?.trim();
  const queries = buildPokemonQueries(vision);
  if (!queries.length) {
    return estimatedPrice(0, "pokemon_tcg_estimate");
  }

  try {
    for (const query of queries) {
      const cards = await fetchPokemonCards(query);
      if (!cards.length) continue;

      const card = pickPokemonCard(cards, vision);
      if (!card) continue;

      const tcgplayer = card.tcgplayer as
        | {
            url?: string;
            prices?: Record<string, { market?: number; mid?: number; low?: number }>;
          }
        | undefined;
      const cardmarket = card.cardmarket as
        | {
            prices?: {
              averageSellPrice?: number;
              trendPrice?: number;
              avg30?: number;
            };
          }
        | undefined;

      const rarity = String(card.rarity ?? "");
      const market =
        tcgPlayerMarketForRarity(
          tcgplayer?.prices,
          rarity,
          vision.variant,
          vision.conditionEstimate,
        ) ||
        tcgPlayerAnyPrice(tcgplayer?.prices) ||
        cardmarket?.prices?.averageSellPrice ||
        cardmarket?.prices?.trendPrice ||
        cardmarket?.prices?.avg30 ||
        0;

      return {
        marketPrice: market,
        source: "pokemon_tcg",
        sourceUrl: tcgplayer?.url,
        raw: card,
        estimated: market <= 0,
        matchQuery: query,
      };
    }

    if (cardName) {
      const cards = await fetchPokemonCards(`name:"${cardName}"`);
      const card = pickPokemonCard(cards, vision) ?? cards[0];
      if (card) {
        const tcgplayer = card.tcgplayer as
          | {
              url?: string;
              prices?: Record<string, { market?: number; mid?: number; low?: number }>;
            }
          | undefined;
        const cardmarket = card.cardmarket as
          | { prices?: { averageSellPrice?: number; trendPrice?: number; avg30?: number } }
          | undefined;
        const market =
          tcgPlayerAnyPrice(tcgplayer?.prices) ||
          cardmarket?.prices?.averageSellPrice ||
          cardmarket?.prices?.trendPrice ||
          cardmarket?.prices?.avg30 ||
          0;
        if (market > 0) {
          return {
            marketPrice: market,
            source: "pokemon_tcg",
            sourceUrl: tcgplayer?.url,
            raw: card,
            estimated: false,
            matchQuery: `name:"${cardName}"`,
          };
        }
        return {
          marketPrice: 0,
          source: "pokemon_tcg",
          sourceUrl: tcgplayer?.url,
          raw: card,
          estimated: true,
          matchQuery: `name:"${cardName}"`,
        };
      }
    }

    return estimatedPrice(0, "pokemon_tcg_estimate");
  } catch {
    return estimatedPrice(0, "pokemon_tcg_estimate");
  }
}

async function lookupYgoProDeck(vision: VisionResult): Promise<PricingResult> {
  const name = vision.cardName ?? "";
  if (!name) return estimatedPrice(0, "ygoprodeck_estimate");

  try {
    const res = await fetch(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}`,
    );
    if (!res.ok) return estimatedPrice(0, "ygoprodeck_estimate");
    const data = await res.json();
    const card = data.data?.[0];
    const prices = card?.card_prices?.[0];
    const market = parseFloat(
      prices?.tcgplayer_price ?? prices?.cardmarket_price ?? "0",
    );
    return {
      marketPrice: market > 0 ? market : 0,
      source: "ygoprodeck",
      sourceUrl: `https://ygoprodeck.com/card/${card?.id}`,
      raw: card,
      estimated: !(market > 0),
    };
  } catch {
    return estimatedPrice(0, "ygoprodeck_estimate");
  }
}

async function lookupSportsPriceCharting(
  vision: VisionResult,
): Promise<PricingResult> {
  const { fetchPriceChartingComps } = await import("./pricing/pricecharting-pricing");
  const { pickPriceChartingMarket } = await import("./pricing/pricecharting-utils");
  const lookup = await fetchPriceChartingComps(vision);
  if (!lookup) {
    return estimatedPrice(0, "sports_estimate");
  }
  const market = pickPriceChartingMarket(lookup.product, vision);
  return {
    marketPrice: market,
    source: "pricecharting",
    sourceUrl: lookup.sourceUrl,
    raw: lookup.product as unknown as Record<string, unknown>,
    estimated: market <= 0,
    comps: lookup.candidates,
    compCount: lookup.candidates.length,
    compMethod: "catalog_tier",
  };
}

/** Catalog-only lookup — no PriceCharting/eBay fallbacks. */
export async function lookupCatalogPrice(
  vision: VisionResult,
): Promise<PricingResult> {
  switch (vision.category) {
    case "magic":
      return lookupScryfall(vision);
    case "pokemon":
      return lookupPokemonTcg(vision);
    case "yugioh":
      return lookupYgoProDeck(vision);
    case "sports":
      return lookupSportsPriceCharting(vision);
    default:
      return estimatedPrice(0, "estimate");
  }
}

export { lookupScryfall, lookupYgoProDeck };
