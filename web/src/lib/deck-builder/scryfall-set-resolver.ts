import { scryfallFetch, normalizeScryfallCollectorNumber } from "../processing/scryfall-client";
import { catalogCardFromScryfall } from "./scryfall-catalog";
import type { CatalogCard } from "./types";

let setCodeCache: Map<string, string> | null = null;

function normalizeSetKey(name: string): string {
  return name.trim().toLowerCase();
}

async function loadSetCodeCache(): Promise<Map<string, string>> {
  if (setCodeCache) return setCodeCache;

  const byKey = new Map<string, string>();
  try {
    let nextPage: string | null = "https://api.scryfall.com/sets";
    while (nextPage) {
      const res = await scryfallFetch(nextPage);
      if (!res.ok) break;
      const body = (await res.json()) as {
        data?: Array<{ code: string; name: string; tcgplayer_id?: number }>;
        next_page?: string | null;
      };
      for (const set of body.data ?? []) {
        byKey.set(normalizeSetKey(set.name), set.code.toLowerCase());
        byKey.set(set.code.toLowerCase(), set.code.toLowerCase());
      }
      nextPage = body.next_page ?? null;
    }
  } catch {
    /* empty cache ok */
  }

  setCodeCache = byKey;
  return byKey;
}

export async function resolveScryfallSetCode(setName: string): Promise<string | null> {
  const trimmed = setName.trim();
  if (!trimmed) return null;

  const cache = await loadSetCodeCache();
  const direct = cache.get(normalizeSetKey(trimmed));
  if (direct) return direct;

  /** Partial match — "Marvel Super Heroes" vs cached name. */
  const key = normalizeSetKey(trimmed);
  for (const [name, code] of cache.entries()) {
    if (name.includes(key) || key.includes(name)) return code;
  }

  return null;
}

export async function fetchCardBySetCodeAndNumber(input: {
  setName?: string;
  setCode?: string;
  cardNumber: string;
}): Promise<CatalogCard | null> {
  const cn = normalizeScryfallCollectorNumber(input.cardNumber);
  if (!cn) return null;

  const code =
    input.setCode?.toLowerCase() ??
    (input.setName ? await resolveScryfallSetCode(input.setName) : null);
  if (!code) return null;

  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(code)}/${encodeURIComponent(cn)}`,
    );
    if (!res.ok) return null;
    return catalogCardFromScryfall((await res.json()) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function searchScryfallCard(
  query: string,
): Promise<CatalogCard | null> {
  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: Record<string, unknown>[];
    };
    const first = body.data?.[0];
    if (!first) return null;
    return catalogCardFromScryfall(first);
  } catch {
    return null;
  }
}

/** Reset cache in tests or after long-running batch. */
export function resetScryfallSetCache(): void {
  setCodeCache = null;
}
