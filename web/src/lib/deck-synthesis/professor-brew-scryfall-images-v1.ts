/**
 * Client-safe Scryfall image URL helpers for Professor brew UI.
 * Server-side resolution lives in professor-brew-card-images-server-v4-3-v1.ts.
 */

export const PROFESSOR_BREW_SCRYFALL_IMAGES_V1_VERSION = "professor-brew-scryfall-images-v1";

type ScryfallCardImages = {
  image_uris?: { normal?: string; small?: string; large?: string };
  card_faces?: Array<{ image_uris?: { normal?: string; small?: string; large?: string } }>;
};

/** Direct Scryfall image redirect — works for single-face cards only. */
export function scryfallNamedImageUrl(cardName: string, fuzzy = false): string {
  const param = fuzzy ? "fuzzy" : "exact";
  return `https://api.scryfall.com/cards/named?${param}=${encodeURIComponent(cardName)}&format=image&version=normal`;
}

/** Art crop only — no card frame or oracle text. */
export function scryfallNamedArtCropUrl(cardName: string, fuzzy = false): string {
  const param = fuzzy ? "fuzzy" : "exact";
  return `https://api.scryfall.com/cards/named?${param}=${encodeURIComponent(cardName)}&format=image&version=art_crop`;
}

export function isScryfallRedirectImageUrl(url: string): boolean {
  return url.includes("api.scryfall.com/cards/named") && url.includes("format=image");
}

export function pickScryfallCardImageUrl(card: ScryfallCardImages): string | null {
  const direct =
    card.image_uris?.normal ?? card.image_uris?.large ?? card.image_uris?.small ?? null;
  if (direct) return direct;

  for (const face of card.card_faces ?? []) {
    const picked = face.image_uris?.normal ?? face.image_uris?.large ?? face.image_uris?.small ?? null;
    if (picked) return picked;
  }

  return null;
}
