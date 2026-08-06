import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { isInventoryAvailable, isInventorySold } from "@/lib/shopify/inventory-status";
import { isBuybackInventoryItem } from "@/lib/inventory/status";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const statusParam = req.nextUrl.searchParams.get("status");
    const allItems = await dataStore.getInventory(scope.storeId);

    let items = allItems;
    if (statusParam === "on_hand") {
      items = allItems.filter((i) => isInventoryAvailable(i));
    } else if (statusParam === "sold") {
      items = allItems.filter((i) => isInventorySold(i));
    }

    const cards = (
      await Promise.all(
        items
          .filter((item) => isBuybackInventoryItem(item) && item.cardId)
          .map((item) => dataStore.getCard(item.cardId!)),
      )
    ).filter((c): c is NonNullable<typeof c> => c != null);

    return jsonOk({ items, cards, total: allItems.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
