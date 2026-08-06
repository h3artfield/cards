/**
 * Bulk-enrich store inventory with Scryfall catalog dimensions (color, legality, etc.).
 *
 * Usage:
 *   npx tsx scripts/backfill-inventory-catalog.ts --store-id=<uuid> [--force] [--limit=50]
 */
import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();

import { dataStore } from "../src/lib/storage/data-store";
import { deckBuilderStore } from "../src/lib/deck-builder/deck-builder-store";
import { enrichInventoryCatalogBatch } from "../src/lib/deck-builder/inventory-catalog-enrichment";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "../src/lib/inventory/status";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const storeId = arg("store-id");
  if (!storeId) {
    console.error("Missing --store-id");
    process.exit(1);
  }

  const forceRelink = process.argv.includes("--force");
  const batchLimit = Number.parseInt(arg("limit") ?? "200", 10);

  let totalEnriched = 0;
  let totalRelinked = 0;
  let rounds = 0;
  let prevRemaining = Number.POSITIVE_INFINITY;

  while (rounds < 500) {
    rounds += 1;
    const items = (await dataStore.getInventory(storeId)).filter(
      (i) =>
        isCatalogImportItem(i) &&
        isInventoryAvailable(i) &&
        inventoryEffectiveQuantity(i) > 0 &&
        i.category === "magic",
    );

    const existing = await deckBuilderStore.listCrosswalks(storeId);
    const map = new Map(existing.map((c) => [c.inventoryItemId, c]));

    if (rounds === 1) {
      console.log(
        `Enriching ${items.length} magic rows (force=${forceRelink}, batch=${batchLimit})…`,
      );
    }

    const result = await enrichInventoryCatalogBatch({
      storeId,
      items,
      existingCrosswalks: map,
      limit: batchLimit,
      forceRelink,
      magicOnly: true,
      saveCrosswalk: (cw) => deckBuilderStore.saveCrosswalk(cw),
      saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
      saveInventoryItem: (item) => dataStore.saveInventoryItem(item),
    });

    totalEnriched += result.enriched;
    totalRelinked += result.relinked;
    console.log(
      `Round ${rounds}: enriched=${result.enriched} relinked=${result.relinked} failed=${result.failed} skipped=${result.skipped} remaining=${result.remaining} oracleTags=${result.oracleTagsUsed ? "yes" : "no"}`,
    );

    if (result.remaining <= 0) break;
    if (result.enriched === 0 && result.relinked === 0) break;
    if (result.remaining >= prevRemaining && result.enriched > 0) {
      console.warn(
        `Stopping: remaining stuck at ${result.remaining} (${result.enriched} enriched this round but queue did not shrink).`,
      );
      break;
    }
    prevRemaining = result.remaining;
  }

  console.log(
    `Done. ${totalEnriched} enriched, ${totalRelinked} relinked in ${rounds} round(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
