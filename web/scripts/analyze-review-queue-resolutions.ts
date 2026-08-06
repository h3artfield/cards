/**
 * Dry-run analysis of review queue resolution strategies.
 */
import { loadEnvLocal } from "./lib/script-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getScryfallBulkIndex, resolveCatalogFromBulkIndex } from "../src/lib/deck-builder/scryfall-bulk-index";
import { classifyProductIdentityForReview } from "../src/lib/inventory/inventory-product-identity";
import type { InventoryItem } from "../src/lib/types";

loadEnvLocal();

async function main() {
  const report = JSON.parse(
    readFileSync(resolve(process.cwd(), "reports/inventory-manual-review-queue.json"), "utf8"),
  );
  const { dataStore } = await import("../src/lib/storage/data-store");
  const storeId = process.env.STORE_ID?.trim() || "the-game-lodge";
  const all = await dataStore.getInventory(storeId);
  const byId = new Map(all.map((i) => [i.id, i]));
  const index = await getScryfallBulkIndex();

  const counts: Record<string, number> = {};
  for (const row of report.queue) {
    const item = byId.get(row.inventoryListingId);
    if (!item) {
      counts.missing_item = (counts.missing_item ?? 0) + 1;
      continue;
    }
    const product = classifyProductIdentityForReview(item);
    if (product.outcome !== "pending_card_lookup") {
      counts[product.outcome] = (counts[product.outcome] ?? 0) + 1;
      continue;
    }
    const bulk = resolveCatalogFromBulkIndex(item, index);
    if (!bulk) {
      counts.unresolved = (counts.unresolved ?? 0) + 1;
      continue;
    }
    if (bulk.matchMethod === "set_search") counts.confirmed_printing_set = (counts.confirmed_printing_set ?? 0) + 1;
    else if (bulk.matchMethod === "tcgplayer_id") {
      const setMismatch =
        item.setName &&
        item.cardNumber &&
        (bulk.catalog.setName?.toLowerCase() !== item.setName.toLowerCase() ||
          bulk.catalog.collectorNumber !== item.cardNumber);
      if (setMismatch) counts.identity_conflict = (counts.identity_conflict ?? 0) + 1;
      else counts.confirmed_printing_tcg = (counts.confirmed_printing_tcg ?? 0) + 1;
    } else counts.name_search_only = (counts.name_search_only ?? 0) + 1;
  }
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(console.error);
