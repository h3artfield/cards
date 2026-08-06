/**
 * Source ↔ Firestore inventory reconciliation with customer-facing linkage metrics.
 *
 *   npx tsx scripts/reconcile-inventory-source.ts
 *   npx tsx scripts/reconcile-inventory-source.ts --csv=path/to/export.csv
 */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";
import {
  classifyInventoryLinkStatus,
  isClerkEligibleInventory,
  type InventoryLinkCategory,
} from "../src/lib/inventory/catalog-link-identity";
import {
  isEnrichableMagicSingle,
  isMagicInventoryItem,
} from "../src/lib/inventory/magic-items";
import {
  inventoryEffectiveQuantity,
  inventoryQuantityAvailable,
  isCatalogImportItem,
  isInventorySold,
  isTcgplayerImportItem,
} from "../src/lib/inventory/status";
import { parseTcgplayerInventoryExportCsv } from "../src/lib/tcgplayer-inventory/parse-export-csv";
import { buildTcgplayerListingKey } from "../src/lib/tcgplayer-inventory/listing-key";
import {
  computeLiveInventoryMetrics,
  loadInventoryAuditSnapshot,
  type InventoryAuditSnapshot,
} from "../src/lib/inventory/inventory-audit-snapshot";

loadEnvLocal();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return undefined;
}

function isMagicProductLine(productLine?: string): boolean {
  const line = (productLine ?? "").toLowerCase();
  return line.includes("magic") || line.includes("mtg");
}

function isMagicCategory(item: InventoryItem): boolean {
  return item.category === "magic" || isMagicProductLine(item.productLine);
}

type BucketKey =
  | "fully_linked"
  | "manual_review"
  | "unresolved"
  | "excluded_non_card"
  | "zero_quantity_historical"
  | "other";

function customerBucket(item: InventoryItem): BucketKey {
  const qtyAvail = inventoryQuantityAvailable(item);
  if (qtyAvail <= 0) return "zero_quantity_historical";
  const { category } = classifyInventoryLinkStatus(item);
  if (category === "fully_linked") return "fully_linked";
  if (category === "manual_review_candidate") return "manual_review";
  if (category === "unresolved") return "unresolved";
  if (category === "excluded_non_card_product") return "excluded_non_card";
  return "other";
}

function isFullyLinked(item: InventoryItem): boolean {
  return (
    Boolean(item.catalogOracleId?.trim()) &&
    Boolean(item.catalogScryfallId?.trim()) &&
    classifyInventoryLinkStatus(item).category === "fully_linked"
  );
}

interface BucketStats {
  listings: number;
  quantityOnHand: number;
  quantityAvailable: number;
}

function emptyBuckets(): Record<BucketKey, BucketStats> {
  return {
    fully_linked: { listings: 0, quantityOnHand: 0, quantityAvailable: 0 },
    manual_review: { listings: 0, quantityOnHand: 0, quantityAvailable: 0 },
    unresolved: { listings: 0, quantityOnHand: 0, quantityAvailable: 0 },
    excluded_non_card: { listings: 0, quantityOnHand: 0, quantityAvailable: 0 },
    zero_quantity_historical: { listings: 0, quantityOnHand: 0, quantityAvailable: 0 },
    other: { listings: 0, quantityOnHand: 0, quantityAvailable: 0 },
  };
}

function addToBucket(
  buckets: Record<BucketKey, BucketStats>,
  key: BucketKey,
  item: InventoryItem,
) {
  const b = buckets[key];
  b.listings += 1;
  b.quantityOnHand += Math.max(0, item.quantityOnHand ?? item.quantity ?? 0);
  b.quantityAvailable += inventoryQuantityAvailable(item);
}

function analyzeCsv(csvText: string) {
  const parsed = parseTcgplayerInventoryExportCsv(csvText);
  const rawRows = csvText.split(/\r?\n/).length - 1; // minus header
  const byListingKey = new Map<string, (typeof parsed.rows)[0]>();
  let mergedByKey = 0;

  for (const row of parsed.rows) {
    if (byListingKey.has(row.listingKey)) mergedByKey += 1;
    byListingKey.set(row.listingKey, row);
  }

  let magicRows = 0;
  let magicUniqueKeys = 0;
  let magicOnHand = 0;
  let magicAvailable = 0;
  let magicActiveListings = 0;

  for (const row of parsed.rows) {
    if (row.category !== "magic") continue;
    magicRows += 1;
  }
  for (const row of byListingKey.values()) {
    if (row.category !== "magic") continue;
    magicUniqueKeys += 1;
    magicOnHand += row.quantity;
    magicAvailable += row.quantity;
    if (row.quantity > 0) magicActiveListings += 1;
  }

  return {
    sourceCsvRowCount: rawRows,
    parsedRowCount: parsed.rows.length,
    skippedNoTcgplayerId: parsed.skipped,
    uniqueListingKeys: byListingKey.size,
    rowsMergedByListingKey: mergedByKey,
    magicParsedRows: magicRows,
    magicUniqueListingKeys: magicUniqueKeys,
    magicSumQuantityOnHand: magicOnHand,
    magicSumQuantityAvailable: magicAvailable,
    magicActiveListings,
    allParsedRows: parsed.rows.length,
    allUniqueKeys: byListingKey.size,
    allSumQuantity: [...byListingKey.values()].reduce((s, r) => s + r.quantity, 0),
  };
}

async function main() {
  const storeId = arg("store-id") ?? DEFAULT_STORE_ID;
  const csvPath = arg("csv");
  const { dataStore } = await import("../src/lib/storage/data-store");

  const all = await dataStore.getInventory(storeId);
  const tcg = all.filter(isTcgplayerImportItem);
  const catalog = all.filter(isCatalogImportItem);
  const magicAudit = all.filter(isMagicInventoryItem);
  const magicProductLine = tcg.filter(isMagicCategory);
  const magicEnrichable = magicAudit.filter(isEnrichableMagicSingle);

  let csvAnalysis: ReturnType<typeof analyzeCsv> | null = null;
  if (csvPath) {
    csvAnalysis = analyzeCsv(readFileSync(csvPath, "utf8"));
  }

  // Firestore quantity totals (Magic audit scope)
  let sumOnHand = 0;
  let sumReserved = 0;
  let sumCommitted = 0;
  let sumAvailable = 0;
  let listingsOnHandGt0 = 0;
  let listingsAvailableGt0 = 0;

  const buckets = emptyBuckets();
  for (const item of magicAudit) {
    sumOnHand += Math.max(0, item.quantityOnHand ?? item.quantity ?? 0);
    sumReserved += Math.max(0, item.quantityReserved ?? 0);
    sumCommitted += Math.max(0, item.quantityCommitted ?? 0);
    sumAvailable += inventoryQuantityAvailable(item);
    if ((item.quantityOnHand ?? item.quantity ?? 0) > 0) listingsOnHandGt0 += 1;
    if (inventoryQuantityAvailable(item) > 0) listingsAvailableGt0 += 1;
    addToBucket(buckets, customerBucket(item), item);
  }

  // Customer-facing card listings (enrichable singles only, qty > 0)
  let activeCardListings = 0;
  let activeCardUnits = 0;
  let activeLinkedListings = 0;
  let activeLinkedUnits = 0;
  let activeUnresolvedListings = 0;
  let activeUnresolvedUnits = 0;

  for (const item of magicEnrichable) {
    const qty = inventoryQuantityAvailable(item);
    if (qty <= 0) continue;
    activeCardListings += 1;
    activeCardUnits += qty;
    if (isFullyLinked(item)) {
      activeLinkedListings += 1;
      activeLinkedUnits += qty;
    }
    if (classifyInventoryLinkStatus(item).category === "unresolved") {
      activeUnresolvedListings += 1;
      activeUnresolvedUnits += qty;
    }
  }

  const activeListingCoverage =
    activeCardListings > 0 ? activeLinkedListings / activeCardListings : 0;
  const unitCoverage = activeCardUnits > 0 ? activeLinkedUnits / activeCardUnits : 0;

  // Reconcile 6830 vs 6394 style gaps
  const magicNotInAuditFilter = magicProductLine.filter((i) => !isMagicInventoryItem(i));
  const soldMagic = magicAudit.filter(isInventorySold);
  const withdrawnMagic = magicAudit.filter((i) => i.status === "withdrawn");

  const firestoreKeys = new Set(
    tcg.filter(isMagicCategory).map((i) => i.tcgplayerListingKey).filter(Boolean),
  );

  let csvKeysNotInFirestore = 0;
  let firestoreMagicNotInCsv = 0;
  if (csvPath && csvAnalysis) {
    const csvText = readFileSync(csvPath, "utf8");
    const { rows } = parseTcgplayerInventoryExportCsv(csvText);
    const csvMagicKeys = new Set(
      rows.filter((r) => r.category === "magic").map((r) => r.listingKey),
    );
    for (const key of csvMagicKeys) {
      if (!firestoreKeys.has(key)) csvKeysNotInFirestore += 1;
    }
    for (const key of firestoreKeys) {
      if (!csvMagicKeys.has(key)) firestoreMagicNotInCsv += 1;
    }
  }

  const liveMetrics = computeLiveInventoryMetrics(all, storeId);

  const report = {
    generatedAt: new Date().toISOString(),
    storeId,
    liveMetrics,
    auditSnapshotNote:
      "Figures in auditSnapshot are immutable for a specific CSV import. Use liveMetrics for operational dashboards.",
    sourceCsv: csvAnalysis,
    firestore: {
      totalInventoryDocuments: all.length,
      tcgplayerListingDocuments: tcg.length,
      catalogImportDocuments: catalog.length,
      magicAuditScope: magicAudit.length,
      magicByProductLine: magicProductLine.length,
      magicEnrichableSingles: magicEnrichable.length,
      sumQuantityOnHand: sumOnHand,
      sumQuantityReserved: sumReserved,
      sumQuantityCommitted: sumCommitted,
      sumQuantityAvailable: sumAvailable,
      listingsWithQuantityOnHandGt0: listingsOnHandGt0,
      listingsWithQuantityAvailableGt0: listingsAvailableGt0,
      soldMagicListings: soldMagic.length,
      withdrawnMagicListings: withdrawnMagic.length,
      magicExcludedByAuditFilter: magicNotInAuditFilter.length,
      magicExcludedReasons: summarizeExcluded(magicNotInAuditFilter),
    },
    customerBuckets: buckets,
    customerFacing: {
      activeSellableCardListings: activeCardListings,
      totalSellableCardUnits: activeCardUnits,
      activeListingsFullyLinkedToOracle: activeLinkedListings,
      sellableUnitsFullyLinkedToOracle: activeLinkedUnits,
      activeUnresolvedListings,
      sellableUnresolvedUnits: activeUnresolvedUnits,
      activeListingLinkageCoverage: {
        formula: `${activeLinkedListings}/${activeCardListings}`,
        pct: Math.round(activeListingCoverage * 10_000) / 100,
      },
      unitLinkageCoverage: {
        formula: `${activeLinkedUnits}/${activeCardUnits}`,
        pct: Math.round(unitCoverage * 10_000) / 100,
      },
      labels: {
        distinctSellableListings: activeCardListings,
        physicalSellableUnits: activeCardUnits,
      },
    },
    reconciliationNotes: {
      auditUsesMagicInventoryItem: true,
      magicProductLineVsAuditDelta: magicProductLine.length - magicAudit.length,
      sourceFileHash: csvPath
        ? createHash("sha256").update(readFileSync(csvPath)).digest("hex")
        : undefined,
      inventorySnapshotId: `snap-${storeId}-${new Date().toISOString().slice(0, 10)}`,
      inferredMissingFrom6830:
        csvAnalysis == null
          ? "Provide --csv to compute source CSV vs Firestore key diff"
          : {
              csvMagicUniqueKeys: csvAnalysis.magicUniqueListingKeys,
              firestoreMagicListings: magicAudit.length,
              delta: csvAnalysis.magicUniqueListingKeys - magicAudit.length,
              csvKeysNotInFirestore,
              firestoreKeysNotInCsv: firestoreMagicNotInCsv,
            },
    },
  };

  const outPath = resolve(process.cwd(), "reports", "inventory-source-reconciliation.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  // Preserve immutable audit snapshot separately when CSV reconciliation runs.
  if (csvPath && report.reconciliationNotes.sourceFileHash) {
    const snapshot: InventoryAuditSnapshot = {
      snapshotId: `inv-audit-${report.reconciliationNotes.sourceFileHash.slice(0, 16)}`,
      storeId: storeId as "the-game-lodge",
      sourceFile: csvPath.split(/[/\\]/).pop() ?? "TCGplayer__Pricing.csv",
      sourceFileHash: report.reconciliationNotes.sourceFileHash,
      inventorySnapshotId: report.reconciliationNotes.inventorySnapshotId!,
      generatedAt: report.generatedAt,
      figures: {
        sourceMagicListingRows: csvAnalysis?.magicUniqueListingKeys ?? 0,
        activeMagicListings: csvAnalysis?.magicActiveListings ?? 0,
        totalMagicUnits: csvAnalysis?.magicSumQuantityOnHand ?? 0,
        activeSellableCardListings: activeCardListings,
        activeSellableCardUnits: activeCardUnits,
        fullyLinkedSellableListings: activeLinkedListings,
        fullyLinkedSellableUnits: activeLinkedUnits,
        listingIdentityCoveragePct:
          Math.round(activeListingCoverage * 10_000) / 100,
        unitIdentityCoveragePct: Math.round(unitCoverage * 10_000) / 100,
        remainingUnresolved: {
          listings: activeUnresolvedListings,
          units: activeUnresolvedUnits,
        },
        remainingManualReview: {
          listings: buckets.manual_review.listings,
          units: buckets.manual_review.quantityAvailable,
        },
      },
      notes: [
        "Immutable audit snapshot for a specific CSV import — not live operational truth.",
      ],
    };
    const snapPath = resolve(process.cwd(), "reports", "inventory-audit-snapshot.json");
    writeFileSync(snapPath, JSON.stringify(snapshot, null, 2), "utf8");
    Object.assign(report, { auditSnapshot: snapshot });
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  } else {
    Object.assign(report, { auditSnapshot: loadInventoryAuditSnapshot() });
  }

  printReport(report);
  console.log(`\nReport: ${outPath}`);
}

function summarizeExcluded(items: InventoryItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const reason = !item.category && !isMagicProductLine(item.productLine)
      ? "no_magic_category"
      : item.status === "sold"
        ? "sold"
        : item.status === "withdrawn"
          ? "withdrawn"
          : "other";
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

function printReport(report: Awaited<ReturnType<typeof main>> extends void ? never : any) {
  console.log("\n=== Inventory Source Reconciliation ===\n");

  if (report.sourceCsv) {
    const c = report.sourceCsv;
    console.log("SOURCE CSV");
    console.log(`  CSV row count (incl header offset):     ${c.sourceCsvRowCount}`);
    console.log(`  Parsed rows:                          ${c.parsedRowCount}`);
    console.log(`  Skipped (no TCGplayer Id):            ${c.skippedNoTcgplayerId}`);
    console.log(`  Unique listing keys (all):            ${c.uniqueListingKeys}`);
    console.log(`  Rows merged by listing key:           ${c.rowsMergedByListingKey}`);
    console.log(`  Magic parsed rows:                    ${c.magicParsedRows}`);
    console.log(`  Magic unique listing keys:              ${c.magicUniqueListingKeys}`);
    console.log(`  Magic sum quantity (on hand):           ${c.magicSumQuantityOnHand}`);
    console.log(`  Magic active listings (qty>0):        ${c.magicActiveListings}`);
  } else {
    console.log("SOURCE CSV: not provided — use --csv=path/to/export.csv");
    console.log("  Latest import snapshot (from audit-inventory-totals): 8,285 Firestore rows, 4,761 units");
  }

  const f = report.firestore;
  console.log("\nFIRESTORE");
  console.log(`  Total inventory documents:            ${f.totalInventoryDocuments}`);
  console.log(`  TCGplayer listing documents:          ${f.tcgplayerListingDocuments}`);
  console.log(`  Magic (audit scope / isMagicInventoryItem): ${f.magicAuditScope}`);
  console.log(`  Magic (product line filter):          ${f.magicByProductLine}`);
  console.log(`  Magic enrichable singles:             ${f.magicEnrichableSingles}`);
  console.log(`  Sum quantityOnHand:                   ${f.sumQuantityOnHand}`);
  console.log(`  Sum quantityReserved:                 ${f.sumQuantityReserved}`);
  console.log(`  Sum quantityCommitted:                ${f.sumQuantityCommitted}`);
  console.log(`  Sum quantityAvailable:                ${f.sumQuantityAvailable}`);
  console.log(`  Listings with quantityOnHand > 0:     ${f.listingsWithQuantityOnHandGt0}`);
  console.log(`  Listings with quantityAvailable > 0:  ${f.listingsWithQuantityAvailableGt0}`);
  console.log(`  Magic excluded by audit filter:       ${f.magicExcludedByAuditFilter}`);

  console.log("\nCUSTOMER BUCKETS (magic audit scope, mutually exclusive)");
  for (const [k, v] of Object.entries(report.customerBuckets) as [BucketKey, BucketStats][]) {
    if (v.listings === 0) continue;
    console.log(`  ${k}: ${v.listings} listings, ${v.quantityAvailable} available qty`);
  }

  const cf = report.customerFacing;
  console.log("\nCUSTOMER-FACING METRICS (enrichable magic singles, qtyAvailable > 0)");
  console.log(`  Active sellable card listings:        ${cf.activeSellableCardListings} distinct listings`);
  console.log(`  Total sellable card units:            ${cf.totalSellableCardUnits} physical units`);
  console.log(`  Active listings fully linked:         ${cf.activeListingsFullyLinkedToOracle}`);
  console.log(`  Sellable units fully linked:          ${cf.sellableUnitsFullyLinkedToOracle}`);
  console.log(`  Active unresolved listings:           ${cf.activeUnresolvedListings}`);
  console.log(`  Sellable unresolved units:            ${cf.sellableUnresolvedUnits}`);
  console.log(`  Active-listing linkage coverage:      ${cf.activeListingLinkageCoverage.formula} (${cf.activeListingLinkageCoverage.pct}%)`);
  console.log(`  Unit linkage coverage:                ${cf.unitLinkageCoverage.formula} (${cf.unitLinkageCoverage.pct}%)`);

  const n = report.reconciliationNotes;
  console.log("\n6830 vs 6394 RECONCILIATION");
  console.log(`  Magic product-line count:             ${f.magicByProductLine}`);
  console.log(`  Magic audit-scope count:              ${f.magicAuditScope}`);
  console.log(`  Product-line minus audit delta:       ${n.magicProductLineVsAuditDelta}`);
  if (typeof n.inferredMissingFrom6830 === "object") {
    console.log(`  CSV magic unique keys:                ${n.inferredMissingFrom6830.csvMagicUniqueKeys}`);
    console.log(`  CSV keys not in Firestore:            ${n.inferredMissingFrom6830.csvKeysNotInFirestore}`);
    console.log(`  Firestore keys not in CSV:            ${n.inferredMissingFrom6830.firestoreKeysNotInCsv}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
