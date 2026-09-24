import { tcgplayerCdnImageCandidates } from "../tcgplayer-inventory/cdn-image-fetch";
import {
  cardNameFromInventoryItem,
  fetchInventoryImageBuffer,
} from "./image-fallback";
import {
  hasTrustedFirebaseImageCache,
  trustedFirebaseImageUrl,
} from "./image-cache-trust";
import { isEnrichableMagicSingle } from "./magic-items";
import {
  isFirebaseStorageUrl,
  isTcgplayerCdnUrl,
} from "./image-url";
import type { CatalogCard } from "../deck-builder/types";
import type { InventoryItem } from "../types";
import { classifyInventoryGame } from "./analytics";

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
  if (invName === catName) return true;
  const shorter = invName.length <= catName.length ? invName : catName;
  const longer = invName.length <= catName.length ? catName : invName;
  if (shorter.length < 8) return false;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.55;
}

/** Best display URL without network — prefer trusted Storage, then Scryfall catalog. */
export function pickInventoryDisplayImageUrl(
  item: InventoryItem,
  catalog?: CatalogCard | null,
): string | undefined {
  const catalogMatch = catalogMatchesInventoryItem(item, catalog);
  const game = classifyInventoryGame(item);

  if (catalogMatch && catalog?.imageNormal) return catalog.imageNormal;

  if (game === "Magic") {
    const cached = trustedFirebaseImageUrl(item);
    if (cached) return cached;

    if (!isEnrichableMagicSingle(item)) {
      if (item.tcgplayerProductId) {
        return tcgplayerCdnImageCandidates(item.tcgplayerProductId)[0];
      }
      if (isTcgplayerCdnUrl(item.frontImageUrl)) {
        return item.frontImageUrl!.trim();
      }
    }
    return undefined;
  }

  const cached = trustedFirebaseImageUrl(item);
  if (cached) return cached;

  return undefined;
}

export function inventoryImageSrc(input: {
  item: InventoryItem;
  storeSlug?: string;
  catalogImageUrl?: string;
  catalogName?: string;
}): string | undefined {
  const cached = trustedFirebaseImageUrl(input.item);
  if (cached) return cached;
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
  const cached = trustedFirebaseImageUrl(item);
  if (cached) {
    const res = await fetch(cached, {
      signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("Cached image unavailable");
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "image/jpeg",
      source: "firebase",
    };
  }

  if (
    catalog?.imageNormal &&
    isEnrichableMagicSingle(item) &&
    catalogMatchesInventoryItem(item, catalog)
  ) {
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
    item.tcgplayerProductId ?? "",
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
  return `/api/store/${encodeURIComponent(slug)}/inventory/image?itemId=${encodeURIComponent(inventoryItemId)}&v=12`;
}

/** Short label for clerk / search context. */
export function inventoryCardLabel(item: InventoryItem): string {
  return cardNameFromInventoryItem(item);
}

export { hasTrustedFirebaseImageCache, trustedFirebaseImageUrl };
