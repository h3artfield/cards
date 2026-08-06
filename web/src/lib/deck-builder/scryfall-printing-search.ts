import { catalogCardFromScryfall } from "./scryfall-catalog";
import type { CatalogCard } from "./types";
import { scryfallFetch } from "../processing/scryfall-client";

export interface ScryfallPrintingSearchHit {
  scryfallId: string;
  name: string;
  setName?: string;
  setCode: string;
  collectorNumber: string;
  rarity?: string;
  imageNormal?: string;
  typeLine?: string;
}

function toHit(card: CatalogCard): ScryfallPrintingSearchHit {
  return {
    scryfallId: card.id,
    name: card.name,
    setName: card.setName,
    setCode: card.set,
    collectorNumber: card.collectorNumber,
    rarity: card.rarity,
    imageNormal: card.imageNormal,
    typeLine: card.typeLine,
  };
}

/** Search Scryfall for paper printings (admin manual match picker). */
export async function searchScryfallPrintings(input: {
  query: string;
  limit?: number;
}): Promise<ScryfallPrintingSearchHit[]> {
  const query = input.query.trim();
  if (!query) return [];

  const limit = Math.min(24, Math.max(1, input.limit ?? 12));

  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${query} game:paper`)}`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: Record<string, unknown>[];
    };
    const hits: ScryfallPrintingSearchHit[] = [];
    for (const raw of body.data ?? []) {
      const card = catalogCardFromScryfall(raw);
      if (!card) continue;
      hits.push(toHit(card));
      if (hits.length >= limit) break;
    }
    return hits;
  } catch {
    return [];
  }
}

/** Resolve a single printing by UUID for search-by-ID paste. */
export async function lookupScryfallPrintingById(
  scryfallId: string,
): Promise<ScryfallPrintingSearchHit | null> {
  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId.trim())}`,
    );
    if (!res.ok) return null;
    const card = catalogCardFromScryfall(
      (await res.json()) as Record<string, unknown>,
    );
    return card ? toHit(card) : null;
  } catch {
    return null;
  }
}
