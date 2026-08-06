import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { upsertCatalogOracleFromPrinting } from "@/lib/deck-builder/catalog-oracle-card";
import { touchCatalogSyncState } from "@/lib/deck-builder/catalog-sync-state";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";

/** Backfill catalogOracleCards from cached catalogCards (printings). */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      offset?: number;
    };
    const limit = Math.min(1000, Math.max(1, body.limit ?? 200));
    const offset = Math.max(0, body.offset ?? 0);

    const fetchCount = Math.min(2000, offset + limit);
    const allPrintings = await deckBuilderStore.listCatalogCards(fetchCount);
    const batch = allPrintings.slice(offset, offset + limit);

    let upserted = 0;
    let skippedNoOracle = 0;

    for (const printing of batch) {
      if (!printing.oracleId?.trim()) {
        skippedNoOracle += 1;
        continue;
      }
      const oracle = await upsertCatalogOracleFromPrinting({
        catalog: printing,
        getExistingOracle: (id) => deckBuilderStore.getCatalogOracleCard(id),
        saveOracle: (card) => deckBuilderStore.saveCatalogOracleCard(card),
      });
      if (oracle) upserted += 1;
    }

    const totalPrintings = await deckBuilderStore.countCatalogCards();
    const remaining = Math.max(0, totalPrintings - (offset + batch.length));

    await touchCatalogSyncState({
      lastOracleCardSyncAt: new Date().toISOString(),
      catalogPrintingCount: totalPrintings,
      catalogOracleCardCount: await deckBuilderStore.countCatalogOracleCards(),
    });

    return jsonOk({
      processed: batch.length,
      upserted,
      skippedNoOracle,
      offset,
      nextOffset: offset + batch.length,
      remaining,
      catalogOracleCards: await deckBuilderStore.countCatalogOracleCards(),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
