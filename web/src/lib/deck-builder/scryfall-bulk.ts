import {
  catalogCardFromScryfall,
  fetchScryfallBulkJsonlUri,
} from "./scryfall-catalog";
import type { CatalogCard } from "./types";
import { streamDefaultCardsBulk } from "./scryfall-bulk-index";

let cachedCommanderLegal: CatalogCard[] | null = null;

export async function loadCommanderLegalBulkCards(): Promise<CatalogCard[]> {
  if (cachedCommanderLegal) return cachedCommanderLegal;

  const uri = await fetchScryfallBulkJsonlUri();
  if (!uri) throw new Error("Could not resolve Scryfall bulk download URI");

  const res = await fetch(uri, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        process.env.SCRYFALL_USER_AGENT ??
        "CardBuyback/1.0 (+https://buyback-web-staging-rrogeqxyea-uc.a.run.app)",
    },
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`Scryfall bulk download failed (${res.status})`);
  if (!res.body) throw new Error("Scryfall bulk download returned empty body");

  const commanderById = new Map<string, CatalogCard>();
  await streamDefaultCardsBulk({
    body: res.body,
    gzip: uri.endsWith(".gz"),
    onRawCard: (raw, card) => {
      const legalities = raw.legalities as Record<string, string> | undefined;
      if (legalities?.commander !== "legal") return;
      if (!commanderById.has(card.id)) {
        commanderById.set(card.id, card);
      }
    },
  });

  cachedCommanderLegal = [...commanderById.values()];
  return cachedCommanderLegal;
}

export function clearScryfallBulkCache(): void {
  cachedCommanderLegal = null;
}

export async function importScryfallBulkBatch(input: {
  offset: number;
  batchSize: number;
  saveCatalogCard: (card: CatalogCard) => Promise<void>;
}): Promise<{
  processed: number;
  imported: number;
  total: number;
  remaining: number;
  nextOffset: number;
}> {
  const all = await loadCommanderLegalBulkCards();
  const slice = all.slice(input.offset, input.offset + input.batchSize);
  let imported = 0;
  for (const card of slice) {
    await input.saveCatalogCard(card);
    imported += 1;
  }
  const nextOffset = input.offset + slice.length;
  return {
    processed: slice.length,
    imported,
    total: all.length,
    remaining: Math.max(0, all.length - nextOffset),
    nextOffset,
  };
}

/** Paginated Scryfall search fallback when bulk download is unavailable. */
export async function importScryfallSearchPage(input: {
  page: number;
  saveCatalogCard: (card: CatalogCard) => Promise<void>;
}): Promise<{ imported: number; hasMore: boolean; totalCards: number }> {
  const url =
    input.page <= 1
      ? "https://api.scryfall.com/cards/search?q=legal:commander&unique=cards&order=edhrec"
      : null;

  const res = await fetch(
    url ??
      `https://api.scryfall.com/cards/search?q=legal:commander&unique=cards&order=edhrec&page=${input.page}`,
    {
      headers: { Accept: "application/json", "User-Agent": "CardScanner9000/1.0" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) {
    return { imported: 0, hasMore: false, totalCards: 0 };
  }
  const body = (await res.json()) as {
    data?: Record<string, unknown>[];
    has_more?: boolean;
    total_cards?: number;
  };
  let imported = 0;
  for (const raw of body.data ?? []) {
    const card = catalogCardFromScryfall(raw);
    if (card) {
      await input.saveCatalogCard(card);
      imported += 1;
    }
  }
  return {
    imported,
    hasMore: Boolean(body.has_more),
    totalCards: body.total_cards ?? 0,
  };
}

/** @deprecated Commander filtering now happens during JSONL stream parse. */
export function filterCommanderLegalFromBulk(
  cards: Record<string, unknown>[],
): CatalogCard[] {
  const out: CatalogCard[] = [];
  const seen = new Set<string>();
  for (const raw of cards) {
    const legalities = raw.legalities as Record<string, string> | undefined;
    if (legalities?.commander !== "legal") continue;
    const parsed = catalogCardFromScryfall(raw);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out;
}
