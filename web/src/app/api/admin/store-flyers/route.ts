import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import {
  findGalleryFlyer,
  removeGalleryFlyer,
} from "@/lib/store-calendar/display-gallery";
import { listStoreFlyersForDisplay } from "@/lib/store-calendar/list-store-flyers";
import {
  parseFlyerOrientation,
  withoutEventFlyer,
} from "@/lib/store-calendar/flyer-orientation";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";

export async function GET(request: NextRequest) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const orientation = parseFlyerOrientation(
      request.nextUrl.searchParams.get("orientation"),
    );

    const settings = await dataStore.getSettings(scope.storeId);
    const calendar = settings.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS;
    const events = await dataStore.listStoreEvents(scope.storeId);
    const timeZone = calendar.timezone ?? DEFAULT_CALENDAR_SETTINGS.timezone;

    const flyers = listStoreFlyersForDisplay(events, {
      timeZone,
      orientation,
      gallery: calendar.displayGallery,
    });

    return jsonOk({
      flyers,
      storeName: settings.storeName,
      storeSlug: settings.storeSlug,
      orientation,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const params = request.nextUrl.searchParams;
    const source = String(params.get("source") ?? "").trim().toLowerCase();
    const orientation = parseFlyerOrientation(params.get("orientation"));

    if (source === "gallery") {
      const id = String(params.get("id") ?? "").trim();
      if (!id) {
        return jsonError("Gallery flyer id is required", 400);
      }

      const settings = await dataStore.getSettings(scope.storeId);
      const calendar = settings.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS;
      const existing = findGalleryFlyer(calendar, id);
      if (!existing) {
        return jsonError("Gallery flyer not found", 404);
      }

      await dataStore.saveSettings({
        ...settings,
        calendarSettings: removeGalleryFlyer(calendar, id),
      });

      await dataStore.logAdminAction({
        action: "remove_display_gallery_flyer",
        flyerId: id,
        orientation: existing.orientation,
      });

      return jsonOk({ removed: true, id, source: "gallery" });
    }

    if (source === "event") {
      const eventId = String(params.get("eventId") ?? params.get("id") ?? "").trim();
      if (!eventId) {
        return jsonError("Event id is required", 400);
      }

      const event = await dataStore.getStoreEvent(eventId);
      if (!event || event.storeId !== scope.storeId) {
        return jsonError("Event not found", 404);
      }

      const updatedEvent = withoutEventFlyer(
        {
          ...event,
          updatedAt: new Date().toISOString(),
        },
        orientation,
      );
      await dataStore.saveStoreEvent(updatedEvent);

      await dataStore.logAdminAction({
        action: "remove_event_flyer",
        eventId,
        orientation,
      });

      return jsonOk({ removed: true, eventId, source: "event", orientation });
    }

    return jsonError("Invalid source — use gallery or event", 400);
  } catch (err) {
    return handleRouteError(err);
  }
}
