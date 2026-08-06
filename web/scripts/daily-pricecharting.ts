/**
 * Directive 006T/006V — Daily PriceCharting download → import → validate → report.
 * Run: npm run prices:daily:pricecharting [--date YYYY-MM-DD] [--force] [--skip-download]
 *
 * Cloud Scheduler → Cloud Run Job → this script.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
import { isCloudDeployment } from "../src/lib/cloud-env";
import { buildCardPriceHistoryResponse } from "../src/lib/prices/price-history";
import { priceWarehouseStore } from "../src/lib/prices/price-warehouse-store";
import {
  evaluatePriceChartingImportHealth,
  missingPriceChartingCsvSecrets,
  resolveDailyReportStatus,
} from "../src/lib/prices/pricecharting-import-health";
import { resolveArchiveBucket, uploadRawCsvArchive, uploadReportArchive } from "../src/lib/prices/pricecharting-archive";
import {
  CARD_CSV_IMPORTS,
  importAllPriceChartingCsvs,
  loadEnvLocal,
  type CategoryImportResult,
} from "./import-pricecharting-csv-all";
import { resolvePriceHistoryLookupKeys } from "../src/lib/prices/price-identity-aliases";
import { sendPriceChartingImportReportEmail } from "../src/lib/prices/pricecharting-import-email";
import type { PriceChartingDailyReport } from "../src/lib/prices/types";

export type { PriceChartingDailyReport as DailyPriceChartingReport };

const SAMPLE_KEYS: Array<{
  label: string;
  identityKey: string;
  minSnapshots: number;
  aliasLookup?: boolean;
}> = [
  {
    label: "Grusha reverse holo (warehouse key)",
    identityKey: "pokemon|paldea-evolved|184|reverse_holo|en",
    minSnapshots: 1,
  },
  {
    label: "Grusha reverse holo (sv2 alias)",
    identityKey: "pokemon|sv2|184|reverse_holo|en",
    minSnapshots: 1,
    aliasLookup: true,
  },
  { label: "Argentum Armor PLST", identityKey: "mtg|PLST|198|nonfoil|normal|en", minSnapshots: 1 },
  { label: "Ravenous REX #18", identityKey: "mtg|REX|18|nonfoil|normal|en", minSnapshots: 1 },
  { label: "Ravenous MAR #93", identityKey: "mtg|MAR|93|nonfoil|normal|en", minSnapshots: 0 },
  { label: "One Piece OP07-002", identityKey: "onepiece|500-years-in-the-future|OP07-002|en", minSnapshots: 1 },
  { label: "Yu-Gi-Oh STAS-EN008", identityKey: "yugioh|2-player-starter-set|STAS-EN008|en", minSnapshots: 1 },
];

function parseArgs(argv: string[]) {
  const dateArg = argv.find((a, i) => argv[i - 1] === "--date");
  return {
    date: dateArg ?? new Date().toISOString().slice(0, 10),
    force: argv.includes("--force"),
    skipDownload: argv.includes("--skip-download"),
    dryRun: argv.includes("--dry-run"),
  };
}

function readJobExecutionId(): string | undefined {
  return (
    process.env.CLOUD_RUN_EXECUTION?.trim() ||
    process.env.CLOUD_RUN_JOB_EXECUTION?.trim() ||
    undefined
  );
}

function runDownload(date: string, force: boolean): { ok: boolean; error?: string } {
  const missing = missingPriceChartingCsvSecrets();
  if (missing.length) {
    return { ok: false, error: `Missing CSV URL env: ${missing.join(", ")}` };
  }

  const args = ["scripts/download-pricecharting-csv.ts", "--date", date];
  if (force) args.push("--force");
  const res = spawnSync("npx", ["--yes", "tsx", ...args], {
    cwd: resolve(__dirname, ".."),
    stdio: "inherit",
    shell: true,
  });
  if (res.status !== 0) {
    return { ok: false, error: `download exited ${res.status}` };
  }
  return { ok: true };
}

function collectDownloadMeta(date: string): PriceChartingDailyReport["downloads"] {
  const rawDir = resolve(__dirname, "../../data/pricecharting/raw", date);
  return CARD_CSV_IMPORTS.map((spec) => {
    const path = resolve(rawDir, spec.fileName);
    const bytes = existsSync(path) ? statSync(path).size : 0;
    return { fileName: spec.fileName, bytes, path };
  });
}

async function runSampleChecks(): Promise<PriceChartingDailyReport["sampleChecks"]> {
  const checks: PriceChartingDailyReport["sampleChecks"] = [];

  for (const sample of SAMPLE_KEYS) {
    const lookupKeys = sample.aliasLookup
      ? resolvePriceHistoryLookupKeys({ identityKey: sample.identityKey })
      : [sample.identityKey];
    const snapshots = await priceWarehouseStore.listSnapshotsByIdentityKeys(lookupKeys);
    const history = buildCardPriceHistoryResponse({
      identityKey: sample.identityKey,
      snapshots,
    });
    const latest = history.series[0]?.points.at(-1);
    const pointCount = history.trend.sampleCount;

    let pass = snapshots.length >= sample.minSnapshots;
    let note: string | undefined;

    if (sample.label.includes("Grusha") && sample.aliasLookup) {
      note =
        pointCount >= 2
          ? `${pointCount} dated points — multi-day trend available`
          : `${pointCount} dated point — trend unlocks after next daily import`;
    }

    if (sample.label === "Ravenous MAR #93") {
      const rex18 = await priceWarehouseStore.listSnapshotsByIdentityKey(
        "mtg|REX|18|nonfoil|normal|en",
      );
      const rex43 = await priceWarehouseStore.listSnapshotsByIdentityKey(
        "mtg|REX|43|nonfoil|normal|en",
      );
      pass = snapshots.length === 0;
      note =
        rex18.length > 0 && rex43.length > 0
          ? "REX #18/#43 separate; MAR empty"
          : "MAR empty (REX check incomplete)";
      if (snapshots.some((s) => String(s.productName ?? "").includes("#18"))) {
        pass = false;
        note = "MAR contaminated with REX #18";
      }
    }

    checks.push({
      label: sample.label,
      identityKey: sample.identityKey,
      snapshotCount: snapshots.length,
      pointCount,
      currentValue: latest?.value,
      capturedDate: latest?.date,
      pass,
      note,
    });
  }

  return checks;
}

async function warehouseCounts(
  capturedDate: string,
): Promise<PriceChartingDailyReport["warehouse"]> {
  const db = requireFirestore();
  const categories = ["pokemon", "mtg", "yugioh", "onepiece"] as const;
  const snapshotCountByCategory: Record<string, number> = {};
  for (const cat of categories) {
    snapshotCountByCategory[cat] = (
      await db.collection(COLLECTIONS.cardPriceSnapshots).where("category", "==", cat).count().get()
    ).data().count;
  }
  const productsCurrentTotal = (
    await db.collection(COLLECTIONS.pricechartingProductsCurrent).count().get()
  ).data().count;
  const snapshotsForDate = await priceWarehouseStore.countSnapshotsForDate(capturedDate);
  return { snapshotCountByCategory, productsCurrentTotal, snapshotsForDate };
}

function importResultToReport(r: CategoryImportResult): PriceChartingDailyReport["imports"][0] {
  return {
    category: r.spec.importCategory,
    fileName: r.spec.fileName,
    importRunId: r.skippedAlreadyImported ? "skipped" : r.run.id,
    skippedAlreadyImported: r.skippedAlreadyImported,
    rowsRead: r.run.rowsRead,
    rowsCataloged: r.run.rowsCataloged ?? 0,
    rowsImported: r.run.rowsImported,
    rowsRejected: r.run.rowsRejected,
    identityRiskCount: r.run.identityRiskCount,
    snapshotsWritten: r.snapshotsWritten,
    snapshotsDeduped: r.snapshotsDeduped,
  };
}

function saveReport(report: PriceChartingDailyReport): string {
  const dir = resolve(__dirname, "../../data/pricecharting/reports");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${report.date}-import-report.json`);
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}

export async function runDailyPriceCharting(options: {
  date: string;
  force?: boolean;
  skipDownload?: boolean;
  dryRun?: boolean;
}): Promise<{ report: PriceChartingDailyReport; reportPath?: string }> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const warnings: string[] = [];
  const jobExecutionId = readJobExecutionId();
  const archiveExpected = Boolean(resolveArchiveBucket());
  const firestoreRequired = isCloudDeployment();

  if (!options.skipDownload && !options.dryRun) {
    const dl = runDownload(options.date, options.force ?? false);
    if (!dl.ok) errors.push(dl.error ?? "download failed");
  }

  const downloads = collectDownloadMeta(options.date);

  let importResults: CategoryImportResult[] = [];
  if (errors.length === 0) {
    try {
      importResults = await importAllPriceChartingCsvs({
        date: options.date,
        force: options.force,
        dryRun: options.dryRun,
      });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const imports = importResults.map(importResultToReport);
  const importWasSkipped = imports.length > 0 && imports.every((i) => i.skippedAlreadyImported);

  let sampleChecks: PriceChartingDailyReport["sampleChecks"] = [];
  let warehouse: PriceChartingDailyReport["warehouse"] = {
    snapshotCountByCategory: {},
    productsCurrentTotal: 0,
    snapshotsForDate: 0,
  };

  if (!options.dryRun && errors.length === 0) {
    try {
      sampleChecks = await runSampleChecks();
      warehouse = await warehouseCounts(options.date);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  let previousReport: PriceChartingDailyReport | null = null;
  if (!options.dryRun) {
    try {
      previousReport = await priceWarehouseStore.getPreviousSuccessfulDailyReport(options.date);
    } catch {
      /* optional */
    }
  }

  let archive: PriceChartingDailyReport["archive"];
  let archiveUploaded = false;
  let firestoreSaved = false;

  const report: PriceChartingDailyReport = {
    date: options.date,
    jobExecutionId,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: "failed",
    firestoreReportId: options.date,
    downloads,
    imports,
    warehouse,
    sampleChecks,
    warnings,
    errors,
  };

  if (!options.dryRun) {
    const rawDir = resolve(__dirname, "../../data/pricecharting/raw", options.date);

    if (errors.length === 0 || archiveExpected) {
      try {
        const rawArchive = await uploadRawCsvArchive({ date: options.date, rawDir });
        if (rawArchive.bucket) {
          archive = {
            ...rawArchive,
            reportPath: `gs://${rawArchive.bucket}/reports/${options.date}-import-report.json`,
          };
          report.archive = archive;
          archiveUploaded = rawArchive.rawPaths.length > 0;
          report.downloads = downloads.map((d) => ({
            ...d,
            gcsPath: archive!.rawPaths.find((p) => p.endsWith(d.fileName)),
          }));
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    report.errors = errors;
    report.warnings = warnings;
    report.status = resolveDailyReportStatus({
      errors,
      warnings,
      baseFailed: errors.length > 0,
    });

    const reportPath = saveReport(report);

    if (archive?.bucket) {
      try {
        const reportUri = await uploadReportArchive({
          date: options.date,
          reportLocalPath: reportPath,
        });
        if (reportUri) {
          archive.reportPath = reportUri;
          report.archive = archive;
          archiveUploaded = true;
          writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
          console.log(`Archive uploaded: ${reportUri}`);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        report.errors = errors;
        report.status = "failed";
        writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
      }
    }

    if (archiveExpected && !archiveUploaded && errors.length === 0) {
      errors.push("GCS archive upload incomplete");
    }

    try {
      await priceWarehouseStore.saveDailyReport(report);
      firestoreSaved = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Firestore daily report write failed: ${msg}`);
    }

    const health = evaluatePriceChartingImportHealth({
      date: options.date,
      downloads: report.downloads.map((d) => ({ fileName: d.fileName, bytes: d.bytes })),
      imports: imports.map((i) => ({
        category: i.category,
        importRunId: i.importRunId,
        skippedAlreadyImported: i.skippedAlreadyImported ?? false,
        rowsRead: i.rowsRead,
        rowsImported: i.rowsImported,
        rowsRejected: i.rowsRejected,
      })),
      previousReport,
      sampleChecks,
      archiveUploaded,
      archiveExpected,
      firestoreSaved,
      firestoreRequired,
      snapshotsForDate: warehouse.snapshotsForDate ?? 0,
      importWasSkipped,
    });

    report.warnings = [...new Set([...warnings, ...health.warnings])];
    report.errors = [...new Set([...errors, ...health.errors])];
    report.finishedAt = new Date().toISOString();
    report.status = resolveDailyReportStatus({
      errors: report.errors,
      warnings: report.warnings,
      baseFailed: report.errors.length > 0,
    });
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    if (archiveUploaded && archive?.bucket) {
      try {
        await uploadReportArchive({ date: options.date, reportLocalPath: reportPath });
      } catch {
        /* best effort refresh */
      }
    }

    if (firestoreSaved) {
      try {
        await priceWarehouseStore.saveDailyReport(report);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push(`Firestore daily report refresh failed: ${msg}`);
      }
    }

    if (firestoreRequired && !firestoreSaved) {
      throw new Error(report.errors.join("; ") || "Firestore daily report write failed");
    }

    return { report, reportPath };
  }

  report.status = resolveDailyReportStatus({ errors, warnings, baseFailed: errors.length > 0 });
  return { report, reportPath: undefined };
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));

  if (process.argv.includes("--test-import-email")) {
    const { sendPriceChartingImportTestEmail } = await import(
      "../src/lib/prices/pricecharting-import-email"
    );
    const ok = await sendPriceChartingImportTestEmail();
    if (!ok) process.exit(1);
    console.log("Test import report email sent.");
    return;
  }

  console.log(`=== Daily PriceCharting — ${opts.date} ===`);
  if (readJobExecutionId()) {
    console.log(`Execution: ${readJobExecutionId()}`);
  }
  console.log();

  const { report, reportPath } = await runDailyPriceCharting(opts);

  console.log("\n--- Downloads ---");
  for (const d of report.downloads) {
    console.log(`  ${d.fileName}: ${d.bytes.toLocaleString()} bytes${d.gcsPath ? ` → ${d.gcsPath}` : ""}`);
  }

  console.log("\n--- Imports ---");
  for (const imp of report.imports) {
    if (imp.skippedAlreadyImported) {
      console.log(`  ${imp.category}: skipped (already imported)`);
      continue;
    }
    console.log(
      `  ${imp.category}: run=${imp.importRunId} read=${imp.rowsRead} imported=${imp.rowsImported} rejected=${imp.rowsRejected}`,
    );
  }

  if (report.sampleChecks.length) {
    console.log("\n--- Sample checks ---");
    for (const s of report.sampleChecks) {
      console.log(
        `  ${s.pass ? "PASS" : "FAIL"} ${s.label}: ${s.snapshotCount} snapshot(s), ${s.pointCount ?? 0} point(s)${s.currentValue != null ? ` $${s.currentValue}` : ""}${s.note ? ` — ${s.note}` : ""}`,
      );
    }
  }

  if (report.warehouse.productsCurrentTotal) {
    console.log("\n--- Warehouse ---");
    console.log(`  products_current: ${report.warehouse.productsCurrentTotal}`);
    console.log(`  snapshots for ${report.date}: ${report.warehouse.snapshotsForDate ?? 0}`);
    for (const [cat, n] of Object.entries(report.warehouse.snapshotCountByCategory)) {
      console.log(`  snapshots ${cat}: ${n}`);
    }
  }

  if (report.warnings.length) {
    console.log("\n--- Warnings ---");
    for (const w of report.warnings) console.log(`  WARN ${w}`);
  }

  if (!opts.dryRun && reportPath) {
    console.log(`\nReport saved: ${reportPath}`);
    if (report.archive?.reportPath) {
      console.log(`GCS report: ${report.archive.reportPath}`);
    }
    console.log(`Firestore report ID: ${report.firestoreReportId}`);

    try {
      const emailed = await sendPriceChartingImportReportEmail(report);
      if (emailed) {
        console.log("Import report email sent.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Import report email failed:", msg);
    }
  }

  if (report.errors.length) {
    console.error("\nErrors:", report.errors);
    process.exit(1);
  }

  if (report.status === "warning") {
    console.log("\nCompleted with warnings.");
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("daily-pricecharting");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
