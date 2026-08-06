import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import {
  newSyncRunId,
  syncEdhrecTopCommandersBatch,
} from "@/lib/deck-builder/sync-edhrec";

export const maxDuration = 300;

const RUN_ALL_BUDGET_MS = 52_000;

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      offset?: number;
      batchSize?: number;
      runAll?: boolean;
    };
    const limit = Math.min(500, Math.max(1, body.limit ?? 500));
    let offset = Math.max(0, body.offset ?? 0);
    const batchSize = Math.min(5, Math.max(1, body.batchSize ?? 5));
    const runAll = Boolean(body.runAll);

    const runId = newSyncRunId();
    await deckBuilderStore.saveSyncRun({
      id: runId,
      type: "commanders",
      status: "running",
      processed: offset,
      total: limit,
      startedAt: new Date().toISOString(),
    });

    const saveMeta = (m: Parameters<typeof deckBuilderStore.saveEdhrecMeta>[0]) =>
      deckBuilderStore.saveEdhrecMeta(m);
    const saveCatalogCard = (
      c: Parameters<typeof deckBuilderStore.saveCatalogCard>[0],
    ) => deckBuilderStore.saveCatalogCard(c);

    let synced = 0;
    let failed = 0;
    let remaining = limit;
    let batchesRun = 0;
    const slugs: string[] = [];
    const deadline = Date.now() + RUN_ALL_BUDGET_MS;

    do {
      const result = await syncEdhrecTopCommandersBatch({
        limit,
        batchSize,
        offset,
        saveMeta,
        saveCatalogCard,
        importRecommendationCards: false,
      });
      batchesRun += 1;
      synced += result.synced;
      failed += result.failed;
      remaining = result.remaining;
      slugs.push(...result.slugs);
      offset += batchSize;

      if (remaining <= 0 || result.synced === 0) break;
      if (!runAll) break;
    } while (remaining > 0 && Date.now() < deadline);

    await deckBuilderStore.saveSyncRun({
      id: runId,
      type: "commanders",
      status: "completed",
      processed: offset,
      total: limit,
      message: `Synced ${synced}, failed ${failed}, remaining ${remaining} (${batchesRun} batch(es))`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    return jsonOk({
      runId,
      synced,
      failed,
      remaining,
      slugs,
      batchesRun,
      nextOffset: offset,
      continued: runAll && remaining > 0,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
