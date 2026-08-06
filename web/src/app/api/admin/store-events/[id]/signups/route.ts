import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { spotsRemaining } from "@/lib/store-calendar/signup-utils";

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
    const event = await dataStore.getStoreEvent(id);
    if (!event || event.storeId !== scope.storeId) {
      return jsonError("Event not found", 404);
    }

    const signups = await dataStore.listEventSignups(id);
    return jsonOk({
      signups,
      signupCount: signups.length,
      spotsRemaining: spotsRemaining(event, signups.length),
      capacity: event.capacity ?? null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
