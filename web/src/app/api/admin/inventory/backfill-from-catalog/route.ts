import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { isCatalogImportItem } from "@/lib/inventory/status";
import {
  persistResolvedInventoryImage,
} from "@/lib/inventory/persist-inventory-image";
import { resolveInventoryImageBuffer } from "@/lib/inventory/resolve-display-image";
import { isFirebaseStorageUrl } from "@/lib/inventory/image-url";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

/** Backfill inventory images from catalogCards crosswalk (Scryfall art already in DB). */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.min(30, Math.max(1, body.limit ?? 20));

    const crosswalks = await deckBuilderStore.listCrosswalks(scope.storeId);
    const cwByItem = new Map(crosswalks.map((c) => [c.inventoryItemId, c]));

    const items = (await dataStore.getInventory(scope.storeId))
      .filter(
        (i) =>
          isCatalogImportItem(i) &&
          !isFirebaseStorageUrl(i.frontImageUrl) &&
          cwByItem.has(i.id),
      )
      .slice(0, limit);

    let cached = 0;
    let failed = 0;

    for (const item of items) {
      const cw = cwByItem.get(item.id)!;
      const catalog = await deckBuilderStore.getCatalogCard(cw.scryfallId);
      if (!catalog?.imageNormal) {
        failed += 1;
        continue;
      }
      try {
        const resolved = await resolveInventoryImageBuffer(item, catalog);
        await persistResolvedInventoryImage({
          item,
          buffer: resolved.buffer,
          contentType: resolved.contentType,
          source: resolved.source,
        });
        cached += 1;
      } catch {
        failed += 1;
      }
    }

    const remaining = (await dataStore.getInventory(scope.storeId)).filter(
      (i) =>
        isCatalogImportItem(i) &&
        !isFirebaseStorageUrl(i.frontImageUrl) &&
        cwByItem.has(i.id),
    ).length;

    return jsonOk({ cached, failed, processed: items.length, remaining });
  } catch (err) {
    return handleRouteError(err);
  }
}
