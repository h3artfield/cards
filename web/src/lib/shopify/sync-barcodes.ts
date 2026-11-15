import { cardLinkBaseUrlV1 } from "../inventory/card-link-base";
import { cardLinkUrlV1 } from "../inventory/card-link-key";
import type { InventoryItem } from "../types";
import {
  formatShopifyApiErrorMessage,
  getShopifyVariantBarcodes,
  updateShopifyVariantBarcode,
} from "./client";
import { hasShopifyListing } from "./inventory-listing";

export type BarcodeSyncOutcome = {
  inventoryItemId: string;
  displayName: string;
  from?: string;
  to?: string;
  error?: string;
};

export type BarcodeSyncSummary = {
  /** Listings on Shopify for this store, across all runs. */
  listed: number;
  checked: number;
  /** Apply: barcodes written. Preview: barcodes that would be written. */
  needsUpdate: number;
  updated: number;
  alreadyCorrect: number;
  /** Rows with no card link key; nothing to point the barcode at. */
  noCardLink: number;
  failed: number;
  /** Index into the sorted listing set where the next run should resume. */
  nextCursor: number | null;
  outcomes: BarcodeSyncOutcome[];
};

const READ_CHUNK = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withThrottleRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (attempt >= 3 || !/throttl/i.test(message)) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
}

export function listedItemsForBarcodeSync(items: InventoryItem[]): InventoryItem[] {
  return items
    .filter((i) => hasShopifyListing(i) && Boolean(i.shopifyListing?.variantId))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Point every Shopify variant barcode at the item's card link, so a QR label
 * scanned at the register finds the product. Resumable: callers pass back
 * nextCursor until it comes back null.
 */
export async function syncShopifyBarcodes(input: {
  items: InventoryItem[];
  shopDomain: string;
  accessToken: string;
  storeSlug: string;
  apply: boolean;
  cursor: number;
  /** Listings examined per run, bounding Shopify calls per request. */
  limit: number;
  deadlineMs: number;
}): Promise<BarcodeSyncSummary> {
  const listed = listedItemsForBarcodeSync(input.items);
  const summary: BarcodeSyncSummary = {
    listed: listed.length,
    checked: 0,
    needsUpdate: 0,
    updated: 0,
    alreadyCorrect: 0,
    noCardLink: 0,
    failed: 0,
    nextCursor: null,
    outcomes: [],
  };

  const baseUrl = cardLinkBaseUrlV1();
  const start = Math.max(0, Math.trunc(input.cursor));
  const end = Math.min(listed.length, start + input.limit);
  let index = start;

  while (index < end) {
    if (Date.now() > input.deadlineMs) break;
    const chunk = listed.slice(index, Math.min(end, index + READ_CHUNK));

    let current: Map<string, string>;
    try {
      current = await withThrottleRetry(() =>
        getShopifyVariantBarcodes({
          shopDomain: input.shopDomain,
          accessToken: input.accessToken,
          variantIds: chunk.map((i) => i.shopifyListing!.variantId),
        }),
      );
    } catch (err) {
      const message = formatShopifyApiErrorMessage(err);
      for (const item of chunk) {
        summary.checked += 1;
        summary.failed += 1;
        summary.outcomes.push({
          inventoryItemId: item.id,
          displayName: item.displayName,
          error: message,
        });
      }
      index += chunk.length;
      continue;
    }

    for (const item of chunk) {
      const listing = item.shopifyListing!;
      summary.checked += 1;
      index += 1;

      if (!item.cardLinkKey) {
        summary.noCardLink += 1;
        continue;
      }
      const target = cardLinkUrlV1(baseUrl, input.storeSlug, item.cardLinkKey);
      const existing = current.get(listing.variantId);
      if (existing === undefined) {
        summary.failed += 1;
        summary.outcomes.push({
          inventoryItemId: item.id,
          displayName: item.displayName,
          error: "Listing not found on Shopify (deleted there?)",
        });
        continue;
      }
      if (existing === target) {
        summary.alreadyCorrect += 1;
        continue;
      }

      summary.needsUpdate += 1;
      const outcome: BarcodeSyncOutcome = {
        inventoryItemId: item.id,
        displayName: item.displayName,
        from: existing,
        to: target,
      };
      if (input.apply) {
        try {
          await withThrottleRetry(() =>
            updateShopifyVariantBarcode({
              shopDomain: input.shopDomain,
              accessToken: input.accessToken,
              productId: listing.productId,
              variantId: listing.variantId,
              barcode: target,
            }),
          );
          summary.updated += 1;
        } catch (err) {
          summary.failed += 1;
          outcome.error = formatShopifyApiErrorMessage(err);
        }
      }
      summary.outcomes.push(outcome);
    }
  }

  summary.nextCursor = index < listed.length ? index : null;
  return summary;
}
