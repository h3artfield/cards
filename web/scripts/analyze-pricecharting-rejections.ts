/**
 * Directive 006S — PriceCharting CSV rejection analysis.
 * Run: npm run prices:analyze:pricecharting-rejections -- --category mtg --top 200
 */
import { readFileSync } from "fs";
import { resolve, basename } from "path";
import {
  buildIdentityKey,
  inferCategoryFromPcRow,
  inferIdentityFromPriceChartingRow,
} from "../src/lib/prices/identity-key";
import {
  normalizedRowToProductFields,
  parseCsvText,
  rowToNormalizedRecord,
} from "../src/lib/prices/pricecharting-csv-parser";
import { prepareCategoryImportContext } from "../src/lib/prices/prepare-import-context";
import type { CardPriceSnapshotCategory } from "../src/lib/prices/types";

type CliOptions = {
  file?: string;
  category: CardPriceSnapshotCategory;
  top: number;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { category: "mtg", top: 200 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--file" && argv[i + 1]) opts.file = argv[++i];
    else if (arg === "--category" && argv[i + 1]) {
      opts.category = argv[++i]! as CardPriceSnapshotCategory;
    } else if (arg === "--top" && argv[i + 1]) opts.top = parseInt(argv[++i]!, 10);
  }
  return opts;
}

function defaultFile(category: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return resolve(
    __dirname,
    `../../data/pricecharting/raw/${date}/pricecharting-${category === "mtg" ? "magic" : category}.csv`,
  );
}

function bump(map: Map<string, number>, key: string, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const filePath = resolve(opts.file ?? defaultFile(opts.category));
  const fileText = readFileSync(filePath, "utf8");
  console.log(`Analyzing rejections: ${basename(filePath)} category=${opts.category}\n`);

  const context =
    opts.category === "mtg"
      ? await prepareCategoryImportContext("mtg", fileText, { preloadPlst: false })
      : undefined;

  const consolePatterns = new Map<string, number>();
  const productPatterns = new Map<string, number>();
  const reasonCounts = new Map<string, number>();
  const samples: Array<{
    productName: string;
    consoleName: string;
    reason: string;
  }> = [];

  let total = 0;
  let accepted = 0;
  let rejected = 0;

  for (const row of parseCsvText(fileText)) {
    const raw = rowToNormalizedRecord(row);
    const fields = normalizedRowToProductFields(raw);
    if (!fields) continue;

    const cat = inferCategoryFromPcRow(fields.genre, fields.consoleName);
    if (cat !== opts.category) continue;

    total++;
    const inferred = inferIdentityFromPriceChartingRow(
      {
        productName: fields.productName,
        consoleName: fields.consoleName,
        genre: fields.genre,
      },
      context,
    );

    const identityKey = buildIdentityKey(inferred);
    if (inferred.exactIdentityMatch && identityKey) {
      accepted++;
      continue;
    }

    rejected++;
    const reason = inferred.rejectedReason ?? "identity_key_null";
    bump(reasonCounts, reason);

    const consoleKey = (fields.consoleName ?? "(empty)").slice(0, 80);
    bump(consolePatterns, consoleKey);

    const productKey = fields.productName
      .replace(/\[.*?\]/g, "[…]")
      .replace(/#\d+/g, "#N")
      .slice(0, 80);
    bump(productPatterns, productKey);

    if (samples.length < opts.top) {
      samples.push({
        productName: fields.productName,
        consoleName: fields.consoleName ?? "",
        reason,
      });
    }
  }

  console.log("Summary:");
  console.log(`  total ${opts.category} rows: ${total}`);
  console.log(`  would import (exact): ${accepted}`);
  console.log(`  rejected: ${rejected}`);
  console.log(`  coverage: ${total ? ((accepted / total) * 100).toFixed(1) : 0}%`);

  console.log("\nTop rejection reasons:");
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${count.toString().padStart(7)}  ${reason}`);
  }

  console.log(`\nTop unresolved console-name patterns (top ${opts.top}):`);
  for (const [pattern, count] of [...consolePatterns.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.top)) {
    console.log(`  ${count.toString().padStart(7)}  ${pattern}`);
  }

  console.log(`\nTop unresolved product-name patterns (top 30):`);
  for (const [pattern, count] of [...productPatterns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`  ${count.toString().padStart(7)}  ${pattern}`);
  }

  console.log(`\nSample rejected rows (first ${Math.min(20, samples.length)}):`);
  for (const s of samples.slice(0, 20)) {
    console.log(`  [${s.reason}] ${s.consoleName} | ${s.productName}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
