import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { invalidateStoreInventoryCache } from "@/lib/deck-builder/store-inventory-cache";
import { applyShelfRowEdit, type ShelfRowEdit } from "@/lib/inventory/shelf-row-edit";
import { dataStore } from "@/lib/storage/data-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const { itemId } = await params;
    const item = await dataStore.getInventoryItem(itemId);
    if (!item || item.storeId !== scope.storeId) return jsonError("Item not found", 404);

    const body = (await req.json().catch(() => null)) as ShelfRowEdit | null;
    if (!body || typeof body !== "object") return jsonError("Nothing to save");

    const edit: ShelfRowEdit = {};
    if ("displayName" in body) edit.displayName = String(body.displayName ?? "");
    if ("condition" in body) edit.condition = String(body.condition ?? "");
    if ("listPrice" in body) edit.listPrice = Number(body.listPrice);
    if ("quantity" in body) edit.quantity = Number(body.quantity);
    if ("onlineQuantity" in body) edit.onlineQuantity = Number(body.onlineQuantity);
    if ("shelfLocation" in body) edit.shelfLocation = String(body.shelfLocation ?? "");
    if ("staffNote" in body) edit.staffNote = String(body.staffNote ?? "");
    if (Object.values(edit).every((v) => v == null)) {
      return jsonError("Nothing to save");
    }

    const result = applyShelfRowEdit(item, edit);
    if (!result.ok) return jsonError(result.error);

    await dataStore.saveInventoryItem(result.item);
    invalidateStoreInventoryCache(scope.storeId);
    return jsonOk({ item: result.item });
  } catch (err) {
    return handleRouteError(err);
  }
}
