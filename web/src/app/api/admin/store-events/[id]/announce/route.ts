import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { sendEventAnnouncementEmail } from "@/lib/store-calendar/event-email";
import { DEFAULT_CALENDAR_SETTINGS } from "@/lib/store-calendar/types";

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

    const settings = await dataStore.getSettings(scope.storeId);
    const body = (await request.json()) as Record<string, unknown>;
    const customMessage =
      body.message != null ? String(body.message) : undefined;

    const customers = await dataStore.getCustomers(scope.storeId);
    const recipients = customers.filter(
      (c) => c.email?.trim() && c.isGuest !== true,
    );

    if (recipients.length === 0) {
      return jsonError("No customers with email on file for this store", 400);
    }

    const timeZone =
      settings.calendarSettings?.timezone ?? DEFAULT_CALENDAR_SETTINGS.timezone;

    let sent = 0;
    let failed = 0;
    for (const customer of recipients) {
      const ok = await sendEventAnnouncementEmail(
        customer.email,
        customer.firstName,
        event,
        settings.storeName,
        settings.storeSlug,
        customMessage,
        timeZone,
      );
      if (ok) sent += 1;
      else failed += 1;
    }

    await dataStore.logAdminAction({
      action: "announce_store_event",
      eventId: id,
      recipientCount: recipients.length,
      sent,
      failed,
    });

    return jsonOk({ sent, failed, total: recipients.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
