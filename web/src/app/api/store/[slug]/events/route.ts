import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { monthRangeIso } from "@/lib/store-calendar/date-utils";
import { resolveStoreEventCategories } from "@/lib/store-calendar/categories";
import { toPublicStoreEvent } from "@/lib/store-calendar/signup-utils";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const store = await dataStore.getStoreBySlug(slug);
    if (!store) {
      return jsonError("Store not found", 404);
    }
    const settings = await dataStore.getSettings(store.id);
    const calendar = settings.calendarSettings;
    if (calendar?.enabled === false || calendar?.published !== true) {
      return jsonOk({ events: [], calendarSettings: calendar ?? null, published: false });
    }

    const month = request.nextUrl.searchParams.get("month");
    const embed = request.nextUrl.searchParams.get("embed") === "1";
    if (embed && calendar?.embedEnabled === false) {
      return jsonOk({
        events: [],
        calendarSettings: calendar,
        published: false,
        embedDisabled: true,
      });
    }
    const range = month ? monthRangeIso(month) : null;
    const events = await dataStore.listStoreEvents(store.id, {
      from: range?.from,
      to: range?.to,
      publishedOnly: true,
    });

    const publicEvents = await Promise.all(
      events.map(async (event) => {
        const signupCount = await dataStore.countEventSignups(event.id);
        return toPublicStoreEvent(event, signupCount);
      }),
    );

    return jsonOk({
      events: publicEvents,
      categories: resolveStoreEventCategories(calendar?.customCategories),
      calendarSettings: calendar,
      published: true,
      storeName: store.storeName,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
