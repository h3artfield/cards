import type { PriceChartingDailyReport } from "./types";

export const PRICECHARTING_CSV_SECRET_KEYS = [
  "PRICECHARTING_CSV_POKEMON_URL",
  "PRICECHARTING_CSV_MAGIC_URL",
  "PRICECHARTING_CSV_YUGIOH_URL",
  "PRICECHARTING_CSV_ONEPIECE_URL",
] as const;

export function missingPriceChartingCsvSecrets(): string[] {
  return PRICECHARTING_CSV_SECRET_KEYS.filter((key) => !process.env[key]?.trim());
}

export type ImportHealthSampleCheck = {
  label: string;
  pass: boolean;
  snapshotCount?: number;
  pointCount?: number;
};

export type ImportHealthInput = {
  date: string;
  downloads: Array<{ fileName: string; bytes: number }>;
  imports: Array<{
    category: string;
    importRunId: string;
    skippedAlreadyImported: boolean;
    rowsRead: number;
    rowsImported: number;
    rowsRejected: number;
  }>;
  previousReport: PriceChartingDailyReport | null;
  sampleChecks: ImportHealthSampleCheck[];
  archiveUploaded: boolean;
  archiveExpected: boolean;
  firestoreSaved: boolean;
  firestoreRequired: boolean;
  snapshotsForDate: number;
  importWasSkipped: boolean;
};

const REJECTION_SPIKE_MIN = 500;
const REJECTION_SPIKE_FACTOR = 2;

export function evaluatePriceChartingImportHealth(
  input: ImportHealthInput,
): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const dl of input.downloads) {
    if (dl.bytes <= 0) {
      errors.push(`CSV download empty or missing: ${dl.fileName}`);
    }
  }

  for (const imp of input.imports) {
    if (imp.skippedAlreadyImported) continue;

    if (imp.rowsRead === 0) {
      errors.push(`${imp.category}: import read 0 rows`);
    } else if (imp.rowsImported === 0) {
      errors.push(`${imp.category}: import produced 0 snapshots from ${imp.rowsRead} rows`);
    }

    const prev = input.previousReport?.imports.find((p) => p.category === imp.category);
    if (prev && !prev.importRunId?.startsWith("skipped") && prev.rowsImported > 0) {
      const threshold = prev.rowsImported * 0.8;
      if (imp.rowsImported < threshold) {
        warnings.push(
          `${imp.category}: rowsImported ${imp.rowsImported} dropped more than 20% from previous run (${prev.rowsImported})`,
        );
      }

      if (
        imp.rowsRejected >= REJECTION_SPIKE_MIN &&
        imp.rowsRejected >= prev.rowsRejected * REJECTION_SPIKE_FACTOR &&
        imp.rowsRejected > prev.rowsRejected
      ) {
        warnings.push(
          `${imp.category}: rowsRejected spiked to ${imp.rowsRejected} (previous ${prev.rowsRejected})`,
        );
      }
    }
  }

  if (!input.importWasSkipped && input.snapshotsForDate <= 0) {
    errors.push(`No new snapshots written for capturedDate ${input.date}`);
  }

  if (input.archiveExpected && !input.archiveUploaded) {
    errors.push("GCS archive upload failed or PRICECHARTING_ARCHIVE_BUCKET not configured");
  }

  if (input.firestoreRequired && !input.firestoreSaved) {
    errors.push("Firestore daily report write failed");
  }

  for (const sample of input.sampleChecks) {
    if (!sample.pass) {
      errors.push(`Sample check failed: ${sample.label}`);
    }
  }

  const grusha = input.sampleChecks.find((s) =>
    s.label.toLowerCase().includes("grusha") && s.label.toLowerCase().includes("sv2"),
  );
  if (grusha?.pass && (grusha.pointCount ?? 0) === 1 && input.previousReport?.status === "success") {
    warnings.push(
      "Grusha has 1 dated point — multi-day trend will appear after the next successful daily import",
    );
  }

  return { warnings, errors };
}

export function resolveDailyReportStatus(input: {
  errors: string[];
  warnings: string[];
  baseFailed: boolean;
}): "success" | "failed" | "warning" {
  if (input.baseFailed || input.errors.length > 0) return "failed";
  if (input.warnings.length > 0) return "warning";
  return "success";
}
