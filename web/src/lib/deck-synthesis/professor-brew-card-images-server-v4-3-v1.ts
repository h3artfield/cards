/**
 * Server-only Professor brew card image resolution — Scryfall on the server.
 * Store/catalog images are resolved via inventory-match API on the client.
 */
import { scryfallFetch } from "../processing/scryfall-client";
import {
  pickScryfallCardImageUrl,
  scryfallNamedImageUrl,
} from "./professor-brew-scryfall-images-v1";

export const PROFESSOR_BREW_CARD_IMAGES_SERVER_V4_3_V1_VERSION =
  "professor-brew-card-images-server-v4-3-v1";

export async function resolveProfessorBrewCardImageUrl(cardName: string): Promise<string> {
  const trimmed = cardName.trim();
  if (!trimmed) return scryfallNamedImageUrl("Plains");

  try {
    const exactRes = await scryfallFetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(trimmed)}`,
    );
    if (exactRes.ok) {
      const card = (await exactRes.json()) as Parameters<typeof pickScryfallCardImageUrl>[0];
      const picked = pickScryfallCardImageUrl(card);
      if (picked) return picked;
    }
    const fuzzyRes = await scryfallFetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(trimmed)}`,
    );
    if (fuzzyRes.ok) {
      const card = (await fuzzyRes.json()) as Parameters<typeof pickScryfallCardImageUrl>[0];
      const picked = pickScryfallCardImageUrl(card);
      if (picked) return picked;
    }
  } catch {
    /* fall through to redirect URL */
  }
  return scryfallNamedImageUrl(trimmed, true);
}

export async function resolveProfessorBrewCardImageMap(
  cardNames: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(cardNames.map((n) => n.trim()).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (name) => [name, await resolveProfessorBrewCardImageUrl(name)] as const),
  );
  return Object.fromEntries(entries);
}
