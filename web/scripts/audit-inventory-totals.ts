/**
 * Compare Firestore inventory totals vs expected CSV aggregates.
 * Run: npx tsx scripts/audit-inventory-totals.ts --store-id=the-game-lodge
 * Optional: npx tsx scripts/audit-inventory-totals.ts --csv=path/to/export.csv
 */
import { readFileSync } from "node:fs";
import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { dataStore } from "../src/lib/storage/data-store";
import { computeInventoryAnalytics } from "../src/lib/inventory/analytics";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isTcgplayerImportItem,
} from "../src/lib/inventory/status";
import { inventoryTcgLowUnitPrice } from "../src/lib/inventory/tcg-low-price";
import { parseTcgplayerInventoryExportCsv } from "../src/lib/tcgplayer-inventory/parse-export-csv";
import type { InventoryItem } from "../src/lib/types";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return undefined;
}

function sumCsvTotals(csvText: string) {
  const { rows } = parseTcgplayerInventoryExportCsv(csvText);
  let units = 0;
  let sumStoreUnit = 0;
  let sumTcgLowUnit = 0;
  let sumStoreExtended = 0;
  let sumTcgLowExtended = 0;
  let sumMarketExtended = 0;
  let inStockRows = 0;

  for (const row of rows) {
    units += row.quantity;
    sumStoreUnit += row.storePrice;
    sumTcgLowUnit += row.tcgLowPrice;
    if (row.quantity > 0) {
      inStockRows += 1;
      sumStoreExtended += row.storePrice * row.quantity;
      sumTcgLowExtended += row.tcgLowPrice * row.quantity;
      sumMarketExtended += row.tcgMarketPrice * row.quantity;
    }
  }

  return {
    rows: rows.length,
    inStockRows,
    units,
    sumStoreUnit,
    sumTcgLowUnit,
    sumStoreExtended,
    sumTcgLowExtended,
    sumMarketExtended,
  };
}

function sumDbItems(items: InventoryItem[], label: string) {
  let units = 0;
  let sumStoreUnit = 0;
  let sumTcgLowUnit = 0;
  let sumStoreExtended = 0;
  let sumTcgLowExtended = 0;
  let inStockRows = 0;

  for (const item of items) {
    const qty = inventoryEffectiveQuantity(item);
    const store = item.listPrice ?? 0;
    const tcgLow = inventoryTcgLowUnitPrice(item);
    units += qty;
    sumStoreUnit += store;
    sumTcgLowUnit += tcgLow;
    if (qty > 0) {
      inStockRows += 1;
      sumStoreExtended += store * qty;
      sumTcgLowExtended += tcgLow * qty;
    }
  }

  console.log(`\n--- ${label} ---`);
  console.log(`  rows:              ${items.length.toLocaleString()}`);
  console.log(`  in-stock rows:     ${inStockRows.toLocaleString()}`);
  console.log(`  units (qty sum):   ${units.toLocaleString()}`);
  console.log(`  Σ store (unit):    ${sumStoreUnit.toFixed(2)}`);
  console.log(`  Σ tcg low (unit):  ${sumTcgLowUnit.toFixed(2)}`);
  console.log(`  Σ store × qty:     ${sumStoreExtended.toFixed(2)}`);
  console.log(`  Σ tcg low × qty:   ${sumTcgLowExtended.toFixed(2)}`);
}

function dedupeByListingKey(items: InventoryItem[]): InventoryItem[] {
  const byKey = new Map<string, InventoryItem>();
  const noKey: InventoryItem[] = [];

  for (const item of items) {
    const key = item.tcgplayerListingKey?.trim();
    if (!key) {
      noKey.push(item);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const mergedQty =
      inventoryEffectiveQuantity(existing) + inventoryEffectiveQuantity(item);
    byKey.set(key, {
      ...existing,
      quantity: mergedQty,
      listPrice: existing.listPrice ?? item.listPrice,
      tcgLowPrice: existing.tcgLowPrice ?? item.tcgLowPrice,
      tcgMarketPrice: existing.tcgMarketPrice ?? item.tcgMarketPrice,
    });
  }

  return [...byKey.values(), ...noKey];
}

function findDuplicateKeys(items: InventoryItem[]): Array<{ key: string; count: number; units: number }> {
  const counts = new Map<string, { count: number; units: number }>();
  for (const item of items) {
    const key = item.tcgplayerListingKey;
    if (!key) continue;
    const qty = inventoryEffectiveQuantity(item);
    const entry = counts.get(key) ?? { count: 0, units: 0 };
    entry.count += 1;
    entry.units += qty;
    counts.set(key, entry);
  }
  return [...counts.entries()]
    .filter(([, v]) => v.count > 1)
    .map(([key, v]) => ({ key, count: v.count, units: v.units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 15);
}

async function main() {
  const storeId = arg("store-id") ?? "the-game-lodge";
  const csvPath = arg("csv");

  console.log(`Inventory totals audit — store: ${storeId}`);

  if (csvPath) {
    const csvText = readFileSync(csvPath, "utf8");
    const csv = sumCsvTotals(csvText);
    console.log("\n--- CSV file ---");
    console.log(`  path:              ${csvPath}`);
    console.log(`  rows:              ${csv.rows.toLocaleString()}`);
    console.log(`  in-stock rows:     ${csv.inStockRows.toLocaleString()}`);
    console.log(`  units (qty sum):   ${csv.units.toLocaleString()}`);
    console.log(`  Σ store (unit):    ${csv.sumStoreUnit.toFixed(2)}`);
    console.log(`  Σ tcg low (unit):  ${csv.sumTcgLowUnit.toFixed(2)}`);
    console.log(`  Σ store × qty:     ${csv.sumStoreExtended.toFixed(2)}`);
    console.log(`  Σ tcg low × qty:   ${csv.sumTcgLowExtended.toFixed(2)}`);
  }

  const all = await dataStore.getInventory(storeId);
  const catalog = all.filter(
    (i) => isCatalogImportItem(i) && i.status !== "sold",
  );
  const tcg = catalog.filter(isTcgplayerImportItem);

  sumDbItems(tcg, "Firestore (all TCGplayer rows, raw)");
  sumDbItems(dedupeByListingKey(tcg), "Firestore (deduped by listing key)");

  const analytics = computeInventoryAnalytics(catalog);
  console.log("\n--- Dashboard analytics (current code) ---");
  console.log(`  totalUnits:        ${analytics.totalUnits.toLocaleString()}`);
  console.log(`  totalRows:         ${analytics.totalRows.toLocaleString()}`);
  console.log(`  totalListValue:    ${analytics.totalListValue.toFixed(2)}`);
  console.log(`  totalTcgLowValue:  ${analytics.totalTcgLowValue.toFixed(2)}`);
  console.log(`  totalMarketValue:  ${analytics.totalMarketValue.toFixed(2)}`);

  const dupes = findDuplicateKeys(tcg);
  console.log(`\n--- Duplicate listing keys: ${dupes.length} shown (top 15) ---`);
  for (const d of dupes) {
    console.log(`  ${d.key}: ${d.count} docs, ${d.units} total units`);
  }

  const inStockQtys = tcg
    .map((i) => inventoryEffectiveQuantity(i))
    .filter((q) => q > 0);
  const sumQty = inStockQtys.reduce((a, b) => a + b, 0);
  console.log("\n--- Qty distribution (in-stock TCG rows) ---");
  console.log(`  rows with qty>0:   ${inStockQtys.length.toLocaleString()}`);
  console.log(`  rows with qty>1:   ${inStockQtys.filter((q) => q > 1).length.toLocaleString()}`);
  console.log(`  rows with qty>5:   ${inStockQtys.filter((q) => q > 5).length.toLocaleString()}`);
  console.log(`  max qty on row:    ${Math.max(...inStockQtys, 0)}`);
  console.log(`  avg qty:           ${(sumQty / Math.max(inStockQtys.length, 1)).toFixed(2)}`);

  const snaps = await dataStore.listInventoryImportSnapshots(storeId, 5);
  console.log("\n--- Recent import snapshots ---");
  for (const s of snaps) {
    console.log(
      `  ${s.importedAt}: ${s.totalUnits} units, ${s.totalRows} rows (+${s.created} / ~${s.updated} updated)`,
    );
  }

  console.log("\nExpected (from spreadsheet):");
  console.log("  units: 4761 | Σ tcg low (unit): 52297 | Σ store (unit): 55739 | Σ store×qty: 28957");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
