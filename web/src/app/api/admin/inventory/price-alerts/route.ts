import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  PRICE_ALERTS_COLLECTION,
  PRICE_RUNS_COLLECTION,
  type InventoryPriceAlertV1,
  type PriceRunReportV1,
} from "@/lib/pricing/nightly-price-refresh";

/** Open price alerts (moves over 20%) plus the latest nightly run summary. */
export async function GET(req: NextRequest) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  try {
    const db = getAdminFirestore();
    if (!db) return jsonOk({ alerts: [], lastRun: null });
    const [alertsSnap, runsSnap] = await Promise.all([
      db.collection(PRICE_ALERTS_COLLECTION).where("storeId", "==", scope.storeId).where("status", "==", "open").get(),
      db.collection(PRICE_RUNS_COLLECTION).where("storeId", "==", scope.storeId).get(),
    ]);
    const alerts = alertsSnap.docs
      .map((d) => d.data() as InventoryPriceAlertV1)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Math.abs(b.change) - Math.abs(a.change));
    const lastRun =
      runsSnap.docs.map((d) => d.data() as PriceRunReportV1).sort((a, b) => b.runDate.localeCompare(a.runDate))[0] ??
      null;
    return jsonOk({ alerts, lastRun });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Dismiss alerts: `{ ids: string[] }`, or `{ all: true }` for every open one. */
export async function POST(req: NextRequest) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  try {
    const db = getAdminFirestore();
    if (!db) return jsonError("Firestore is not configured", 503);
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; all?: unknown };
    const col = db.collection(PRICE_ALERTS_COLLECTION);
    let refs;
    if (body.all === true) {
      const snap = await col.where("storeId", "==", scope.storeId).where("status", "==", "open").get();
      refs = snap.docs.map((d) => d.ref);
    } else if (Array.isArray(body.ids)) {
      const ids = body.ids.filter((x): x is string => typeof x === "string" && x.startsWith(`${scope.storeId}_`));
      refs = ids.slice(0, 500).map((id) => col.doc(id));
    } else {
      return jsonError("Send ids or all", 400);
    }
    const writer = db.bulkWriter();
    const dismissedAt = new Date().toISOString();
    for (const ref of refs) void writer.set(ref, { status: "dismissed", dismissedAt }, { merge: true });
    await writer.close();
    return jsonOk({ dismissed: refs.length });
  } catch (err) {
    return handleRouteError(err);
  }
}
