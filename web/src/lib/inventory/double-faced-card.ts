/**
 * Transform and modal cards have a second face. Adventure and split cards
 * print both halves on the front, so they are not flipped.
 */
export function cardHasOtherFace(typeLine?: string): boolean {
  if (!typeLine?.includes(" // ")) return false;
  const [front, back] = typeLine.split(" // ").map((part) => part.trim());
  if (!front || !back) return false;
  if (/\badventure\b/i.test(back)) return false;
  const spell = /^(instant|sorcery)\b/i;
  if (spell.test(front) && spell.test(back)) return false;
  return true;
}

/** Same shelf image, asking for the other face. */
export function inventoryBackFacePath(proxyUrl: string): string {
  if (/[?&]face=back(?:&|$)/.test(proxyUrl)) return proxyUrl;
  return `${proxyUrl}${proxyUrl.includes("?") ? "&" : "?"}face=back`;
}

/** Scryfall stores the other face at the same path with /back/ instead of /front/. */
export function scryfallBackFaceUrl(imageUrl?: string): string | undefined {
  if (!imageUrl?.includes("scryfall.io") || !imageUrl.includes("/front/")) return undefined;
  return imageUrl.replace("/front/", "/back/");
}

/** In-stock cards use the shelf image. Catalog printings use the Scryfall back face. */
export function cardBackImageUrl(card: {
  imageProxyUrl?: string;
  imageUrl?: string;
}): string | undefined {
  if (card.imageProxyUrl) return inventoryBackFacePath(card.imageProxyUrl);
  return scryfallBackFaceUrl(card.imageUrl);
}
