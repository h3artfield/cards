/**
 * Safe inventory → golden catalog re-link with dry-run audit.
 *
 *   npx tsx scripts/relink-inventory-catalog.ts --dry-run
 *   npx tsx scripts/relink-inventory-catalog.ts --apply
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  applyEnrichmentToInventoryItem,
  crosswalkFromEnrichment,
  enrichmentFromCatalog,
  resolveCatalogForEnrichment,
  type CatalogMatchMethod,
} from "../src/lib/deck-builder/inventory-catalog-enrichment";
import { getScryfallBulkIndex } from "../src/lib/deck-builder/scryfall-bulk-index";
import { upsertCatalogOracleFromPrinting } from "../src/lib/deck-builder/catalog-oracle-card";
import {
  isEnrichableMagicSingle,
  isMagicInventoryItem,
} from "../src/lib/inventory/magic-items";
import type { InventoryItem } from "../src/lib/types";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";

loadEnvLocal();

type LinkCategory =
  | "already_correctly_linked"
  | "exact_tcgplayer_id"
  | "exact_set_collector"
  | "exact_normalized_name"
  | "high_confidence_fuzzy"
  | "ambiguous"
  | "conflict"
  | "unresolved";

interface LinkAuditRow {
  inventoryItemId: string;
  productName?: string;
  category: LinkCategory;
  matchMethod?: CatalogMatchMethod;
  previousOracleId?: string;
  previousScryfallId?: string;
  proposedOracleId?: string;
  proposedScryfallId?: string;
  autoApply: boolean;
  reason?: string;
}

function categoryForMatch(
  method: CatalogMatchMethod,
  item: InventoryItem,
  proposedScryfallId: string,
  proposedOracleId?: string,
): { category: LinkCategory; autoApply: boolean; reason?: string } {
  const hasOracle = Boolean(item.catalogOracleId?.trim());
  const hasPrinting = Boolean(item.catalogScryfallId?.trim());
  const oracleMatch =
    !hasOracle || item.catalogOracleId!.trim() === (proposedOracleId ?? "");
  const printingMatch =
    !hasPrinting || item.catalogScryfallId!.trim() === proposedScryfallId;

  if (hasOracle && hasPrinting && oracleMatch && printingMatch) {
    return { category: "already_correctly_linked", autoApply: false };
  }

  if (hasPrinting && item.catalogScryfallId!.trim() !== proposedScryfallId) {
    return {
      category: "conflict",
      autoApply: false,
      reason: `Existing printing ${item.catalogScryfallId} differs from proposed ${proposedScryfallId}`,
    };
  }

  if (hasOracle && proposedOracleId && item.catalogOracleId!.trim() !== proposedOracleId) {
    return {
      category: "conflict",
      autoApply: false,
      reason: `Existing oracle ${item.catalogOracleId} differs from proposed ${proposedOracleId}`,
    };
  }

  switch (method) {
    case "tcgplayer_id":
      return { category: "exact_tcgplayer_id", autoApply: true };
    case "set_search":
      return { category: "exact_set_collector", autoApply: true };
    case "name_search":
      return { category: "exact_normalized_name", autoApply: false };
    case "name_fuzzy":
      return { category: "high_confidence_fuzzy", autoApply: false };
    case "manual":
      return { category: "ambiguous", autoApply: false };
    default:
      return { category: "ambiguous", autoApply: false };
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
  const started = Date.now();
  const { dataStore } = await import("../src/lib/storage/data-store");
  const { deckBuilderStore } = await import("../src/lib/deck-builder/deck-builder-store");

  const storeId = process.env.STORE_ID?.trim() || DEFAULT_STORE_ID;
  const items = await dataStore.getInventory(storeId);
  const magicItems = items.filter(isMagicInventoryItem);
  const enrichable = magicItems.filter(isEnrichableMagicSingle);

  const bulkIndex = await getScryfallBulkIndex();
  const existingCrosswalks = await deckBuilderStore.listCrosswalks(storeId);
  const crosswalkMap = new Map(existingCrosswalks.map((c) => [c.inventoryItemId, c]));

  const snapshot = enrichable.map((item) => ({
    inventoryItemId: item.id,
    productName: item.productName ?? item.displayName,
    catalogOracleId: item.catalogOracleId,
    catalogScryfallId: item.catalogScryfallId,
    catalogMatchMethod: item.catalogMatchMethod,
    tcgplayerProductId: item.tcgplayerProductId,
    setName: item.setName,
    cardNumber: item.cardNumber,
  }));

  const byCategory: Record<LinkCategory, LinkAuditRow[]> = {
    already_correctly_linked: [],
    exact_tcgplayer_id: [],
    exact_set_collector: [],
    exact_normalized_name: [],
    high_confidence_fuzzy: [],
    ambiguous: [],
    conflict: [],
    unresolved: [],
  };

  for (const item of enrichable) {
    const resolved = await resolveCatalogForEnrichment(item, { bulkIndex, apiFallback: false });
    if ("failure" in resolved) {
      byCategory.unresolved.push({
        inventoryItemId: item.id,
        productName: item.productName ?? item.displayName,
        category: "unresolved",
        previousOracleId: item.catalogOracleId,
        previousScryfallId: item.catalogScryfallId,
        autoApply: false,
        reason: resolved.failure,
      });
      continue;
    }

    const { catalog, matchMethod } = resolved;
    const { category, autoApply, reason } = categoryForMatch(
      matchMethod,
      item,
      catalog.id,
      catalog.oracleId,
    );

    byCategory[category].push({
      inventoryItemId: item.id,
      productName: item.productName ?? item.displayName,
      category,
      matchMethod,
      previousOracleId: item.catalogOracleId,
      previousScryfallId: item.catalogScryfallId,
      proposedOracleId: catalog.oracleId,
      proposedScryfallId: catalog.id,
      autoApply,
      reason,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "apply",
    storeId,
    durationMs: Date.now() - started,
    magicInventoryTotal: magicItems.length,
    enrichableTotal: enrichable.length,
    counts: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.length]),
    ),
    autoApplyEligible: Object.values(byCategory)
      .flat()
      .filter((r) => r.autoApply).length,
    manualReviewQueue: [
      ...byCategory.exact_normalized_name,
      ...byCategory.high_confidence_fuzzy,
      ...byCategory.ambiguous,
      ...byCategory.conflict,
    ],
    samples: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, v.slice(0, 20)]),
    ),
  };

  const ts = Date.now();
  const reportsDir = resolve(process.cwd(), "reports");
  mkdirSync(reportsDir, { recursive: true });

  const snapshotPath = resolve(reportsDir, `inventory-linkage-snapshot-${ts}.json`);
  writeFileSync(snapshotPath, JSON.stringify({ generatedAt: report.generatedAt, snapshot }, null, 2), "utf8");

  const reportPath = resolve(
    reportsDir,
    dryRun ? "inventory-relink-dry-run.json" : "inventory-relink-apply.json",
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`\nInventory relink ${dryRun ? "DRY-RUN" : "APPLY"}\n`);
  for (const [cat, count] of Object.entries(report.counts)) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`\nSnapshot: ${snapshotPath}`);
  console.log(`Report: ${reportPath}`);

  if (dryRun) return;

  let applied = 0;
  let skipped = 0;
  const applyRows = Object.values(byCategory)
    .flat()
    .filter((r) => r.autoApply && r.proposedScryfallId);

  for (const row of applyRows) {
    const item = enrichable.find((i) => i.id === row.inventoryItemId);
    if (!item || !row.proposedScryfallId) {
      skipped += 1;
      continue;
    }

    const resolved = await resolveCatalogForEnrichment(item, { bulkIndex, apiFallback: false });
    if ("failure" in resolved) {
      skipped += 1;
      continue;
    }

    const enrichment = enrichmentFromCatalog(resolved.catalog, resolved.matchMethod);
    await deckBuilderStore.saveCatalogCard(resolved.catalog);
    await upsertCatalogOracleFromPrinting({
      catalog: resolved.catalog,
      oracleTags: enrichment.oracleTags,
      getExistingOracle: (id) => deckBuilderStore.getCatalogOracleCard(id),
      saveOracle: (o) => deckBuilderStore.saveCatalogOracleCard(o),
    });
    const cw = crosswalkFromEnrichment({
      storeId,
      item,
      enrichment,
      existing: crosswalkMap.get(item.id),
    });
    await deckBuilderStore.saveCrosswalk(cw);
    crosswalkMap.set(item.id, cw);
    await dataStore.saveInventoryItem(applyEnrichmentToInventoryItem(item, enrichment));
    applied += 1;
  }

  const afterItems = (await dataStore.getInventory(storeId)).filter(isMagicInventoryItem);
  let withOracle = 0;
  let withPrinting = 0;
  let fullyLinked = 0;
  for (const item of afterItems) {
    if (item.catalogOracleId?.trim()) withOracle += 1;
    if (item.catalogScryfallId?.trim()) withPrinting += 1;
    if (item.catalogOracleId?.trim() && item.catalogScryfallId?.trim()) fullyLinked += 1;
  }

  const applySummary = {
    applied,
    skipped,
    oracleLinkFormula: `${withOracle}/${afterItems.length}`,
    printingLinkFormula: `${withPrinting}/${afterItems.length}`,
    fullLinkFormula: `${fullyLinked}/${afterItems.length}`,
    oracleLinkPct: Math.round((withOracle / afterItems.length) * 10_000) / 100,
    printingLinkPct: Math.round((withPrinting / afterItems.length) * 10_000) / 100,
    fullLinkPct: Math.round((fullyLinked / afterItems.length) * 10_000) / 100,
  };

  writeFileSync(
    reportPath,
    JSON.stringify({ ...report, applySummary }, null, 2),
    "utf8",
  );

  console.log("\nApply summary:");
  console.log(JSON.stringify(applySummary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
