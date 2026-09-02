import { scryfallFetch, scryfallPost } from "../processing/scryfall-client";

export const PROFESSOR_BREW_SCRYFALL_PRICES_V1_VERSION = "professor-brew-scryfall-prices-v1";

const COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const BATCH = 75;

type ScryfallPriceCard = {
  name?: string;
  prices?: { usd?: string | null; usd_foil?: string | null };
};

function parseUsd(card: ScryfallPriceCard): number | null {
  const raw = card.prices?.usd ?? card.prices?.usd_foil ?? "";
  const value = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function remember(map: Record<string, number>, requested: string, printed: string | undefined, usd: number) {
  map[requested] = usd;
  if (printed && map[printed] == null) map[printed] = usd;
  const front = printed?.split(" // ")[0]?.trim();
  if (front && map[front] == null) map[front] = usd;
}

function matchRequestedName(batch: string[], printed: string | undefined): string | undefined {
  if (!printed) return undefined;
  const printedLower = printed.toLowerCase();
  const front = printed.split(" // ")[0]?.trim().toLowerCase();
  return (
    batch.find((name) => name.toLowerCase() === printedLower) ??
    batch.find((name) => name.toLowerCase() === front) ??
    batch.find((name) => printedLower.startsWith(`${name.toLowerCase()} //`))
  );
}

async function fillNamedLookups(names: string[], prices: Record<string, number>): Promise<void> {
  for (const name of names) {
    if (prices[name] != null) continue;
    try {
      const exact = await scryfallFetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
      );
      if (exact.ok) {
        const card = (await exact.json()) as ScryfallPriceCard;
        const usd = parseUsd(card);
        if (usd != null) {
          remember(prices, name, card.name, usd);
          continue;
        }
      }
      const fuzzy = await scryfallFetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
      );
      if (!fuzzy.ok) continue;
      const card = (await fuzzy.json()) as ScryfallPriceCard;
      const usd = parseUsd(card);
      if (usd != null) remember(prices, name, card.name, usd);
    } catch {
      /* leave unpriced */
    }
  }
}

export async function resolveProfessorBrewCardTcgPriceMap(
  cardNames: string[],
): Promise<Record<string, number>> {
  const unique = [...new Set(cardNames.map((n) => n.trim()).filter(Boolean))];
  const prices: Record<string, number> = {};
  const missing: string[] = [];

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    try {
      const res = await scryfallPost(COLLECTION_URL, {
        identifiers: batch.map((name) => ({ name })),
      });
      if (!res.ok) {
        missing.push(...batch);
        continue;
      }
      const json = (await res.json()) as {
        data?: ScryfallPriceCard[];
      };
      const used = new Set<string>();
      for (const card of json.data ?? []) {
        const usd = parseUsd(card);
        if (usd == null) continue;
        const match = matchRequestedName(batch, card.name) ?? card.name;
        if (!match) continue;
        remember(prices, match, card.name, usd);
        used.add(match);
      }
      for (const name of batch) {
        if (!used.has(name) && prices[name] == null) missing.push(name);
      }
    } catch {
      missing.push(...batch);
    }
  }

  if (missing.length) {
    await fillNamedLookups(missing, prices);
  }

  return prices;
}

export function tcgPriceForCardName(
  pricesByName: Record<string, number>,
  name: string,
): number | null {
  const direct = pricesByName[name];
  if (direct != null && direct > 0) return direct;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(pricesByName)) {
    if (key.toLowerCase() === lower && value > 0) return value;
  }
  return null;
}
