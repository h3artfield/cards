import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { getScryfallBulkIndex, type ScryfallBulkIndex } from "@/lib/deck-builder/scryfall-bulk-index";
import { cardLabelFromItemV1 } from "@/lib/inventory/card-label";
import { catalogCardForLocationV1 } from "@/lib/inventory/combined-list";
import { shelfLocationV1 } from "@/lib/inventory/shelf-location";
import { cardLinkBaseUrlV1 } from "@/lib/inventory/card-link-base";
import { cardLinkKeyV1, cardLinkUrlV1 } from "@/lib/inventory/card-link-key";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "@/lib/inventory/status";
import { dataStore } from "@/lib/storage/data-store";
import type { InventoryItem } from "@/lib/types";

export const maxDuration = 120;

/**
 * The rules' location from what inventory knows. The shelf price stands in
 * for the market price when there is none: it lands on the same side of the
 * 60¢ and $6 lines.
 */
function ruledLocationForItemV1(item: InventoryItem, catalog: ScryfallBulkIndex | null): string | null {
  const card = catalogCardForLocationV1(
    catalog,
    item.tcgplayerProductId ?? "",
    item.productName ?? item.displayName,
    item.setName ?? "",
  );
  return shelfLocationV1({
    productLine: item.productLine ?? "",
    market: item.tcgMarketPrice ?? item.listPrice ?? null,
    colors: card ? card.colors : item.catalogColors,
    colorIdentity: card ? card.colorIdentity : item.catalogColorIdentity,
    typeLine: card?.typeLine ?? item.catalogTypeLine,
  });
}

/**
 * Label data for QR stickers: `{ latest: true }` for only the copies the most
 * recent import added, `{ ids }` for chosen rows, `{ since }` for everything
 * imported since an ISO time, or `{ all: true }` for every card in stock. Rows without a
 * link key yet get one saved so the printed QR never changes.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as {
      latest?: unknown;
      ids?: unknown;
      since?: unknown;
      all?: unknown;
      inStoreOnly?: unknown;
    };
    const inStoreOnly = body.inStoreOnly === true;
    const store = await dataStore.getStore(scope.storeId);
    if (!store) return jsonError("Store not found", 404);

    const inventory = (await dataStore.getInventory(scope.storeId)).filter(
      (i) => isCatalogImportItem(i) && isInventoryAvailable(i),
    );
    let items: InventoryItem[];
    let latestBatchAt: string | null = null;
    if (body.latest === true) {
      latestBatchAt = inventory.reduce<string | null>(
        (max, i) => (i.lastImportBatchAt && (!max || i.lastImportBatchAt > max) ? i.lastImportBatchAt : max),
        null,
      );
      items = latestBatchAt ? inventory.filter((i) => i.lastImportBatchAt === latestBatchAt) : [];
    } else if (Array.isArray(body.ids)) {
      const ids = new Set(body.ids.filter((x): x is string => typeof x === "string"));
      items = inventory.filter((i) => ids.has(i.id));
    } else if (typeof body.since === "string" && body.since) {
      const since = body.since;
      items = inventory.filter((i) => (i.lastTcgplayerImportAt ?? "") >= since);
    } else if (body.all === true) {
      items = inventory.filter((i) => (i.quantityOnHand ?? i.quantity ?? 0) > 0);
    } else {
      return jsonError("Send ids, since or all", 400);
    }
    if (items.length > 5000) return jsonError("Too many labels at once; narrow the selection", 400);

    const base = cardLinkBaseUrlV1();
    const needCatalog = items.some((i) => !i.shelfLocation?.trim() && /magic/i.test(i.productLine ?? ""));
    const catalog = needCatalog ? await getScryfallBulkIndex().catch(() => null) : null;

    const labels = [];
    let locationsFilled = 0;
    for (let item of items) {
      const patch: Partial<InventoryItem> = {};
      let key = item.cardLinkKey;
      if (!key && item.tcgplayerProductId) {
        key = cardLinkKeyV1(item.tcgplayerProductId, item.tcgplayerCondition ?? "Near Mint") ?? undefined;
        if (key) patch.cardLinkKey = key;
      }
      // A label always says where the card goes; a card imported without one gets it from the rules now.
      if (!item.shelfLocation?.trim()) {
        const location = ruledLocationForItemV1(item, catalog);
        if (location) {
          patch.shelfLocation = location;
          locationsFilled += 1;
        }
      }
      if (Object.keys(patch).length) {
        item = { ...item, ...patch };
        await dataStore.saveInventoryItem(item);
      }
      if (!key) continue;
      const label = cardLabelFromItemV1(item, { url: cardLinkUrlV1(base, store.storeSlug, key) });
      // Lists without an In Store / Online split count every copy as on the shelf.
      if (latestBatchAt) {
        label.copies = Math.min(
          inventoryEffectiveQuantity(item),
          (inStoreOnly ? item.lastImportAddedInStore : item.lastImportAddedQuantity) ?? 0,
        );
      } else if (inStoreOnly && item.quantityInStore != null) {
        label.copies = Math.max(
          0,
          Math.min(Math.trunc(item.quantityInStore), inventoryEffectiveQuantity(item)),
        );
      }
      if (inStoreOnly && label.copies === 0) continue;
      labels.push(label);
    }
    // Printed in shelf order, so each stack of labels goes to one cabinet or binder.
    labels.sort(
      (a, b) =>
        a.location.localeCompare(b.location, undefined, { numeric: true }) ||
        a.setName.localeCompare(b.setName) ||
        a.name.localeCompare(b.name),
    );
    return jsonOk({ labels, skipped: items.length - labels.length, inStoreOnly, locationsFilled, latestBatchAt });
  } catch (err) {
    return handleRouteError(err);
  }
}
