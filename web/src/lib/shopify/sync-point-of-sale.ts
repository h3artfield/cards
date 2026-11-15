import type { InventoryItem } from "../types";
import {
  formatShopifyApiErrorMessage,
  getShopifyProductSaleStates,
  isPointOfSalePublication,
  listShopifyPublications,
  publishShopifyProduct,
  setShopifyProductStatus,
} from "./client";
import { catalogExportQuantity, hasShopifyListing } from "./inventory-listing";
import { isInventorySold } from "../inventory/status";

export type PointOfSaleOutcome = {
  inventoryItemId: string;
  displayName: string;
  addedToPos?: boolean;
  activated?: boolean;
  error?: string;
};

export type PointOfSaleSyncSummary = {
  listed: number;
  checked: number;
  /** Apply: listings changed. Preview: listings that would change. */
  needsUpdate: number;
  updated: number;
  alreadyCorrect: number;
  missingFromPos: number;
  /** In stock but Draft, so POS can't sell them. */
  inStockDraft: number;
  /** Draft in-stock listings left alone because the store default is Draft. */
  draftKept: number;
  failed: number;
  nextCursor: number | null;
  outcomes: PointOfSaleOutcome[];
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

export async function findPointOfSalePublicationId(
  shopDomain: string,
  accessToken: string,
): Promise<string | null> {
  const publications = await listShopifyPublications(shopDomain, accessToken);
  return publications.find((p) => isPointOfSalePublication(p.name))?.id ?? null;
}

/**
 * Put every listing on the Point of Sale channel and, when the store sells
 * in-stock listings as Active, activate in-stock Drafts, so a QR label scanned
 * at the register rings up. Resumable via nextCursor.
 */
export async function syncShopifyPointOfSale(input: {
  items: InventoryItem[];
  shopDomain: string;
  accessToken: string;
  publicationId: string;
  activateInStock: boolean;
  apply: boolean;
  cursor: number;
  limit: number;
  deadlineMs: number;
  onActivated?: (item: InventoryItem) => Promise<void>;
}): Promise<PointOfSaleSyncSummary> {
  const listed = input.items
    .filter(hasShopifyListing)
    .sort((a, b) => a.id.localeCompare(b.id));
  const summary: PointOfSaleSyncSummary = {
    listed: listed.length,
    checked: 0,
    needsUpdate: 0,
    updated: 0,
    alreadyCorrect: 0,
    missingFromPos: 0,
    inStockDraft: 0,
    draftKept: 0,
    failed: 0,
    nextCursor: null,
    outcomes: [],
  };

  const start = Math.max(0, Math.trunc(input.cursor));
  const end = Math.min(listed.length, start + input.limit);
  let index = start;

  while (index < end) {
    if (Date.now() > input.deadlineMs) break;
    const chunk = listed.slice(index, Math.min(end, index + READ_CHUNK));

    let states: Map<string, { status: string; onPublication: boolean }>;
    try {
      states = await withThrottleRetry(() =>
        getShopifyProductSaleStates({
          shopDomain: input.shopDomain,
          accessToken: input.accessToken,
          productIds: chunk.map((i) => i.shopifyListing!.productId),
          publicationId: input.publicationId,
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

      const state = states.get(listing.productId);
      if (!state) {
        summary.failed += 1;
        summary.outcomes.push({
          inventoryItemId: item.id,
          displayName: item.displayName,
          error: "Listing not found on Shopify (deleted there?)",
        });
        continue;
      }

      const inStock = !isInventorySold(item) && catalogExportQuantity(item) > 0;
      const addToPos = !state.onPublication;
      const isDraftInStock = inStock && state.status === "DRAFT";
      if (addToPos) summary.missingFromPos += 1;
      if (isDraftInStock) summary.inStockDraft += 1;
      const activate = isDraftInStock && input.activateInStock;
      if (isDraftInStock && !input.activateInStock) summary.draftKept += 1;

      if (!addToPos && !activate) {
        if (!isDraftInStock) summary.alreadyCorrect += 1;
        continue;
      }

      summary.needsUpdate += 1;
      const outcome: PointOfSaleOutcome = {
        inventoryItemId: item.id,
        displayName: item.displayName,
        addedToPos: addToPos,
        activated: activate,
      };
      if (input.apply) {
        try {
          if (addToPos) {
            const warnings = await withThrottleRetry(() =>
              publishShopifyProduct({
                shopDomain: input.shopDomain,
                accessToken: input.accessToken,
                productId: listing.productId,
                publicationIds: [input.publicationId],
              }),
            );
            if (warnings.length) throw new Error(warnings.join("; "));
          }
          if (activate) {
            await withThrottleRetry(() =>
              setShopifyProductStatus({
                shopDomain: input.shopDomain,
                accessToken: input.accessToken,
                productId: listing.productId,
                status: "ACTIVE",
              }),
            );
            await input.onActivated?.({
              ...item,
              shopifyListing: { ...listing, syncedStatus: "ACTIVE" },
            });
          }
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
