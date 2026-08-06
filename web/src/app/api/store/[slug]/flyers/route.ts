import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { listStoreFlyersForDisplay } from "@/lib/store-calendar/list-store-flyers";
import { parseFlyerOrientation } from "@/lib/store-calendar/flyer-orientation";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const orientation = parseFlyerOrientation(
      request.nextUrl.searchParams.get("orientation"),
    );
    const store = await dataStore.getStoreBySlug(slug);
    if (!store) {
      return jsonError("Store not found", 404);
    }

    const settings = await dataStore.getSettings(store.id);
    const calendar = settings.calendarSettings;
    if (calendar?.enabled === false || calendar?.published !== true) {
      return jsonOk({
        flyers: [],
        storeName: settings.storeName,
        published: false,
      });
    }

    const events = await dataStore.listStoreEvents(store.id, {
      publishedOnly: true,
    });
    const timeZone =
      calendar?.timezone ?? DEFAULT_CALENDAR_SETTINGS.timezone;

    const flyers = listStoreFlyersForDisplay(events, {
      timeZone,
      orientation,
      gallery: calendar?.displayGallery,
    }).map(({ id, title, imageUrl, scheduleLabel, mediaType }) => ({
        id,
        title,
        imageUrl,
        scheduleLabel,
        mediaType,
      }),
    );

    return jsonOk({
      flyers,
      storeName: settings.storeName,
      published: true,
      orientation,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
