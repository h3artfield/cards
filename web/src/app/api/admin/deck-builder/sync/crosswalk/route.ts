import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { runCrosswalkBatch } from "@/lib/deck-builder/deck-builder-service";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { newSyncRunId } from "@/lib/deck-builder/sync-edhrec";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.min(100, Math.max(1, body.limit ?? 50));

    const runId = newSyncRunId();
    await deckBuilderStore.saveSyncRun({
      id: runId,
      storeId: scope.storeId,
      type: "crosswalk",
      status: "running",
      processed: 0,
      total: limit,
      startedAt: new Date().toISOString(),
    });

    const result = await runCrosswalkBatch({
      storeId: scope.storeId,
      limit,
    });

    await deckBuilderStore.saveSyncRun({
      id: runId,
      storeId: scope.storeId,
      type: "crosswalk",
      status: "completed",
      processed: result.processed,
      total: limit,
      message: `Linked ${result.linked}, remaining ${result.remaining}`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    return jsonOk({ runId, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
