import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { resolveStoreEventCategories } from "@/lib/store-calendar/categories";
import {
  buildStoredEventFlyer,
  editEventFlyerImage,
  generateEventFlyerImage,
} from "@/lib/store-calendar/event-flyer";
import { findEventListGroup } from "@/lib/store-calendar/event-list-groups";
import {
  getEventFlyer,
  parseFlyerOrientation,
  withEventFlyer,
} from "@/lib/store-calendar/flyer-orientation";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";
import { persistEventFlyerImage } from "@/lib/storage/event-flyer-image";

function flyerContext(
  storeId: string,
  eventId: string,
  settings: Awaited<ReturnType<typeof dataStore.getSettings>>,
  allEvents: Awaited<ReturnType<typeof dataStore.listStoreEvents>>,
  orientation: ReturnType<typeof parseFlyerOrientation>,
) {
  const categories = resolveStoreEventCategories(
    settings.calendarSettings?.customCategories,
  );
  const timeZone =
    settings.calendarSettings?.timezone ?? DEFAULT_CALENDAR_SETTINGS.timezone;

  return {
    events: allEvents,
    eventId,
    storeName: settings.storeName,
    categories,
    timeZone,
    orientation,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const { id } = await context.params;
    const orientation = parseFlyerOrientation(
      request.nextUrl.searchParams.get("orientation"),
    );
    const event = await dataStore.getStoreEvent(id);
    if (!event || event.storeId !== scope.storeId) {
      return jsonError("Event not found", 404);
    }

    const flyer = getEventFlyer(event, orientation);
    if (!flyer) {
      return jsonError(`No ${orientation} flyer saved for this event`, 404);
    }

    return jsonOk({ flyer, orientation });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const { id } = await context.params;
    const event = await dataStore.getStoreEvent(id);
    if (!event || event.storeId !== scope.storeId) {
      return jsonError("Event not found", 404);
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const changePrompt = String(
      body.changePrompt ?? body.change_prompt ?? "",
    ).trim();
    const orientation = parseFlyerOrientation(body.orientation);

    const settings = await dataStore.getSettings(scope.storeId);
    const allEvents = await dataStore.listStoreEvents(scope.storeId);
    const ctx = flyerContext(scope.storeId, id, settings, allEvents, orientation);
    const group = findEventListGroup(allEvents, id, { timeZone: ctx.timeZone });
    const existingFlyer = getEventFlyer(event, orientation);

    let result;
    let mode: "create" | "edit" | "recreate";

    if (changePrompt && existingFlyer?.imageUrl) {
      mode = "edit";
      result = await editEventFlyerImage({
        context: ctx,
        sourceImageUrl: existingFlyer.imageUrl,
        changePrompt,
        originalPrompt: existingFlyer.prompt,
      });
    } else {
      mode = existingFlyer ? "recreate" : "create";
      result = await generateEventFlyerImage(ctx);
    }

    const flyer = buildStoredEventFlyer(result, existingFlyer);
    flyer.imageUrl = await persistEventFlyerImage(
      scope.storeId,
      id,
      flyer.imageUrl,
      orientation,
    );

    const updatedEvent = withEventFlyer(
      {
        ...event,
        updatedAt: new Date().toISOString(),
      },
      orientation,
      flyer,
    );
    await dataStore.saveStoreEvent(updatedEvent);

    await dataStore.logAdminAction({
      action: "generate_event_flyer",
      eventId: id,
      seriesKey: group?.key,
      repeating: group?.isRepeating ?? false,
      mode,
      orientation,
    });

    return jsonOk({
      ...result,
      imageUrl: flyer.imageUrl,
      flyer,
      orientation,
      eventId: id,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("OpenAI")) {
        return jsonError(err.message, 502);
      }
      if (err.message.includes("not found")) {
        return jsonError(err.message, 404);
      }
    }
    return handleRouteError(err);
  }
}
