import { normalizeScryfallCollectorNumber } from "../processing/scryfall-client";
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

const GENERIC_SET_WORDS = new Set([
  "promo",
  "promos",
  "pack",
  "packs",
  "prerelease",
  "commander",
  "cards",
  "card",
  "edition",
  "set",
  "the",
  "and",
  "for",
]);

function specificSetWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !GENERIC_SET_WORDS.has(word));
}

/** "Prerelease Cards" is not "Kamigawa: Neon Dynasty Promos". */
export function setNamesLookLikeSamePrinting(
  inventorySet: string,
  catalogSet: string,
): boolean {
  const inventoryWords = specificSetWords(inventorySet);
  const catalogWords = specificSetWords(catalogSet);
  if (!inventoryWords.length || !catalogWords.length) return false;
  const catalogWordSet = new Set(catalogWords);
  const hits = inventoryWords.filter((word) => catalogWordSet.has(word)).length;
  const needed = Math.min(inventoryWords.length, catalogWords.length, 2);
  return hits >= needed;
}

/**
 * CSV "240" and Scryfall "240p" are the same printed number.
 * "240" and "391" are not, even when both cards share a name.
 */
export function collectorNumbersAgree(
  inventoryNumber?: string,
  catalogNumber?: string,
): boolean {
  const inventory = inventoryNumber?.trim();
  const catalog = catalogNumber?.trim();
  if (!inventory || !catalog) return true;
  const inventoryStem = normalizeScryfallCollectorNumber(inventory);
  const catalogStem = normalizeScryfallCollectorNumber(catalog);
  if (!inventoryStem || !catalogStem) {
    return inventory.toLowerCase() === catalog.toLowerCase();
  }
  return inventoryStem === catalogStem;
}

/**
 * The linked Scryfall card is this shelf row's printing, not just the same name.
 * A shared name match was putting one scan on the promo and the prerelease.
 */
export function catalogPrintingMatchesInventoryItem(
  item: InventoryItem,
  catalog?: CatalogCard | null,
): boolean {
  if (!catalog || !catalogMatchesInventoryItem(item, catalog)) return false;
  if (!collectorNumbersAgree(item.cardNumber, catalog.collectorNumber)) return false;
  const productId = item.tcgplayerProductId?.trim();
  const catalogProductId = catalog.tcgplayerId?.trim();
  if (productId && catalogProductId) return productId === catalogProductId;
  if (item.setName?.trim() && catalog.setName?.trim()) {
    return setNamesLookLikeSamePrinting(item.setName, catalog.setName);
  }
  return true;
}

function inventoryNameMatchesCatalogFace(item: InventoryItem, catalogName: string): boolean {
  const invName = normalizeInventoryCardName(cardNameFromInventoryItem(item));
  const catName = normalizeInventoryCardName(catalogName);
  if (!invName || !catName) return true;
  if (invName === catName) return true;
  const shorter = invName.length <= catName.length ? invName : catName;
  const longer = invName.length <= catName.length ? catName : invName;
  if (shorter.length < 8) return false;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.55;
}

/** Reject a linked catalog card when none of its faces is this shelf row. */
export function catalogMatchesInventoryItem(
  item: InventoryItem,
  catalog?: CatalogCard | null,
): boolean {
  if (!catalog?.name) return true;
  const faces = catalog.name
    .split("//")
    .map((face) => face.trim())
    .filter(Boolean);
  if (!faces.length) return true;
  return faces.some((face) => inventoryNameMatchesCatalogFace(item, face));
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
  const samePrinting = catalogPrintingMatchesInventoryItem(item, catalog);
  const numberAgrees = collectorNumbersAgree(item.cardNumber, catalog?.collectorNumber);
  const nameMatches = catalogMatchesInventoryItem(item, catalog);
  const cached = trustedFirebaseImageUrl(item);
  // Number 203 on a Prerelease row is not Alpha's 203. A saved scan of a
  // different card is resolved again from the shelf name.
  if (cached && numberAgrees && nameMatches) {
    try {
      const res = await fetch(cached, {
        signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && contentType.startsWith("image/")) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length >= 100) {
          return { buffer, contentType, source: "firebase" };
        }
      }
    } catch {
      /* The stored file is missing. Resolve the printing again. */
    }
  }

  if (
    catalog?.imageNormal &&
    isEnrichableMagicSingle(item) &&
    samePrinting
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
  return `/api/store/${encodeURIComponent(slug)}/inventory/image?itemId=${encodeURIComponent(inventoryItemId)}&v=23`;
}

/** Short label for clerk / search context. */
export function inventoryCardLabel(item: InventoryItem): string {
  return cardNameFromInventoryItem(item);
}

export { hasTrustedFirebaseImageCache, trustedFirebaseImageUrl };
