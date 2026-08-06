/**
 * Directive 006V — Validate a PriceCharting daily run (post-scheduler or manual).
 * Run: npm run prices:validate:daily-run [--date YYYY-MM-DD] [--bucket NAME]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
import { priceWarehouseStore } from "../src/lib/prices/price-warehouse-store";
import { buildCardPriceHistoryResponse } from "../src/lib/prices/price-history";
import { resolvePriceHistoryLookupKeys } from "../src/lib/prices/price-identity-aliases";
import type { PriceChartingDailyReport } from "../src/lib/prices/types";

const PROJECT_ID = "trading-card-buyback-dev";
const REGION = "us-central1";
const JOB_NAME = "pricecharting-daily-import";
const DEFAULT_BUCKET = `${PROJECT_ID}-pricecharting`;

function loadEnvLocal() {
  try {
    for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
    }
  } catch {
    /* optional */
  }
}

async function gcsObjectsExist(bucket: string, date: string): Promise<{
  rawOk: boolean;
  reportOk: boolean;
  rawPaths: string[];
  reportPath: string;
}> {
  const { spawnSync } = await import("child_process");
  const rawPrefix = `gs://${bucket}/raw/${date}/`;
  const reportPath = `gs://${bucket}/reports/${date}-import-report.json`;

  const rawList = spawnSync(
    "gcloud",
    ["storage", "ls", rawPrefix, `--project=${PROJECT_ID}`],
    { encoding: "utf8", shell: true },
  );
  const rawPaths = rawList.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".csv"));

  const reportCheck = spawnSync(
    "gcloud",
    ["storage", "cat", reportPath, `--project=${PROJECT_ID}`],
    { encoding: "utf8", shell: true },
  );

  return {
    rawOk: rawPaths.length >= 4,
    reportOk: reportCheck.status === 0,
    rawPaths,
    reportPath,
  };
}

async function latestJobExecution(forDate: string): Promise<string | null> {
  const { spawnSync } = await import("child_process");
  const res = spawnSync(
    "gcloud",
    [
      "run",
      "jobs",
      "executions",
      "list",
      `--job=${JOB_NAME}`,
      `--region=${REGION}`,
      `--project=${PROJECT_ID}`,
      "--limit=5",
      "--format=value(name,status.completionTime)",
    ],
    { encoding: "utf8", shell: true },
  );
  if (res.status !== 0) return null;
  const lines = res.stdout.trim().split("\n").filter(Boolean);
  return lines[0]?.split(/\s+/)[0] ?? null;
}

async function runLiveSampleChecks(): Promise<Array<{ label: string; pass: boolean; note?: string }>> {
  const samples = [
    {
      label: "Grusha sv2 alias",
      keys: resolvePriceHistoryLookupKeys({
        identityKey: "pokemon|sv2|184|reverse_holo|en",
      }),
      minPoints: 1,
    },
    {
      label: "Argentum PLST",
      keys: ["mtg|PLST|198|nonfoil|normal|en"],
      minPoints: 1,
    },
    {
      label: "Ravenous MAR #93",
      keys: ["mtg|MAR|93|nonfoil|normal|en"],
      minPoints: 0,
      maxPoints: 0,
    },
  ];

  const out: Array<{ label: string; pass: boolean; note?: string }> = [];
  for (const s of samples) {
    const snaps = await priceWarehouseStore.listSnapshotsByIdentityKeys(s.keys);
    const history = buildCardPriceHistoryResponse({ identityKey: s.keys[0]!, snapshots: snaps });
    const points = history.trend.sampleCount;
    let pass = points >= s.minPoints;
    if ("maxPoints" in s && s.maxPoints != null) pass = points <= s.maxPoints;
    out.push({
      label: s.label,
      pass,
      note: `${points} dated point(s)`,
    });
  }
  return out;
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const date =
    argv.find((a, i) => argv[i - 1] === "--date") ??
    (argv[0] && !argv[0].startsWith("-") ? argv[0] : undefined) ??
    new Date().toISOString().slice(0, 10);
  const bucket =
    argv.find((a, i) => argv[i - 1] === "--bucket") ??
    process.env.PRICECHARTING_ARCHIVE_BUCKET ??
    DEFAULT_BUCKET;

  console.log(`=== Validate PriceCharting daily run — ${date} ===\n`);

  let failed = 0;

  const execution = await latestJobExecution(date);
  console.log(`${execution ? "PASS" : "WARN"} Cloud Run execution: ${execution ?? "none found in recent list"}`);
  if (!execution) failed++;

  const gcs = await gcsObjectsExist(bucket, date);
  console.log(
    `${gcs.rawOk ? "PASS" : "FAIL"} GCS raw CSV archive: ${gcs.rawPaths.length}/4 files under gs://${bucket}/raw/${date}/`,
  );
  if (!gcs.rawOk) failed++;
  for (const p of gcs.rawPaths) console.log(`  ${p}`);

  console.log(`${gcs.reportOk ? "PASS" : "FAIL"} GCS report: ${gcs.reportPath}`);
  if (!gcs.reportOk) failed++;

  const firestoreReport = await priceWarehouseStore.getDailyReport(date);
  console.log(
    `${firestoreReport ? "PASS" : "FAIL"} Firestore report: ${COLLECTIONS.pricechartingDailyReports}/${date}`,
  );
  if (!firestoreReport) failed++;
  else {
    console.log(`  status=${firestoreReport.status} execution=${firestoreReport.jobExecutionId ?? "n/a"}`);
    if (firestoreReport.warnings?.length) {
      console.log(`  warnings: ${firestoreReport.warnings.length}`);
    }
  }

  const snapshotsForDate = await priceWarehouseStore.countSnapshotsForDate(date);
  const skipped = firestoreReport?.imports.every((i) => i.skippedAlreadyImported) ?? false;
  const snapPass = skipped || snapshotsForDate > 0;
  console.log(
    `${snapPass ? "PASS" : "FAIL"} Snapshots for ${date}: ${snapshotsForDate}${skipped ? " (import skipped — same-day dedupe)" : ""}`,
  );
  if (!snapPass) failed++;

  const liveSamples = await runLiveSampleChecks();
  console.log("\n--- Live sample checks ---");
  for (const s of liveSamples) {
    console.log(`  ${s.pass ? "PASS" : "FAIL"} ${s.label}${s.note ? ` — ${s.note}` : ""}`);
    if (!s.pass) failed++;
  }

  if (firestoreReport?.sampleChecks?.length) {
    const failedSamples = firestoreReport.sampleChecks.filter((s) => !s.pass);
    console.log(
      `\nReport sample checks: ${firestoreReport.sampleChecks.length - failedSamples.length}/${firestoreReport.sampleChecks.length} passed`,
    );
    if (failedSamples.length) failed++;
  }

  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
