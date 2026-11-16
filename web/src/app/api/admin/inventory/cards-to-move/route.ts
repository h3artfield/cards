import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { listCardsToMove } from "@/lib/inventory/cards-to-move";
import { dataStore } from "@/lib/storage/data-store";

export type { CardToMoveV1 } from "@/lib/inventory/cards-to-move";

/** Cards whose price now puts them in a different cabinet, binder or bulk. */
export async function GET(req: NextRequest) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  try {
    const items = await dataStore.getInventory(scope.storeId);
    return jsonOk({ cards: listCardsToMove(items) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `{ ids, action: "moved" }` records the card at its new location;
 * `{ ids, action: "keep" }` leaves it where it is and stops suggesting that spot.
 */
export async function POST(req: NextRequest) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; action?: unknown };
    if (body.action !== "moved" && body.action !== "keep") return jsonError("action must be moved or keep", 400);
    if (!Array.isArray(body.ids)) return jsonError("Send ids", 400);
    const ids = new Set(body.ids.filter((x): x is string => typeof x === "string").slice(0, 500));
    const items = (await dataStore.getInventory(scope.storeId)).filter((i) => ids.has(i.id) && i.suggestedLocation);
    const now = new Date().toISOString();
    for (const item of items) {
      await dataStore.saveInventoryItem({
        ...item,
        ...(body.action === "moved"
          ? {
              shelfLocation: item.suggestedLocation,
              keptLocationFor: "",
              changeLog: [
                ...(item.changeLog ?? []),
                { at: now, field: "location" as const, from: item.shelfLocation ?? "", to: item.suggestedLocation! },
              ].slice(-30),
            }
          : { keptLocationFor: item.suggestedLocation }),
        suggestedLocation: "",
        suggestedLocationAt: "",
      });
    }
    return jsonOk({ updated: items.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
