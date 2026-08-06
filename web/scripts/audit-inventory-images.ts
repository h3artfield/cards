/**
 * Fast audit in-stock inventory image coverage (no per-card Firestore catalog reads).
 *
 * Usage:
 *   npx tsx scripts/audit-inventory-images.ts --store-id=the-game-lodge
 *   npx tsx scripts/audit-inventory-images.ts --store-id=the-game-lodge --q=lord
 */
import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();

import { dataStore } from "../src/lib/storage/data-store";
import {
  inventoryItemNeedsImageCache,
  inventoryItemCanRetryImageCache,
} from "../src/lib/inventory/image-backfill";
import {
  isFirebaseStorageUrl,
  isTcgplayerCdnUrl,
} from "../src/lib/inventory/image-url";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "../src/lib/inventory/status";
import { cardNameFromInventoryItem } from "../src/lib/inventory/image-fallback";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const storeId = arg("store-id") ?? "the-game-lodge";
  const filterQ = arg("q")?.toLowerCase();

  console.log(`Loading inventory for ${storeId}…`);
  const items = (await dataStore.getInventory(storeId)).filter(
    (i) =>
      isCatalogImportItem(i) &&
      isInventoryAvailable(i) &&
      inventoryEffectiveQuantity(i) > 0,
  );
  console.log(`Loaded ${items.length} in-stock catalog rows.`);

  type Row = {
    name: string;
    setName?: string;
    source: string;
    needsCache: boolean;
    cacheFailed: boolean;
    hasCatalogLink: boolean;
  };

  const rows: Row[] = [];

  for (const item of items) {
    const name = cardNameFromInventoryItem(item);
    const haystack = [name, item.setName, item.productName, item.displayName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (filterQ && !haystack.includes(filterQ)) continue;

    let source = "none";
    if (isFirebaseStorageUrl(item.frontImageUrl)) source = "firebase";
    else if (item.catalogScryfallId) source = "catalog_link";
    else if (isTcgplayerCdnUrl(item.frontImageUrl) || item.tcgplayerProductId) {
      source = "tcgplayer";
    } else if (item.frontImageUrl?.trim()) source = "other_url";

    rows.push({
      name,
      setName: item.setName,
      source,
      needsCache: inventoryItemNeedsImageCache(item),
      cacheFailed: Boolean(item.imageCacheFailedAt),
      hasCatalogLink: Boolean(item.catalogScryfallId),
    });
  }

  const totals = {
    scanned: rows.length,
    firebase: rows.filter((r) => r.source === "firebase").length,
    catalogLink: rows.filter((r) => r.source === "catalog_link").length,
    tcgplayerOnly: rows.filter((r) => r.source === "tcgplayer").length,
    none: rows.filter((r) => r.source === "none").length,
    needsCache: rows.filter((r) => r.needsCache).length,
    cacheFailed: rows.filter((r) => r.cacheFailed).length,
    noCatalogLink: rows.filter((r) => !r.hasCatalogLink && r.source !== "firebase")
      .length,
  };

  console.log(JSON.stringify({ storeId, totals }, null, 2));

  const problem = rows.filter(
    (r) =>
      r.source !== "firebase" &&
      (r.source === "none" || r.needsCache || r.cacheFailed || !r.hasCatalogLink),
  );

  console.log(`\nNeeds work (${problem.length}):`);
  for (const row of problem.slice(0, 100)) {
    console.log(
      `- ${row.name}${row.setName ? ` (${row.setName})` : ""} [${row.source}]` +
        `${row.cacheFailed ? " FAILED" : ""}` +
        `${row.needsCache ? " NEEDS_CACHE" : ""}` +
        `${!row.hasCatalogLink ? " NO_CATALOG" : ""}`,
    );
  }
  if (problem.length > 100) {
    console.log(`… and ${problem.length - 100} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
