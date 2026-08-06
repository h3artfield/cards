/**
 * Directive 006V — PriceCharting daily monitoring + health checks.
 * Run: npm run test:directive-006v-pricecharting-monitoring
 */
import {
  evaluatePriceChartingImportHealth,
  missingPriceChartingCsvSecrets,
  resolveDailyReportStatus,
  PRICECHARTING_CSV_SECRET_KEYS,
} from "../src/lib/prices/pricecharting-import-health";
import type { PriceChartingDailyReport } from "../src/lib/prices/types";

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

function runMissingSecrets() {
  console.log("\n1. Missing CSV URL secrets are detected");
  const saved: Record<string, string | undefined> = {};
  for (const key of PRICECHARTING_CSV_SECRET_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  assert(missingPriceChartingCsvSecrets().length === 4, "all four secrets missing when unset");
  process.env.PRICECHARTING_CSV_POKEMON_URL = "http://example.com/p.csv";
  assert(missingPriceChartingCsvSecrets().length === 3, "partial secret set detected");
  for (const key of PRICECHARTING_CSV_SECRET_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function runImportDropWarning() {
  console.log("\n2. rowsImported drop >20% emits warning");
  const previous: PriceChartingDailyReport = {
    date: "2026-07-04",
    startedAt: "",
    finishedAt: "",
    status: "success",
    downloads: [],
    imports: [{ category: "pokemon", importRunId: "r1", rowsRead: 1000, rowsImported: 1000, rowsRejected: 10 }],
    warehouse: { snapshotCountByCategory: {}, productsCurrentTotal: 0 },
    sampleChecks: [],
    warnings: [],
    errors: [],
  };
  const health = evaluatePriceChartingImportHealth({
    date: "2026-07-05",
    downloads: [{ fileName: "pricecharting-pokemon.csv", bytes: 1000 }],
    imports: [
      {
        category: "pokemon",
        importRunId: "r2",
        skippedAlreadyImported: false,
        rowsRead: 1000,
        rowsImported: 700,
        rowsRejected: 10,
      },
    ],
    previousReport: previous,
    sampleChecks: [{ label: "Grusha", pass: true }],
    archiveUploaded: true,
    archiveExpected: true,
    firestoreSaved: true,
    firestoreRequired: true,
    snapshotsForDate: 700,
    importWasSkipped: false,
  });
  assert(health.warnings.some((w) => w.includes("20%")), "drop warning emitted");
  assert(health.errors.length === 0, "no hard error for drop alone");
}

function runZeroImportError() {
  console.log("\n3. Zero-row import is an error");
  const health = evaluatePriceChartingImportHealth({
    date: "2026-07-05",
    downloads: [{ fileName: "pricecharting-pokemon.csv", bytes: 1000 }],
    imports: [
      {
        category: "pokemon",
        importRunId: "r2",
        skippedAlreadyImported: false,
        rowsRead: 500,
        rowsImported: 0,
        rowsRejected: 500,
      },
    ],
    previousReport: null,
    sampleChecks: [],
    archiveUploaded: true,
    archiveExpected: true,
    firestoreSaved: true,
    firestoreRequired: true,
    snapshotsForDate: 0,
    importWasSkipped: false,
  });
  assert(health.errors.some((e) => e.includes("0 snapshots")), "zero import error");
}

function runSkippedImportOk() {
  console.log("\n4. Same-day skipped import does not require new snapshots");
  const health = evaluatePriceChartingImportHealth({
    date: "2026-07-05",
    downloads: [{ fileName: "pricecharting-pokemon.csv", bytes: 1000 }],
    imports: [
      {
        category: "pokemon",
        importRunId: "skipped",
        skippedAlreadyImported: true,
        rowsRead: 0,
        rowsImported: 0,
        rowsRejected: 0,
      },
    ],
    previousReport: null,
    sampleChecks: [{ label: "Grusha", pass: true, pointCount: 1 }],
    archiveUploaded: true,
    archiveExpected: true,
    firestoreSaved: true,
    firestoreRequired: true,
    snapshotsForDate: 80000,
    importWasSkipped: true,
  });
  assert(!health.errors.some((e) => e.includes("No new snapshots")), "skipped import allowed");
}

function runReportStatus() {
  console.log("\n5. Report status resolution");
  assert(
    resolveDailyReportStatus({ errors: [], warnings: ["x"], baseFailed: false }) === "warning",
    "warnings => warning",
  );
  assert(
    resolveDailyReportStatus({ errors: ["fail"], warnings: [], baseFailed: true }) === "failed",
    "errors => failed",
  );
}

function runReportFields() {
  console.log("\n6. Daily report includes monitoring fields");
  const report: PriceChartingDailyReport = {
    date: "2026-07-05",
    jobExecutionId: "pricecharting-daily-import-abc",
    startedAt: "2026-07-05T06:00:00Z",
    finishedAt: "2026-07-05T06:05:00Z",
    status: "warning",
    firestoreReportId: "2026-07-05",
    downloads: [{ fileName: "pricecharting-pokemon.csv", bytes: 100, gcsPath: "gs://b/raw/x.csv" }],
    imports: [
      {
        category: "pokemon",
        importRunId: "run-1",
        rowsRead: 10,
        rowsImported: 9,
        rowsRejected: 1,
      },
    ],
    warehouse: { snapshotCountByCategory: { pokemon: 9 }, productsCurrentTotal: 10, snapshotsForDate: 9 },
    sampleChecks: [{ label: "Grusha", pass: true, snapshotCount: 1, pointCount: 1 }],
    warnings: ["test warning"],
    errors: [],
    archive: {
      bucket: "b",
      rawPrefix: "gs://b/raw/2026-07-05/",
      rawPaths: ["gs://b/raw/2026-07-05/pricecharting-pokemon.csv"],
      reportPath: "gs://b/reports/2026-07-05-import-report.json",
    },
  };
  assert(Boolean(report.jobExecutionId), "jobExecutionId");
  assert(Boolean(report.firestoreReportId), "firestoreReportId");
  assert(Array.isArray(report.warnings), "warnings array");
  assert(report.warehouse.snapshotsForDate === 9, "snapshotsForDate");
  assert(Boolean(report.archive?.reportPath), "GCS report path");
}

function main() {
  console.log("Directive 006V — PriceCharting monitoring tests\n");
  runMissingSecrets();
  runImportDropWarning();
  runZeroImportError();
  runSkippedImportOk();
  runReportStatus();
  runReportFields();
  console.log(`\n006V: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} checks)`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
