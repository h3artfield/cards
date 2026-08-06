/**
 * Apply deterministic/manual review decisions to the active inventory queue.
 * Run: npx tsx scripts/apply-inventory-review-queue.ts [--dry-run]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";
import {
  classifyInventoryLinkStatus,
  isClerkEligibleInventory,
} from "../src/lib/inventory/catalog-link-identity";
import {
  computeLiveInventoryMetrics,
  loadInventoryAuditSnapshot,
} from "../src/lib/inventory/inventory-audit-snapshot";
import {
  applyReviewDecisionToItem,
  decideInventoryReviewItem,
  loadBulkIndexForReview,
} from "../src/lib/inventory/inventory-identity-review";
import {
  isEnrichableMagicSingle,
  isMagicInventoryItem,
} from "../src/lib/inventory/magic-items";
import { inventoryQuantityAvailable } from "../src/lib/inventory/status";
import { deckBuilderStore } from "../src/lib/deck-builder/deck-builder-store";

loadEnvLocal();

const REVIEWER = "inventory-review-queue-v1";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const started = Date.now();
  const storeId = process.env.STORE_ID?.trim() || DEFAULT_STORE_ID;
  const { dataStore } = await import("../src/lib/storage/data-store");

  const index = await loadBulkIndexForReview();
  const all = await dataStore.getInventory(storeId);

  const queue = all.filter((item) => {
    if (!isMagicInventoryItem(item) || !isEnrichableMagicSingle(item)) return false;
    if (inventoryQuantityAvailable(item) <= 0) return false;
    const { category } = classifyInventoryLinkStatus(item);
    return (
      category === "unresolved" ||
      category === "manual_review_candidate" ||
      category === "ambiguous" ||
      category === "conflict"
    );
  });

  queue.sort((a, b) => {
    const qtyDiff = inventoryQuantityAvailable(b) - inventoryQuantityAvailable(a);
    if (qtyDiff !== 0) return qtyDiff;
    return (b.listPrice ?? 0) - (a.listPrice ?? 0);
  });

  const decisions = [];
  const outcomeTotals: Record<string, { listings: number; units: number }> = {};

  for (const item of queue) {
    const decision = await decideInventoryReviewItem(item, index, REVIEWER);
    decisions.push({
      ...decision,
      quantityAvailable: inventoryQuantityAvailable(item),
      listPrice: item.listPrice,
    });

    const bucket = outcomeTotals[decision.outcome] ?? { listings: 0, units: 0 };
    bucket.listings += 1;
    bucket.units += inventoryQuantityAvailable(item);
    outcomeTotals[decision.outcome] = bucket;

    if (!dryRun && decision.applied) {
      await applyReviewDecisionToItem(item, decision, index, {
        storeId,
        saveInventoryItem: (i) => dataStore.saveInventoryItem(i),
        saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
        saveCatalogOracleCard: (o) => deckBuilderStore.saveCatalogOracleCard(o),
        getCatalogOracleCard: (id) => deckBuilderStore.getCatalogOracleCard(id),
        saveCrosswalk: (x) => deckBuilderStore.saveCrosswalk(x),
      });
    }
  }

  const refreshed = dryRun ? all : await dataStore.getInventory(storeId);
  const liveMetrics = computeLiveInventoryMetrics(refreshed, storeId);
  const auditSnapshot = loadInventoryAuditSnapshot();

  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    dryRun,
    storeId,
    reviewer: REVIEWER,
    queueProcessed: queue.length,
    unitsProcessed: queue.reduce((s, i) => s + inventoryQuantityAvailable(i), 0),
    outcomeTotals,
    decisions,
    auditSnapshot,
    liveMetricsAfterReview: liveMetrics,
    failClosedNote:
      "token_product, composite_product, identity_conflict, and unresolved rows remain excluded from clerk recommendations.",
  };

  const outPath = resolve(process.cwd(), "reports", "inventory-manual-review-results.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\nInventory review queue applied\n");
  console.log(`  Processed: ${report.queueProcessed} listings / ${report.unitsProcessed} units`);
  console.log(`  Outcomes:`, outcomeTotals);
  console.log(`  Live listing coverage: ${liveMetrics.listingIdentityCoveragePct}%`);
  console.log(`  Live unit coverage:    ${liveMetrics.unitIdentityCoveragePct}%`);
  console.log(`\nReport: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
