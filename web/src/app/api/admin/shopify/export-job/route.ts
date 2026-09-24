import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { exportJobProgress } from "@/lib/shopify/export-job-math";
import {
  buildExportJob,
  getLatestExportJob,
  saveExportJob,
} from "@/lib/shopify/export-job-store";
import { catalogExportEligibility } from "@/lib/shopify/inventory-listing";
import { dataStore } from "@/lib/storage/data-store";
import type { ShopifyExportJob } from "@/lib/shopify/export-job-types";

/** Rows per chunk. One chunk is one request, so this stays modest. */
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 25;

function jobView(job: ShopifyExportJob | null, eligibleNow: number) {
  if (!job) return { job: null, eligibleNow };
  return { job, progress: exportJobProgress(job), eligibleNow };
}

async function countEligible(storeId: string): Promise<number> {
  const [settings, inventory] = await Promise.all([
    dataStore.getSettings(storeId),
    dataStore.getInventory(storeId),
  ]);
  const integration = settings.shopifyIntegration;
  return inventory.filter(
    (item) => catalogExportEligibility(item, integration).eligible,
  ).length;
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const [job, eligibleNow] = await Promise.all([
      getLatestExportJob(scope.storeId),
      countEligible(scope.storeId),
    ]);

    return jsonOk(jobView(job, eligibleNow));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as {
      batchSize?: number;
    };

    const settings = await dataStore.getSettings(scope.storeId);
    if (!settings.shopifyIntegration?.enabled) {
      return jsonError("Shopify integration is not enabled", 400);
    }

    const existing = await getLatestExportJob(scope.storeId);
    if (existing?.status === "running") {
      return jsonError("An export job is already running", 409, {
        job: existing,
      });
    }

    const eligibleNow = await countEligible(scope.storeId);
    if (eligibleNow === 0) {
      return jsonError("No inventory rows are ready for Shopify", 400);
    }

    const batchSize = Math.min(
      Math.max(1, Math.trunc(body.batchSize ?? DEFAULT_BATCH_SIZE)),
      MAX_BATCH_SIZE,
    );

    const job = buildExportJob({
      storeId: scope.storeId,
      batchSize,
      totalEligible: eligibleNow,
      startedBy: auth.email,
    });
    await saveExportJob(job);

    return jsonOk(jobView(job, eligibleNow));
  } catch (err) {
    return handleRouteError(err);
  }
}
