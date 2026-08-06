import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { requireFirestore } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { runGoldenCatalogImport } from "@/lib/deck-builder/golden-catalog/import-pipeline";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      force?: boolean;
      limit?: number;
      datasets?: Array<"oracle_cards" | "default_cards" | "oracle_tags">;
    };

    const db = requireFirestore();
    const run = await runGoldenCatalogImport({
      db,
      dryRun: body.dryRun ?? false,
      force: body.force ?? false,
      limit: body.limit,
      datasets: body.datasets,
    });

    return jsonOk({ run });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const db = requireFirestore();
    const snap = await db
      .collection(COLLECTIONS.goldenCatalogImportRuns)
      .orderBy("startedAt", "desc")
      .limit(5)
      .get();

    return jsonOk({
      runs: snap.docs.map((d) => d.data()),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
