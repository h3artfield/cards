import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import {
  buildCatalogMatchQueue,
  type CatalogMatchQueueReason,
} from "@/lib/deck-builder/catalog-match-queue";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "@/lib/inventory/status";
import { dataStore } from "@/lib/storage/data-store";

const QUEUE_REASONS = new Set<CatalogMatchQueueReason>([
  "unresolved",
  "fuzzy_match",
  "missing_printing_id",
  "conflict",
  "pending_enrichment",
]);

function parseReasons(raw: string | null): CatalogMatchQueueReason[] | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is CatalogMatchQueueReason =>
      QUEUE_REASONS.has(value as CatalogMatchQueueReason),
    );
  return parsed.length > 0 ? parsed : undefined;
}

/** Paginated catalog match review queue (unresolved, fuzzy, conflicts). */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const params = req.nextUrl.searchParams;
    const limit = Math.min(500, Math.max(1, Number(params.get("limit") ?? 100)));
    const offset = Math.max(0, Number(params.get("offset") ?? 0));
    const reasons = parseReasons(params.get("reasons"));

    const items = (await dataStore.getInventory(scope.storeId)).filter(
      (i) =>
        isCatalogImportItem(i) &&
        isInventoryAvailable(i) &&
        inventoryEffectiveQuantity(i) > 0,
    );

    const queue = buildCatalogMatchQueue(items, { reasons, limit, offset });

    return jsonOk({
      ...queue,
      limit,
      offset,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
