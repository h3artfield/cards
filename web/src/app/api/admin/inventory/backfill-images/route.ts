import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { backfillInventoryImagesRun } from "@/lib/inventory/image-backfill";
import { isCatalogImportItem } from "@/lib/inventory/status";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as {
      batchSize?: number;
      budgetMs?: number;
    };
    const batchSize = Math.min(25, Math.max(5, body.batchSize ?? 15));
    /** Stay under ~60s CDN/proxy limits — long runs return non-JSON "upstream timeout". */
    const budgetMs = Math.min(55_000, Math.max(15_000, body.budgetMs ?? 50_000));

    const all = await dataStore.getInventory(scope.storeId);
    const catalog = all.filter(
      (i) => isCatalogImportItem(i) && i.status !== "sold",
    );
    const crosswalks = await deckBuilderStore.listCrosswalks(scope.storeId);
    const crosswalkByItemId = new Map(
      crosswalks.map((cw) => [cw.inventoryItemId, cw]),
    );

    const run = await backfillInventoryImagesRun({
      storeId: scope.storeId,
      items: catalog,
      batchSize,
      budgetMs,
      crosswalkByItemId,
    });

    for (const item of run.updatedItems) {
      await dataStore.saveInventoryItem(item);
    }

    return jsonOk({
      batch: {
        cached: run.cached,
        failed: run.failed,
        remaining: run.remaining,
        processed: run.processed,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}