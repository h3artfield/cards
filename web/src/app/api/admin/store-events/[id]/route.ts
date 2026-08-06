import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { normalizeStoreEventInput } from "@/lib/store-calendar/normalize";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const { id } = await context.params;
    const existing = await dataStore.getStoreEvent(id);
    if (!existing || existing.storeId !== scope.storeId) {
      return jsonError("Event not found", 404);
    }
    const body = (await request.json()) as Record<string, unknown>;
    const normalized = normalizeStoreEventInput(
      { ...existing, ...body },
      {
        storeId: scope.storeId,
        id,
        createdAt: existing.createdAt,
      },
    );
    const event = await dataStore.saveStoreEvent(normalized);
    await dataStore.logAdminAction({ action: "update_store_event", eventId: id });
    return jsonOk({ event });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const { id } = await context.params;
    const existing = await dataStore.getStoreEvent(id);
    if (!existing || existing.storeId !== scope.storeId) {
      return jsonError("Event not found", 404);
    }
    await dataStore.deleteStoreEvent(id);
    await dataStore.logAdminAction({ action: "delete_store_event", eventId: id });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
