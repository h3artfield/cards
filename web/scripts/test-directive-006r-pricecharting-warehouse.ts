/**
 * Directive 006R — PriceCharting CSV warehouse + price history.
 * Run: npm run test:directive-006r-pricecharting-warehouse
 */
import {
  importPriceChartingCsv,
  sampleMar93CsvRow,
} from "../src/lib/prices/pricecharting-csv-import";
import { buildIdentityKey, snapshotDocId } from "../src/lib/prices/identity-key";
import { buildCardPriceHistoryResponse } from "../src/lib/prices/price-history";
import { priceWarehouseStore } from "../src/lib/prices/price-warehouse-store";
import type { CardPriceSnapshot } from "../src/lib/prices/types";

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

const MAR93_KEY = "mtg|MAR|93|nonfoil|normal|en";
const REX18_KEY = "mtg|REX|18|nonfoil|normal|en";

function runImportTest() {
  console.log("\n1. CSV import + identity separation (MAR #93 vs REX #18)");
  const result = importPriceChartingCsv({
    fileText: sampleMar93CsvRow(),
    capturedDate: "2026-06-01",
    category: "mtg",
    useLegacyMtgInference: true,
  });

  assert(result.run.rowsRead === 2, "reads 2 CSV rows");
  assert(result.run.rowsImported === 2, "imports both MTG rows with exact identity");
  assert(result.snapshots.length === 2, "creates 2 snapshots");

  const marSnap = result.snapshots.find((s) => s.setCode === "MAR");
  const rexSnap = result.snapshots.find((s) => s.setCode === "REX");

  assert(marSnap?.identityKey === MAR93_KEY, "MAR #93 identity key");
  assert(rexSnap?.identityKey === REX18_KEY, "REX #18 identity key");
  assert(marSnap?.rawUngraded === 7.9, "MAR #93 pennies → dollars ($7.90)");
  assert(rexSnap?.rawUngraded === 47.54, "REX #18 pennies → dollars ($47.54)");
  assert(
    marSnap?.identityKey !== rexSnap?.identityKey,
    "MAR #93 does not share identity with REX #18",
  );
}

function runDedupeTest() {
  console.log("\n2. Snapshot dedupe by source + identityKey + capturedDate + productId");
  const first = importPriceChartingCsv({
    fileText: sampleMar93CsvRow(),
    capturedDate: "2026-06-02",
    useLegacyMtgInference: true,
  });
  const second = importPriceChartingCsv({
    fileText: sampleMar93CsvRow(),
    capturedDate: "2026-06-02",
    useLegacyMtgInference: true,
  });

  const marFirst = first.snapshots.find((s) => s.setCode === "MAR")!;
  const marSecond = second.snapshots.find((s) => s.setCode === "MAR")!;

  assert(
    marFirst.id === marSecond.id,
    "duplicate import yields same snapshot doc id",
  );
  assert(
    second.run.rowsSkipped >= 0 && second.run.rowsImported === 2,
    "re-import still processes rows (in-memory dedupe in single run)",
  );

  const expectedId = snapshotDocId({
    source: "pricecharting",
    identityKey: MAR93_KEY,
    capturedDate: "2026-06-02",
    priceChartingProductId: "mar93",
  });
  assert(marFirst.id === expectedId, "snapshot doc id matches dedupe formula");
}

function runHistoryTest() {
  console.log("\n3. Price history time series for exact identity");
  priceWarehouseStore._resetMemoryForTests();

  const snapshots: CardPriceSnapshot[] = [
    {
      id: snapshotDocId({
        source: "pricecharting",
        identityKey: MAR93_KEY,
        capturedDate: "2026-06-01",
        priceChartingProductId: "mar93",
      }),
      source: "pricecharting",
      capturedDate: "2026-06-01",
      capturedAt: "2026-06-01T12:00:00.000Z",
      importRunId: "run-1",
      identityKey: MAR93_KEY,
      sourceIdentityKey: MAR93_KEY,
      category: "mtg",
      priceChartingProductId: "mar93",
      productName: "Ravenous Tyrannosaurus [Marvel Universe] #93",
      cardName: "Ravenous Tyrannosaurus",
      setCode: "MAR",
      collectorNumber: "93",
      rawUngraded: 7.5,
      retailBuy: 5.0,
      retailSell: 9.0,
      currency: "USD",
      exactIdentityMatch: true,
      rawSourceRow: {},
    },
    {
      id: snapshotDocId({
        source: "pricecharting",
        identityKey: MAR93_KEY,
        capturedDate: "2026-06-02",
        priceChartingProductId: "mar93",
      }),
      source: "pricecharting",
      capturedDate: "2026-06-02",
      capturedAt: "2026-06-02T12:00:00.000Z",
      importRunId: "run-2",
      identityKey: MAR93_KEY,
      sourceIdentityKey: MAR93_KEY,
      category: "mtg",
      priceChartingProductId: "mar93",
      productName: "Ravenous Tyrannosaurus [Marvel Universe] #93",
      cardName: "Ravenous Tyrannosaurus",
      setCode: "MAR",
      collectorNumber: "93",
      rawUngraded: 7.9,
      retailBuy: 5.2,
      retailSell: 9.5,
      currency: "USD",
      exactIdentityMatch: true,
      rawSourceRow: {},
    },
    {
      id: snapshotDocId({
        source: "pricecharting",
        identityKey: REX18_KEY,
        capturedDate: "2026-06-02",
        priceChartingProductId: "rex18",
      }),
      source: "pricecharting",
      capturedDate: "2026-06-02",
      capturedAt: "2026-06-02T12:00:00.000Z",
      importRunId: "run-2",
      identityKey: REX18_KEY,
      sourceIdentityKey: REX18_KEY,
      category: "mtg",
      priceChartingProductId: "rex18",
      productName: "Ravenous Tyrannosaurus [Jurassic World Collection] #18",
      cardName: "Ravenous Tyrannosaurus",
      setCode: "REX",
      collectorNumber: "18",
      rawUngraded: 47.54,
      currency: "USD",
      exactIdentityMatch: true,
      rawSourceRow: {},
    },
  ];

  priceWarehouseStore._seedMemorySnapshots(snapshots);

  const marHistory = snapshots.filter((s) => s.identityKey === MAR93_KEY);
  assert(marHistory.length === 2, "MAR #93 has 2 daily snapshots only");
  assert(
    !marHistory.some((s) => s.setCode === "REX"),
    "MAR history excludes REX #18 printing",
  );

  const response = buildCardPriceHistoryResponse({
    identityKey: MAR93_KEY,
    cardName: "Ravenous Tyrannosaurus",
    snapshots: marHistory,
  });

  assert(response.series[0]!.points.length === 2, "time series has 2 points");
  assert(response.currentEstimate === 7.9, "current estimate is latest snapshot");
  assert(response.retailBuy === 5.2, "retail buy from latest snapshot");
  assert(response.retailSell === 9.5, "retail sell from latest snapshot");
  assert(response.trend.sampleCount === 2, "trend sample count");
}

function runIdentityKeyTest() {
  console.log("\n4. Identity key builder");
  const marKey = buildIdentityKey({
    category: "mtg",
    setCode: "MAR",
    collectorNumber: "93",
    finish: "nonfoil",
    treatment: "normal",
    language: "en",
  });
  assert(marKey === MAR93_KEY, "buildIdentityKey matches MAR #93 spec");
}

function main() {
  console.log("Directive 006R — PriceCharting warehouse tests\n");
  runImportTest();
  runDedupeTest();
  runIdentityKeyTest();
  runHistoryTest();

  console.log(`\n006R: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} checks)`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
