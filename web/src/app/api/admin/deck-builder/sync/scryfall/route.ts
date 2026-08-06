import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import {
  importScryfallBulkBatch,
  importScryfallSearchPage,
} from "@/lib/deck-builder/scryfall-bulk";
import { newSyncRunId } from "@/lib/deck-builder/sync-edhrec";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => ({}))) as {
      offset?: number;
      batchSize?: number;
      mode?: "bulk" | "search";
      page?: number;
    };
    const offset = Math.max(0, body.offset ?? 0);
    const batchSize = Math.min(200, Math.max(10, body.batchSize ?? 50));
    const mode = body.mode ?? "bulk";

    const runId = newSyncRunId();
    await deckBuilderStore.saveSyncRun({
      id: runId,
      type: "scryfall_cards",
      status: "running",
      processed: offset,
      total: 0,
      startedAt: new Date().toISOString(),
    });

    if (mode === "search") {
      const page = Math.max(1, body.page ?? 1);
      const result = await importScryfallSearchPage({
        page,
        saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
      });
      await deckBuilderStore.saveSyncRun({
        id: runId,
        type: "scryfall_cards",
        status: "completed",
        processed: result.imported,
        total: result.totalCards,
        message: `Search page ${page}: imported ${result.imported}`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      return jsonOk({ runId, mode: "search", page, ...result });
    }

    try {
      const result = await importScryfallBulkBatch({
        offset,
        batchSize,
        saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
      });
      await deckBuilderStore.saveSyncRun({
        id: runId,
        type: "scryfall_cards",
        status: "completed",
        processed: result.nextOffset,
        total: result.total,
        message: `Imported ${result.imported} cards (${result.remaining} remaining)`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      return jsonOk({ runId, mode: "bulk", ...result });
    } catch (bulkErr) {
      const page = Math.max(1, Math.floor(offset / 175) + 1);
      const result = await importScryfallSearchPage({
        page,
        saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
      });
      await deckBuilderStore.saveSyncRun({
        id: runId,
        type: "scryfall_cards",
        status: "completed",
        processed: result.imported,
        total: result.totalCards,
        message: `Bulk failed, used search page ${page}`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      return jsonOk({
        runId,
        mode: "search_fallback",
        bulkError:
          bulkErr instanceof Error ? bulkErr.message : "Bulk import failed",
        page,
        ...result,
      });
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
