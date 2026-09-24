import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import { buildTcgplayerImportPreview } from "@/lib/tcgplayer-inventory/apply-import";
import { computeCsvImportTotals } from "@/lib/tcgplayer-inventory/csv-totals";
import { assessTcgplayerWithdrawalRisk } from "@/lib/tcgplayer-inventory/import-guard";
import { parseTcgplayerInventoryExportCsv } from "@/lib/tcgplayer-inventory/parse-export-csv";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as { csv?: string };
    if (!body.csv?.trim()) {
      return jsonError("Upload a TCGplayer inventory export CSV", 400);
    }

    const inventory = await dataStore.getInventory(scope.storeId);
    const preview = buildTcgplayerImportPreview(body.csv, inventory);
    const { rows } = parseTcgplayerInventoryExportCsv(body.csv);
    const csvTotals = computeCsvImportTotals(rows);
    const risk = assessTcgplayerWithdrawalRisk(preview);

    return jsonOk({ preview, csvTotals, risk });
  } catch (err) {
    return handleRouteError(err);
  }
}
