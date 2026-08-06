/**
 * Cache inventory card images to Firebase (Scryfall / TCGplayer sources).
 *
 * Usage:
 *   npx tsx scripts/backfill-inventory-images.ts --store-id=the-game-lodge
 *   npx tsx scripts/backfill-inventory-images.ts --store-id=the-game-lodge --rounds=20
 */
import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();

import { deckBuilderStore } from "../src/lib/deck-builder/deck-builder-store";
import { dataStore } from "../src/lib/storage/data-store";
import { backfillInventoryImagesRun, inventoryItemCanRetryImageCache } from "../src/lib/inventory/image-backfill";
import { isCatalogImportItem } from "../src/lib/inventory/status";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function clearFailedImageFlags(storeId: string): Promise<number> {
  const all = await dataStore.getInventory(storeId);
  const retryable = all
    .filter(
      (item) =>
        isCatalogImportItem(item) && inventoryItemCanRetryImageCache(item),
    )
    .map((item) => item.id);
  return dataStore.clearInventoryImageCacheFailures(retryable);
}

async function main() {
  const storeId = arg("store-id") ?? "the-game-lodge";
  const rounds = Number.parseInt(arg("rounds") ?? "30", 10);
  const batchSize = Number.parseInt(arg("batch-size") ?? "15", 10);
  const budgetMs = Number.parseInt(arg("budget-ms") ?? "50000", 10);
  const retryFailed = process.argv.includes("--retry-failed");

  if (retryFailed) {
    const cleared = await clearFailedImageFlags(storeId);
    console.log(`Cleared imageCacheFailedAt on ${cleared} rows.`);
  }

  let totalCached = 0;
  let totalFailed = 0;
  let totalProcessed = 0;

  for (let round = 1; round <= rounds; round += 1) {
    const all = await dataStore.getInventory(storeId);
    const catalog = all.filter(
      (i) => isCatalogImportItem(i) && i.status !== "sold",
    );
    const crosswalks = await deckBuilderStore.listCrosswalks(storeId);
    const crosswalkByItemId = new Map(
      crosswalks.map((cw) => [cw.inventoryItemId, cw]),
    );

    const run = await backfillInventoryImagesRun({
      storeId,
      items: catalog,
      batchSize,
      budgetMs,
      crosswalkByItemId,
    });

    for (const item of run.updatedItems) {
      await dataStore.saveInventoryItem(item);
    }

    totalCached += run.cached;
    totalFailed += run.failed;
    totalProcessed += run.processed;

    console.log(
      `Round ${round}: cached=${run.cached} failed=${run.failed} processed=${run.processed} remaining=${run.remaining}`,
    );

    if (run.remaining <= 0 || run.processed === 0) break;
  }

  console.log(
    `\nDone: cached=${totalCached} failed=${totalFailed} processed=${totalProcessed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
