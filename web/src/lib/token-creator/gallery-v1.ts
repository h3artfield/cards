import type { TokenCardV1 } from "./design-v1";
import type { TokenGalleryEntryV1, TokenGalleryStatusV1 } from "./types-v1";

export const TOKEN_GALLERY_MAX_PER_CUSTOMER_V1 = 30;
export const TOKEN_GALLERY_PREVIEW_MAX_BYTES_V1 = 4 * 1024 * 1024;
/** Previews are rendered at screen size, not print size. */
export const TOKEN_GALLERY_PREVIEW_MAX_PX_V1 = { width: 900, height: 1260 };

/** What a gallery entry shares: the design without anything pointing at the author's files. */
export function galleryCardV1(card: TokenCardV1): TokenCardV1 {
  return {
    ...card,
    panelArt: null,
    symbol: card.symbol?.icon === "upload" ? null : card.symbol ?? null,
  };
}

export type TokenGalleryViewV1 = {
  entryId: string;
  authorName: string;
  title: string;
  card: TokenCardV1;
  prompt: string;
  styleId: string | null;
  blendStyleId: string | null;
  blendWeight: number;
  previewUrl: string;
  status: TokenGalleryStatusV1;
  copies: number;
  mine: boolean;
  createdAt: string;
};

export function galleryImageUrlV1(slug: string, entryId: string): string {
  return `/api/store/${encodeURIComponent(slug)}/tokens/gallery/${encodeURIComponent(entryId)}/image`;
}

export function galleryViewV1(entry: TokenGalleryEntryV1, slug: string, viewerId: string): TokenGalleryViewV1 {
  return {
    entryId: entry.entryId,
    authorName: entry.authorName,
    title: entry.title,
    card: entry.card,
    prompt: entry.prompt,
    styleId: entry.styleId,
    blendStyleId: entry.blendStyleId,
    blendWeight: entry.blendWeight,
    previewUrl: galleryImageUrlV1(slug, entry.entryId),
    status: entry.status,
    copies: entry.copies,
    mine: entry.customerId === viewerId,
    createdAt: entry.createdAt,
  };
}

/** Other customers only ever see approved entries; authors also see their own while they wait. */
export function canSeeGalleryEntryV1(entry: TokenGalleryEntryV1, storeId: string, viewerId: string): boolean {
  if (entry.storeId !== storeId) return false;
  return entry.status === "approved" || entry.customerId === viewerId;
}
