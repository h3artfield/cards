/**
 * Scryfall bulk → Firestore golden catalog import.
 * Run: npx tsx scripts/import-golden-catalog.ts [--dry-run] [--limit=N] [--force] [--datasets=oracle_cards,default_cards]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { runGoldenCatalogImport } from "../src/lib/deck-builder/golden-catalog/import-pipeline";
import { runGoldenCatalogAudit } from "../src/lib/deck-builder/golden-catalog/audit";

loadEnvLocal();

function parseArgs() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined;
  const datasetsArg = process.argv.find((a) => a.startsWith("--datasets="));
  const datasets = datasetsArg
    ? (datasetsArg
        .slice("--datasets=".length)
        .split(",")
        .filter(Boolean) as Array<"oracle_cards" | "default_cards" | "oracle_tags">)
    : undefined;
  return { dryRun, force, limit, datasets };
}

async function main() {
  const { dryRun, force, limit, datasets } = parseArgs();

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");

  const adminStatus = ensureFirebaseAdmin();
  if (!adminStatus.initialized || !isAdminConfigured()) {
    console.error("Firestore required for import. Run npm run firestore:health.");
    process.exit(1);
  }

  const db = await requireLocalFirestore("Firestore connect", () =>
    Promise.resolve(requireFirestore()),
  );

  console.log("Golden catalog import\n");
  console.log(`  dryRun: ${dryRun}`);
  console.log(`  force:  ${force}`);
  console.log(`  limit:  ${limit ?? "none"}`);
  console.log(`  datasets: ${datasets?.join(", ") ?? "all"}\n`);

  const run = await runGoldenCatalogImport({
    db,
    dryRun,
    force,
    limit,
    datasets,
    onProgress: (msg) => console.log(msg),
  });

  console.log("\nImport complete");
  console.log(`  runId: ${run.id}`);
  console.log(`  status: ${run.status}`);
  for (const ds of run.datasets) {
    console.log(
      `  ${ds.dataset}: rows=${ds.sourceRowCount} imported=${ds.importedCount} updated=${ds.updatedCount} failed=${ds.failedCount} skipped=${ds.skipped}${ds.skipReason ? ` (${ds.skipReason})` : ""}`,
    );
  }

  const reportPath = resolve(
    process.cwd(),
    "reports",
    `golden-catalog-import-${run.id}.json`,
  );
  mkdirSync(resolve(reportPath, ".."), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(run, null, 2), "utf8");
  console.log(`\nSync report: ${reportPath}`);

  if (!dryRun) {
    console.log("\nPost-import audit…");
    const audit = await runGoldenCatalogAudit({ db, skipBulkDownload: true });
    const auditPath = resolve(process.cwd(), "reports", "golden-catalog-post-import-audit.json");
    writeFileSync(auditPath, JSON.stringify(audit, null, 2), "utf8");
    console.log(`  oracle coverage: ${audit.coverage.oracleCardPct}%`);
    console.log(`  printing coverage: ${audit.coverage.printingPct}%`);
    console.log(`  audit: ${auditPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
