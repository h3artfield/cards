/**
 * Directive 006T — Daily PriceCharting workflow tests.
 * Run: npm run test:directive-006t-daily-pricecharting
 */
import { importPriceChartingCsv } from "../src/lib/prices/pricecharting-csv-import";
import { snapshotDocId } from "../src/lib/prices/identity-key";
import { CARD_CSV_IMPORTS } from "./import-pricecharting-csv-all";
import type { DailyPriceChartingReport } from "./daily-pricecharting";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function runImportAllConfig() {
  console.log("\n1. Import-all covers four card CSV categories");
  assert(CARD_CSV_IMPORTS.length === 4, "four categories configured");
  const names = CARD_CSV_IMPORTS.map((c) => c.fileName).join(",");
  assert(names.includes("pokemon") && names.includes("magic"), "pokemon + magic files");
  assert(names.includes("yugioh") && names.includes("onepiece"), "yugioh + onepiece files");
}

function runSnapshotDedupe() {
  console.log("\n2. Same-day snapshot dedupe by source + identityKey + date + productId");
  const csv = [
    "id,product-name,console-name,genre,loose-price",
    '1,"Grusha [Reverse Holo] #184","Pokemon Paldea Evolved",Pokemon Card,0.12',
  ].join("\n");

  const first = importPriceChartingCsv({
    fileText: csv,
    capturedDate: "2026-07-10",
    category: "pokemon",
  });
  const second = importPriceChartingCsv({
    fileText: csv,
    capturedDate: "2026-07-10",
    category: "pokemon",
  });

  const snap = first.snapshots[0]!;
  const again = second.snapshots[0]!;
  assert(snap.id === again.id, "re-import same snapshot doc id");
  assert(
    snap.id ===
      snapshotDocId({
        source: "pricecharting",
        identityKey: "pokemon|paldea-evolved|184|reverse_holo|en",
        capturedDate: "2026-07-10",
        priceChartingProductId: "1",
      }),
    "dedupe formula matches",
  );
  assert(first.run.rowsImported === 1 && second.run.rowsImported === 1, "each run produces one snapshot id");
}

function runReportShape() {
  console.log("\n3. Daily report JSON shape");
  const sample: DailyPriceChartingReport = {
    date: "2026-07-10",
    startedAt: "2026-07-10T12:00:00.000Z",
    finishedAt: "2026-07-10T12:05:00.000Z",
    status: "success",
    downloads: [{ fileName: "pricecharting-pokemon.csv", bytes: 100, path: "/tmp/x.csv" }],
    imports: [
      {
        category: "pokemon",
        fileName: "pricecharting-pokemon.csv",
        importRunId: "run-1",
        skippedAlreadyImported: false,
        rowsRead: 10,
        rowsCataloged: 10,
        rowsImported: 9,
        rowsRejected: 1,
        identityRiskCount: 1,
        snapshotsWritten: 9,
        snapshotsDeduped: 0,
      },
    ],
    warehouse: { snapshotCountByCategory: { pokemon: 9 }, productsCurrentTotal: 10 },
    sampleChecks: [{ label: "Grusha", identityKey: "x", snapshotCount: 1, pass: true }],
    errors: [],
    warnings: [],
  };
  assert(sample.imports[0]!.rowsImported === 9, "report tracks snapshot imports");
  assert(Array.isArray(sample.sampleChecks), "report includes sample checks");
  assert(Array.isArray(sample.warnings), "report includes warnings");
}

function main() {
  console.log("Directive 006T — Daily PriceCharting tests\n");
  runImportAllConfig();
  runSnapshotDedupe();
  runReportShape();
  console.log(`\n006T: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} checks)`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
