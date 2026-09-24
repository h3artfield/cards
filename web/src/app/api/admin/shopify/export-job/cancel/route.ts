import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { exportJobProgress } from "@/lib/shopify/export-job-math";
import {
  getExportJob,
  requestExportJobCancel,
} from "@/lib/shopify/export-job-store";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as { jobId?: string };
    const jobId = body.jobId?.trim();
    if (!jobId) return jsonError("jobId is required", 400);

    const existing = await getExportJob(jobId);
    if (!existing) return jsonError("Export job not found", 404);
    if (existing.storeId !== scope.storeId) {
      return jsonError("Export job belongs to another store", 403);
    }

    // The chunk in flight finishes its current row, then stops on the next pass.
    const job = await requestExportJobCancel(jobId);
    if (!job) return jsonError("Export job not found", 404);

    return jsonOk({ job, progress: exportJobProgress(job) });
  } catch (err) {
    return handleRouteError(err);
  }
}
