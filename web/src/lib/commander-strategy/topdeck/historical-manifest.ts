import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { topdeckArtifactPath } from "./artifact-paths";

export type MonthImportStatus = "COMPLETE" | "PARTIAL" | "FAILED" | "NOT_STARTED";

export type MonthImportRecord = {
  status: MonthImportStatus;
  logicalRange: { start: string; end: string };
  /** Primary API fetch window label for this import (e.g. 2026-06). */
  requestedFetchWindow?: string;
  tournaments: number;
  pods: number;
  /** Tournament/pod records whose canonicalMonth differs from requestedFetchWindow. */
  outOfRequestedWindowRecordCount?: number;
  rawDigest?: string;
  fetchWindows: string[];
  missingIntervals: string[];
  duplicateTidRetrievals: number;
  runId?: string;
  generatedAt?: string;
  requestLogSummary?: {
    totalRequests: number;
    retries: number;
    rateLimit429Count: number;
    splitDepthMax: number;
  };
};

export type TopdeckHistoricalImportManifest = {
  version: "topdeck-historical-import-v1";
  updatedAt: string;
  months: Record<string, MonthImportRecord>;
};

const MANIFEST_PATH = topdeckArtifactPath("historicalImport");

export function loadHistoricalImportManifest(): TopdeckHistoricalImportManifest {
  if (!existsSync(MANIFEST_PATH)) {
    return { version: "topdeck-historical-import-v1", updatedAt: new Date().toISOString(), months: {} };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as TopdeckHistoricalImportManifest;
}

export function mergeHistoricalImportManifest(
  existing: TopdeckHistoricalImportManifest | null,
  incoming: TopdeckHistoricalImportManifest,
): TopdeckHistoricalImportManifest {
  return {
    ...incoming,
    updatedAt: new Date().toISOString(),
    months: { ...(existing?.months ?? {}), ...incoming.months },
  };
}

export function saveHistoricalImportManifest(manifest: TopdeckHistoricalImportManifest): void {
  mkdirSync(topdeckArtifactPath("historicalImport").replace(/[^/\\]+$/, ""), { recursive: true });
  const latest = existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as TopdeckHistoricalImportManifest)
    : null;
  const merged = mergeHistoricalImportManifest(latest, manifest);
  writeFileSync(MANIFEST_PATH, JSON.stringify(merged, null, 2));
}

export function upsertMonthRecord(
  manifest: TopdeckHistoricalImportManifest,
  monthKey: string,
  record: MonthImportRecord,
): TopdeckHistoricalImportManifest {
  const existing = manifest.months[monthKey];
  if (!existing) {
    manifest.months[monthKey] = record;
    return manifest;
  }
  manifest.months[monthKey] = {
    ...existing,
    ...record,
    fetchWindows: [...new Set([...(existing.fetchWindows ?? []), ...record.fetchWindows])],
    missingIntervals: record.status === "COMPLETE" ? [] : record.missingIntervals,
  };
  return manifest;
}
