/**
 * Directive 006R — PriceCharting CSV warehouse import.
 * Run: npm run prices:import:pricecharting-csv -- --file path/to.csv [--date YYYY-MM-DD] [--dry-run] [--limit N] [--category mtg|pokemon|sports|all]
 */
import { readFileSync } from "fs";
import { resolve, basename } from "path";
import { importPriceChartingCsv } from "../src/lib/prices/pricecharting-csv-import";
import { priceWarehouseStore } from "../src/lib/prices/price-warehouse-store";
import type { CardPriceSnapshotCategory } from "../src/lib/prices/types";

function loadEnvLocal() {
  try {
    const p = resolve(__dirname, "../.env.local");
    const text = readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

type CliOptions = {
  file?: string;
  date: string;
  dryRun: boolean;
  limit?: number;
  category: CardPriceSnapshotCategory | "all";
  force: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    date: new Date().toISOString().slice(0, 10),
    dryRun: false,
    category: "all",
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--file" && argv[i + 1]) {
      opts.file = argv[++i];
    } else if (arg === "--date" && argv[i + 1]) {
      opts.date = argv[++i]!;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--limit" && argv[i + 1]) {
      opts.limit = parseInt(argv[++i]!, 10);
    } else if (arg === "--category" && argv[i + 1]) {
      opts.category = argv[++i]! as CliOptions["category"];
    } else if (arg === "--force") {
      opts.force = true;
    }
  }
  return opts;
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.file) {
    console.error(
      "Usage: npm run prices:import:pricecharting-csv -- --file path/to.csv [--date YYYY-MM-DD] [--dry-run] [--limit N] [--category mtg|pokemon|sports|all] [--force]",
    );
    process.exit(1);
  }

  const filePath = resolve(opts.file);
  const fileName = basename(filePath);
  const fileText = readFileSync(filePath, "utf8");

  if (!opts.force && !opts.dryRun) {
    const already = await priceWarehouseStore.hasSuccessfulImportForDate(
      opts.date,
      opts.category === "all" ? undefined : opts.category,
      fileName,
    );
    if (already) {
      console.error(
        `Import already succeeded for ${opts.date} category=${opts.category} file=${fileName}. Use --force to override.`,
      );
      process.exit(1);
    }
  }

  const { prepareCategoryImportContext } = await import(
    "../src/lib/prices/prepare-import-context"
  );
  const identityContext = await prepareCategoryImportContext(opts.category, fileText);

  const result = importPriceChartingCsv({
    fileText,
    fileName,
    capturedDate: opts.date,
    dryRun: opts.dryRun,
    limit: opts.limit,
    category: opts.category,
    identityContext,
  });

  console.log("PriceCharting CSV import");
  console.log(`  file: ${fileName}`);
  console.log(`  date: ${opts.date}`);
  console.log(`  dry-run: ${opts.dryRun}`);
  console.log(`  rows read: ${result.run.rowsRead}`);
  console.log(`  cataloged: ${result.run.rowsCataloged ?? result.products.length}`);
  console.log(`  snapshots imported: ${result.run.rowsImported}`);
  console.log(`  skipped: ${result.run.rowsSkipped}`);
  console.log(`  rejected (no exact snapshot): ${result.run.rowsRejected}`);
  console.log(`  identity risk: ${result.run.identityRiskCount}`);

  if (opts.dryRun) {
    console.log("\nDry run — nothing written.");
    process.exit(0);
  }

  try {
    result.run.importCategory =
      opts.category === "all" ? undefined : opts.category;
    await priceWarehouseStore.saveImportRun(result.run);
    const productsWritten = await priceWarehouseStore.upsertProducts(
      result.products,
    );
    const snapResult = await priceWarehouseStore.saveSnapshots(result.snapshots);
    console.log(`\nPersisted ${productsWritten} current products`);
    console.log(
      `Snapshots: ${snapResult.written} written, ${snapResult.skipped} deduped`,
    );
    console.log(`Import run id: ${result.run.id}`);
  } catch (err) {
    result.run.status = "failed";
    result.run.finishedAt = new Date().toISOString();
    result.run.errors.push(err instanceof Error ? err.message : String(err));
    await priceWarehouseStore.saveImportRun(result.run);
    console.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
