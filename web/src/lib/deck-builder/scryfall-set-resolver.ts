import { scryfallFetch, normalizeScryfallCollectorNumber } from "../processing/scryfall-client";
import { catalogCardFromScryfall } from "./scryfall-catalog";
import type { CatalogCard } from "./types";

let setCodeCache: Array<{ name: string; code: string }> | null = null;

function normalizeSetKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Exact set name or set code, then a full multi-word set name that the shelf
 * label extends ("Avatar: The Last Airbender: Eternal-Legal" → that set).
 * A set code is not a match just because its letters appear inside a word:
 * "prerelease" contains "lea" (Limited Edition Alpha) and "eternal" contains
 * "rna" (Ravnica Allegiance).
 */
export function matchScryfallSetCode(
  setName: string,
  entries: Array<{ name: string; code: string }>,
): string | null {
  const key = normalizeSetKey(setName);
  if (!key) return null;

  const exact = new Map<string, string>();
  for (const entry of entries) {
    const name = normalizeSetKey(entry.name);
    const code = entry.code.trim().toLowerCase();
    if (name && !exact.has(name)) exact.set(name, code);
    if (code && !exact.has(code)) exact.set(code, code);
  }
  const direct = exact.get(key);
  if (direct) return direct;

  for (const entry of entries) {
    const name = normalizeSetKey(entry.name);
    const code = entry.code.trim().toLowerCase();
    if (!name.includes(" ") || name.length < 8 || !code) continue;
    const shelfExtendsSet =
      key.startsWith(name) &&
      (key.length === name.length || /[^a-z0-9]/.test(key.charAt(name.length)));
    const setExtendsShelf =
      key.length >= 8 &&
      name.startsWith(key) &&
      /[^a-z0-9]/.test(name.charAt(key.length));
    if (shelfExtendsSet || setExtendsShelf) return code;
  }

  return null;
}

async function loadSetCodeCache(): Promise<Array<{ name: string; code: string }>> {
  if (setCodeCache) return setCodeCache;

  const entries: Array<{ name: string; code: string }> = [];
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
        if (set.code && set.name) entries.push({ name: set.name, code: set.code });
      }
      nextPage = body.next_page ?? null;
    }
  } catch {
    /* empty cache ok */
  }

  setCodeCache = entries;
  return entries;
}

export async function resolveScryfallSetCode(setName: string): Promise<string | null> {
  const trimmed = setName.trim();
  if (!trimmed) return null;
  return matchScryfallSetCode(trimmed, await loadSetCodeCache());
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
