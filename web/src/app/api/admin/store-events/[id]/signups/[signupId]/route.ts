import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; signupId: string }> },
) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const { id, signupId } = await context.params;
    const event = await dataStore.getStoreEvent(id);
    if (!event || event.storeId !== scope.storeId) {
      return jsonError("Event not found", 404);
    }

    const signups = await dataStore.listEventSignups(id);
    const signup = signups.find((s) => s.id === signupId);
    if (!signup) {
      return jsonError("Signup not found", 404);
    }

    await dataStore.deleteEventSignup(signupId);
    await dataStore.logAdminAction({
      action: "delete_event_signup",
      eventId: id,
      signupId,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
