import { adminFetch } from "@/lib/api-client";

export type ImageCacheBatchResult = {
  cached: number;
  failed: number;
  remaining: number;
  processed: number;
};

/** Run backfill-images until pending rows are cached or a batch stalls. */
export async function runInventoryImageCacheLoop(input?: {
  batchSize?: number;
  budgetMs?: number;
  onProgress?: (status: {
    run: number;
    batch: ImageCacheBatchResult;
    totalCached: number;
    totalFailed: number;
  }) => void;
}): Promise<{
  runs: number;
  totalCached: number;
  totalFailed: number;
  remaining: number;
}> {
  const batchSize = input?.batchSize ?? 15;
  const budgetMs = input?.budgetMs ?? 50_000;
  let remaining = 1;
  let run = 0;
  let totalCached = 0;
  let totalFailed = 0;

  while (remaining > 0) {
    run += 1;
    const res = await adminFetch("/api/admin/inventory/backfill-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize, budgetMs }),
    });
    const body = (await res.json()) as {
      error?: string;
      batch?: ImageCacheBatchResult;
    };
    if (!res.ok) {
      throw new Error(body.error ?? "Image cache failed");
    }
    const batch = body.batch!;
    totalCached += batch.cached;
    totalFailed += batch.failed;
    remaining = batch.remaining;
    input?.onProgress?.({ run, batch, totalCached, totalFailed });
    if (batch.processed === 0) break;
  }

  return { runs: run, totalCached, totalFailed, remaining };
}
