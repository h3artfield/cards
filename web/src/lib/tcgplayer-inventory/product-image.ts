import { tcgplayerProductImageUrl } from "../card-flow-v2/tcgplayer-japan-catalog";

/** Standard TCGplayer CDN image for catalog product id (used on import + listing). */
export function resolveTcgplayerProductImageUrl(productId: string): string {
  const id = productId.trim();
  return tcgplayerProductImageUrl(id);
}
