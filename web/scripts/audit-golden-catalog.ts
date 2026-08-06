/**
 * Baseline audit for golden catalog completeness vs Scryfall bulk.
 * Run: npx tsx scripts/audit-golden-catalog.ts [--skip-bulk]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { runGoldenCatalogAudit } from "../src/lib/deck-builder/golden-catalog/audit";

loadEnvLocal();

async function main() {
  const skipBulk = process.argv.includes("--skip-bulk");
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const outPath =
    outArg?.slice("--out=".length) ??
    resolve(process.cwd(), "reports", "golden-catalog-audit.json");

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");

  const adminStatus = ensureFirebaseAdmin();
  let db = null;
  if (adminStatus.initialized && isAdminConfigured()) {
    db = await requireLocalFirestore("Firestore connect", () =>
      Promise.resolve(requireFirestore()),
    );
  }

  console.log("Golden catalog audit\n");
  console.log(`Firestore: ${db ? "connected" : "unavailable"}`);
  console.log(`Bulk download: ${skipBulk ? "skipped" : "enabled"}\n`);

  const report = await runGoldenCatalogAudit({ db, skipBulkDownload: skipBulk });

  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Counts");
  console.log(`  catalogOracleCards: ${report.counts.catalogOracleCards.toLocaleString()}`);
  console.log(`  catalogPrintings:   ${report.counts.catalogPrintings.toLocaleString()}`);
  console.log(`  magic inventory:    ${report.counts.inventoryMagicListings.toLocaleString()}`);
  console.log(`  inv → oracle link:  ${report.counts.inventoryWithOracleId.toLocaleString()} (${report.coverage.inventoryOracleLinkPct}%)`);
  console.log(`  inv → printing link:${report.counts.inventoryWithScryfallId.toLocaleString()} (${report.coverage.inventoryPrintingLinkPct}%)`);

  console.log("\nBulk expected");
  console.log(`  oracle_cards:    ${report.bulkExpected.oracleCards?.toLocaleString() ?? "?"}`);
  console.log(`  default_cards:   ${report.bulkExpected.defaultCardsPaper?.toLocaleString() ?? "?"}`);

  console.log("\nCoverage");
  console.log(`  oracle cards:  ${report.coverage.oracleCardPct}%`);
  console.log(`  printings:     ${report.coverage.printingPct}%`);
  console.log(`  oracle tags:   ${report.coverage.oracleTagPct}%`);

  console.log("\nStorage estimate");
  console.log(`  total ~${report.storageEstimate.estimatedTotalMb} MB`);
  console.log(`  full import writes ~${report.storageEstimate.estimatedWriteOpsFullImport.toLocaleString()}`);

  if (report.gaps.length) {
    console.log("\nGaps");
    for (const gap of report.gaps) console.log(`  - ${gap}`);
  }

  if (report.lastImportRun) {
    console.log("\nLast import run");
    console.log(`  id: ${report.lastImportRun.id}`);
    console.log(`  status: ${report.lastImportRun.status}`);
    for (const ds of report.lastImportRun.datasets) {
      console.log(
        `  ${ds.dataset}: imported=${ds.importedCount} updated=${ds.updatedCount} failed=${ds.failedCount} skipped=${ds.skipped}`,
      );
    }
  }

  console.log(`\nReport written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
