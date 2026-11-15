import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api-utils";
import { buildDailyReports, summarizeDailyReport } from "@/lib/reports/daily-reports";

/** Day list with headline numbers, plus the full report for `?date=` (default: newest day). */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const reports = await buildDailyReports(scope.storeId);
    const wanted = req.nextUrl.searchParams.get("date");
    const report = reports.find((r) => r.date === wanted) ?? reports[0] ?? null;
    return jsonOk({ days: reports.map(summarizeDailyReport), report });
  } catch (err) {
    return handleRouteError(err);
  }
}
