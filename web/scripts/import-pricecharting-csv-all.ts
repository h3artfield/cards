/**
 * Import all four PriceCharting card CSVs for a date.
 * Run: npm run prices:import:pricecharting-csv:all -- [--date YYYY-MM-DD] [--force] [--dry-run]
 */
import { readFileSync, existsSync } from "fs";
import { resolve, basename } from "path";
import { importPriceChartingCsv } from "../src/lib/prices/pricecharting-csv-import";
import { priceWarehouseStore } from "../src/lib/prices/price-warehouse-store";
import { prepareCategoryImportContext } from "../src/lib/prices/prepare-import-context";
import type { CardPriceSnapshotCategory } from "../src/lib/prices/types";
import type { PriceChartingImportRun } from "../src/lib/prices/types";

export type CategoryImportSpec = {
  fileName: string;
  importCategory: CardPriceSnapshotCategory;
  label: string;
};

export const CARD_CSV_IMPORTS: CategoryImportSpec[] = [
  { fileName: "pricecharting-pokemon.csv", importCategory: "pokemon", label: "Pokémon" },
  { fileName: "pricecharting-magic.csv", importCategory: "mtg", label: "Magic" },
  { fileName: "pricecharting-yugioh.csv", importCategory: "yugioh", label: "Yu-Gi-Oh" },
  { fileName: "pricecharting-onepiece.csv", importCategory: "onepiece", label: "One Piece" },
];

export function loadEnvLocal() {
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

export type CategoryImportResult = {
  spec: CategoryImportSpec;
  run: PriceChartingImportRun;
  productsWritten: number;
  snapshotsWritten: number;
  snapshotsDeduped: number;
  skippedAlreadyImported: boolean;
};

export type ImportAllOptions = {
  date: string;
  force?: boolean;
  dryRun?: boolean;
  rawDir?: string;
};

export async function importAllPriceChartingCsvs(
  options: ImportAllOptions,
): Promise<CategoryImportResult[]> {
  const rawDir =
    options.rawDir ?? resolve(__dirname, "../../data/pricecharting/raw", options.date);
  const results: CategoryImportResult[] = [];

  for (const spec of CARD_CSV_IMPORTS) {
    const filePath = resolve(rawDir, spec.fileName);
    if (!existsSync(filePath)) {
      throw new Error(`Missing CSV: ${filePath}`);
    }

    const fileName = basename(filePath);
    const fileText = readFileSync(filePath, "utf8");

    if (!options.force && !options.dryRun) {
      const already = await priceWarehouseStore.hasSuccessfulImportForDate(
        options.date,
        spec.importCategory,
        fileName,
      );
      if (already) {
        results.push({
          spec,
          run: {
            id: "skipped",
            source: "pricecharting_csv",
            startedAt: new Date().toISOString(),
            status: "success",
            fileName,
            capturedDate: options.date,
            rowsRead: 0,
            rowsImported: 0,
            rowsCataloged: 0,
            rowsSkipped: 0,
            rowsRejected: 0,
            identityRiskCount: 0,
            errors: [],
            importCategory: spec.importCategory,
          },
          productsWritten: 0,
          snapshotsWritten: 0,
          snapshotsDeduped: 0,
          skippedAlreadyImported: true,
        });
        continue;
      }
    }

    const identityContext =
      spec.importCategory === "mtg"
        ? await prepareCategoryImportContext("mtg", fileText)
        : undefined;

    const result = importPriceChartingCsv({
      fileText,
      fileName,
      capturedDate: options.date,
      dryRun: options.dryRun,
      category: spec.importCategory,
      identityContext,
    });

    result.run.importCategory = spec.importCategory;

    if (options.dryRun) {
      results.push({
        spec,
        run: result.run,
        productsWritten: 0,
        snapshotsWritten: 0,
        snapshotsDeduped: 0,
        skippedAlreadyImported: false,
      });
      continue;
    }

    await priceWarehouseStore.saveImportRun(result.run);
    const productsWritten = await priceWarehouseStore.upsertProducts(result.products);
    const snapResult = await priceWarehouseStore.saveSnapshots(result.snapshots);

    results.push({
      spec,
      run: result.run,
      productsWritten,
      snapshotsWritten: snapResult.written,
      snapshotsDeduped: snapResult.skipped,
      skippedAlreadyImported: false,
    });
  }

  return results;
}

type CliOptions = {
  date: string;
  force: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    date: new Date().toISOString().slice(0, 10),
    force: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--date" && argv[i + 1]) opts.date = argv[++i]!;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));

  console.log(`PriceCharting import-all — ${opts.date}`);
  const results = await importAllPriceChartingCsvs(opts);

  for (const r of results) {
    if (r.skippedAlreadyImported) {
      console.log(`\n${r.spec.label}: skipped (already imported for ${opts.date})`);
      continue;
    }
    console.log(`\n${r.spec.label} (${r.spec.fileName})`);
    console.log(`  run id: ${r.run.id}`);
    console.log(`  rows read: ${r.run.rowsRead}`);
    console.log(`  cataloged: ${r.run.rowsCataloged ?? 0}`);
    console.log(`  snapshots: ${r.run.rowsImported}`);
    console.log(`  rejected: ${r.run.rowsRejected}`);
    console.log(`  identity risk: ${r.run.identityRiskCount}`);
    console.log(`  persisted products: ${r.productsWritten}`);
    console.log(`  snapshots written/deduped: ${r.snapshotsWritten}/${r.snapshotsDeduped}`);
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("import-pricecharting-csv-all");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
