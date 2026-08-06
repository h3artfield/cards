import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { getCustomerSession } from "@/lib/auth/customer-auth";
import { registerEventSignup } from "@/lib/store-calendar/register-signup";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; eventId: string }> },
) {
  try {
    const { slug, eventId } = await context.params;
    const store = await dataStore.getStoreBySlug(slug);
    if (!store) {
      return jsonError("Store not found", 404);
    }

    const calendar = store.calendarSettings;
    if (calendar?.enabled === false || calendar?.published !== true) {
      return jsonError("Calendar not available", 404);
    }

    const event = await dataStore.getStoreEvent(eventId);
    if (!event || event.storeId !== store.id) {
      return jsonError("Event not found", 404);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const session = getCustomerSession(request);

    const timeZone =
      calendar?.timezone ?? DEFAULT_CALENDAR_SETTINGS.timezone;

    const result = await registerEventSignup(
      store.id,
      store.storeName,
      store.storeSlug,
      event,
      {
        firstName: String(body.firstName ?? body.first_name ?? ""),
        lastName: String(body.lastName ?? body.last_name ?? ""),
        email: String(body.email ?? session?.email ?? ""),
        phone: body.phone != null ? String(body.phone) : undefined,
        customerId: session?.customerId,
      },
      timeZone,
    );

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonOk(
      {
        signup: {
          id: result.signup.id,
          firstName: result.signup.firstName,
          lastName: result.signup.lastName,
          email: result.signup.email,
        },
        spotsRemaining: result.spotsRemaining,
      },
      201,
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
