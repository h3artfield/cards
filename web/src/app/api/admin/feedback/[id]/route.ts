import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import {
  requireAdminSession,
  requirePlatformAdmin,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import type { FeedbackStatus } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return auth;

  const forbidden = requirePlatformAdmin(auth);
  if (forbidden) return forbidden;

  const { id } = await params;

  try {
    const body = (await req.json()) as { status?: FeedbackStatus };
    const status = body.status;
    if (status !== "new" && status !== "reviewed") {
      return jsonError("Invalid status");
    }

    const updated = await dataStore.updateFeedbackStatus(id, status);
    if (!updated) return jsonError("Feedback not found", 404);
    return jsonOk({ feedback: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
