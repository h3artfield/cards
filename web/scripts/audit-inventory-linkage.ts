/**
 * Mutually exclusive inventory linkage audit — must total exactly magic inventory count.
 * Run: npx tsx scripts/audit-inventory-linkage.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  classifyInventoryLinkStatus,
  type InventoryLinkCategory,
} from "../src/lib/inventory/catalog-link-identity";
import { isMagicInventoryItem } from "../src/lib/inventory/magic-items";
import { inventoryQuantityAvailable } from "../src/lib/inventory/status";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";

loadEnvLocal();

type CategoryTotals = Record<
  InventoryLinkCategory,
  { listingCount: number; availableQuantity: number }
>;

function emptyTotals(): CategoryTotals {
  return {
    fully_linked: { listingCount: 0, availableQuantity: 0 },
    oracle_only_linked: { listingCount: 0, availableQuantity: 0 },
    printing_only_linked: { listingCount: 0, availableQuantity: 0 },
    manual_review_candidate: { listingCount: 0, availableQuantity: 0 },
    ambiguous: { listingCount: 0, availableQuantity: 0 },
    conflict: { listingCount: 0, availableQuantity: 0 },
    unresolved: { listingCount: 0, availableQuantity: 0 },
    excluded_non_card_product: { listingCount: 0, availableQuantity: 0 },
    invalid_inventory_row: { listingCount: 0, availableQuantity: 0 },
    other: { listingCount: 0, availableQuantity: 0 },
  };
}

async function main() {
  const started = Date.now();
  const { dataStore } = await import("../src/lib/storage/data-store");
  const storeId = process.env.STORE_ID?.trim() || DEFAULT_STORE_ID;
  const items = await dataStore.getInventory(storeId);
  const magic = items.filter(isMagicInventoryItem);

  const byCategory = emptyTotals();
  let withOracle = 0;
  let withPrinting = 0;
  let fullyLinked = 0;
  let sellableFullyLinked = 0;
  let sellableQty = 0;
  let totalQty = 0;

  for (const item of magic) {
    const { category } = classifyInventoryLinkStatus(item);
    const qty = inventoryQuantityAvailable(item);
    byCategory[category].listingCount += 1;
    byCategory[category].availableQuantity += qty;
    totalQty += qty;
    if (qty > 0) sellableQty += qty;

    if (item.catalogOracleId?.trim()) withOracle += 1;
    if (item.catalogScryfallId?.trim()) withPrinting += 1;
    if (item.catalogOracleId?.trim() && item.catalogScryfallId?.trim()) {
      fullyLinked += 1;
      if (category === "fully_linked" && qty > 0) {
        sellableFullyLinked += 1;
      }
    }
  }

  const categorySum = Object.values(byCategory).reduce(
    (n, v) => n + v.listingCount,
    0,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    storeId,
    magicInventoryTotal: magic.length,
    categorySum,
    totalsMatch: categorySum === magic.length,
    byCategory,
    coverage: {
      oracleLinkedFormula: `${withOracle}/${magic.length}`,
      oracleLinkedPct: Math.round((withOracle / magic.length) * 10_000) / 100,
      printingLinkedFormula: `${withPrinting}/${magic.length}`,
      printingLinkedPct: Math.round((withPrinting / magic.length) * 10_000) / 100,
      fullyLinkedFormula: `${fullyLinked}/${magic.length}`,
      fullyLinkedPct: Math.round((fullyLinked / magic.length) * 10_000) / 100,
      customerSellableFullyLinkedFormula: `${sellableFullyLinked}/${magic.length}`,
      customerSellableFullyLinkedPct:
        Math.round((sellableFullyLinked / magic.length) * 10_000) / 100,
      sellableFullyLinkedQtyFormula: `${sellableFullyLinked} listings / ${totalQty} total available qty`,
    },
  };

  const outPath = resolve(process.cwd(), "reports", "inventory-linkage-audit.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Inventory linkage audit\n");
  console.log(`  Magic listings: ${magic.length}`);
  console.log(`  Category sum:   ${categorySum} (${report.totalsMatch ? "OK" : "MISMATCH"})`);
  for (const [cat, v] of Object.entries(byCategory)) {
    if (v.listingCount === 0) continue;
    console.log(`  ${cat}: ${v.listingCount} listings, ${v.availableQuantity} qty`);
  }
  console.log(`\n  Oracle linked:    ${report.coverage.oracleLinkedFormula} (${report.coverage.oracleLinkedPct}%)`);
  console.log(`  Printing linked:  ${report.coverage.printingLinkedFormula} (${report.coverage.printingLinkedPct}%)`);
  console.log(`  Fully linked:     ${report.coverage.fullyLinkedFormula} (${report.coverage.fullyLinkedPct}%)`);
  console.log(
    `  Sellable fully:   ${report.coverage.customerSellableFullyLinkedFormula} (${report.coverage.customerSellableFullyLinkedPct}%)`,
  );
  console.log(`\nReport: ${outPath}`);

  if (!report.totalsMatch) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
