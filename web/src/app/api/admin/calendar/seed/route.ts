import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { seedTglMonthSchedule } from "@/lib/store-calendar/seed-calendar";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const now = new Date();
    const year = body.year != null ? Number(body.year) : now.getFullYear();
    const month = body.month != null ? Number(body.month) : now.getMonth() + 1;

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return jsonError("Invalid year or month", 400);
    }

    const result = await seedTglMonthSchedule(scope.storeId, year, month);
    if (result.skipped) {
      return jsonOk({ ...result, message: result.reason }, 200);
    }

    await dataStore.logAdminAction({
      action: "seed_store_calendar",
      year,
      month,
      created: result.created,
    });

    return jsonOk({
      ...result,
      message: `Created ${result.created} events for ${year}-${String(month).padStart(2, "0")}. Calendar published.`,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
