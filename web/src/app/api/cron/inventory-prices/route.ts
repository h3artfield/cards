import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getAdminSession, resolveAdminStoreId } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { justTcgConfiguredV1 } from "@/lib/pricing/justtcg-client";
import { runNightlyPriceRefreshV1 } from "@/lib/pricing/nightly-price-refresh";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const sent = req.headers.get("x-cron-secret")?.trim();
  if (!secret || !sent) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(sent);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Overnight JustTCG price refresh. Cloud Scheduler calls this every few
 * minutes through the night with the cron secret; each call works for up to
 * four minutes and the next one carries on until every card is priced for
 * the day. Staff can also start it from the admin.
 */
export async function POST(req: NextRequest) {
  try {
    let storeIds: string[];
    if (cronAuthorized(req)) {
      storeIds = (await dataStore.listStores()).map((s) => s.id);
    } else {
      const session = getAdminSession(req);
      const storeId = session ? resolveAdminStoreId(session, req) : null;
      if (!storeId) return jsonError("Unauthorized", 401);
      storeIds = [storeId];
    }
    if (!justTcgConfiguredV1()) return jsonError("JUSTTCG_API_KEY is not configured", 503);

    const budgetMs = 240_000;
    const started = Date.now();
    const reports = [];
    for (const storeId of storeIds) {
      const left = budgetMs - (Date.now() - started);
      if (left < 20_000) break;
      reports.push(await runNightlyPriceRefreshV1({ storeId, budgetMs: left }));
    }
    return jsonOk({ reports });
  } catch (err) {
    return handleRouteError(err);
  }
}
