import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { normalizeStoreEventInput } from "@/lib/store-calendar/normalize";
import { createRecurringStoreEvents } from "@/lib/store-calendar/seed-calendar";

export async function GET(request: NextRequest) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const from = request.nextUrl.searchParams.get("from") ?? undefined;
    const to = request.nextUrl.searchParams.get("to") ?? undefined;
    const events = await dataStore.listStoreEvents(scope.storeId, { from, to });
    return jsonOk({ events });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const body = (await request.json()) as Record<string, unknown>;
    if (!String(body.title ?? "").trim() || !body.startAt) {
      return jsonError("title and startAt are required", 400);
    }

    const repeatWeekly =
      body.repeatWeekly === true || body.repeat_weekly === true;

    if (repeatWeekly) {
      const events = await createRecurringStoreEvents(scope.storeId, body);
      await dataStore.logAdminAction({
        action: "create_store_event_series",
        seriesId: events[0]?.seriesId,
        count: events.length,
      });
      return jsonOk({ events, count: events.length }, 201);
    }

    const normalized = normalizeStoreEventInput(body, {
      storeId: scope.storeId,
    });
    const event = await dataStore.saveStoreEvent(normalized);
    await dataStore.logAdminAction({ action: "create_store_event", eventId: event.id });
    return jsonOk({ event }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("repeat")) {
      return jsonError(err.message, 400);
    }
    return handleRouteError(err);
  }
}
