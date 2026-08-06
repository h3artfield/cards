import { tcgplayerCdnImageCandidates } from "../tcgplayer-inventory/cdn-image-fetch";
import {
  cardNameFromInventoryItem,
  fetchInventoryImageBuffer,
} from "./image-fallback";
import {
  isFirebaseStorageUrl,
  isTcgplayerCdnUrl,
} from "./image-url";
import type { CatalogCard } from "../deck-builder/types";
import type { InventoryItem } from "../types";

/** Per-fetch timeout when resolving inventory card images (ms). */
export const INVENTORY_IMAGE_FETCH_TIMEOUT_MS = Number(
  process.env.INVENTORY_IMAGE_FETCH_TIMEOUT_MS ?? 25_000,
);

export type ImageResolveSource =
  | "firebase"
  | "catalog"
  | "fallback";

export type ResolvedInventoryImage = {
  buffer: Buffer;
  contentType: string;
  source: ImageResolveSource;
  tcgLowPrice?: number;
};

/** Normalize card names for catalog ↔ inventory comparison. */
function normalizeInventoryCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s—\s.*$/u, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

/** Reject Firebase cache when linked catalog name doesn't match the inventory row. */
export function catalogMatchesInventoryItem(
  item: InventoryItem,
  catalog?: CatalogCard | null,
): boolean {
  if (!catalog?.name) return true;
  const invName = normalizeInventoryCardName(cardNameFromInventoryItem(item));
  const catName = normalizeInventoryCardName(catalog.name);
  if (!invName || !catName) return true;
  return invName === catName || invName.includes(catName) || catName.includes(invName);
}

/** Best display URL without network — prefer cached Firebase, then catalog, then TCG CDN. */
export function pickInventoryDisplayImageUrl(
  item: InventoryItem,
  catalog?: CatalogCard | null,
): string | undefined {
  if (
    isFirebaseStorageUrl(item.frontImageUrl) &&
    catalogMatchesInventoryItem(item, catalog)
  ) {
    return item.frontImageUrl!.trim();
  }

  if (catalog?.imageNormal) return catalog.imageNormal;

  if (item.tcgplayerProductId) {
    const candidates = tcgplayerCdnImageCandidates(item.tcgplayerProductId);
    return candidates[0];
  }

  if (item.frontImageUrl?.trim() && !isTcgplayerCdnUrl(item.frontImageUrl)) {
    return item.frontImageUrl.trim();
  }

  return undefined;
}

export function inventoryImageSrc(input: {
  item: InventoryItem;
  storeSlug?: string;
  catalogImageUrl?: string;
  catalogName?: string;
}): string | undefined {
  const catalogCard =
    input.catalogName != null
      ? ({ name: input.catalogName } as CatalogCard)
      : null;
  if (
    isFirebaseStorageUrl(input.item.frontImageUrl) &&
    catalogMatchesInventoryItem(input.item, catalogCard)
  ) {
    return input.item.frontImageUrl;
  }
  if (input.catalogImageUrl) return input.catalogImageUrl;
  if (input.storeSlug) {
    return inventoryImageProxyPath(input.storeSlug, input.item.id);
  }
  return pickInventoryDisplayImageUrl(input.item);
}

export async function resolveInventoryImageBuffer(
  item: InventoryItem,
  catalog?: CatalogCard | null,
): Promise<ResolvedInventoryImage> {
  const direct = pickInventoryDisplayImageUrl(item, catalog);
  if (direct && isFirebaseStorageUrl(direct) && catalogMatchesInventoryItem(item, catalog)) {
    const res = await fetch(direct, {
      signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("Cached image unavailable");
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "image/jpeg",
      source: "firebase",
    };
  }

  if (catalog?.imageNormal) {
    try {
      const res = await fetch(catalog.imageNormal, {
        signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "CardScanner/1.0" },
      });
      if (res.ok) {
        return {
          buffer: Buffer.from(await res.arrayBuffer()),
          contentType: res.headers.get("content-type") ?? "image/jpeg",
          source: "catalog",
        };
      }
    } catch {
      /* fall through */
    }
  }

  const fetched = await fetchInventoryImageBuffer(
    item,
    direct ?? item.frontImageUrl ?? "",
  );
  return {
    buffer: fetched.buffer,
    contentType: fetched.contentType,
    source: "fallback",
    tcgLowPrice: fetched.tcgLowPrice,
  };
}

export function inventoryImageProxyPath(
  slug: string,
  inventoryItemId: string,
): string {
  return `/api/store/${encodeURIComponent(slug)}/inventory/image?itemId=${encodeURIComponent(inventoryItemId)}`;
}

/** Short label for clerk / search context. */
export function inventoryCardLabel(item: InventoryItem): string {
  return cardNameFromInventoryItem(item);
}
