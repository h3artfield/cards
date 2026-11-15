#!/usr/bin/env npx tsx
/** Regression: concurrent month import completion must preserve all month records. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mergeHistoricalImportManifest,
  type MonthImportRecord,
  type TopdeckHistoricalImportManifest,
} from "../src/lib/commander-strategy/topdeck/historical-manifest";

function monthRecord(month: string, runId: string): MonthImportRecord {
  return {
    status: "COMPLETE",
    logicalRange: { start: `${month}-01`, end: `${month}-28` },
    tournaments: month === "2026-06" ? 1038 : 1216,
    pods: month === "2026-06" ? 16587 : 17598,
    runId,
    generatedAt: new Date().toISOString(),
    fetchWindows: [month],
    missingIntervals: [],
    duplicateTidRetrievals: 0,
  };
}

function simulateConcurrentSave(
  path: string,
  juneManifest: TopdeckHistoricalImportManifest,
  julyManifest: TopdeckHistoricalImportManifest,
): TopdeckHistoricalImportManifest {
  const latestBeforeJune = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as TopdeckHistoricalImportManifest)
    : null;
  const mergedJune = mergeHistoricalImportManifest(latestBeforeJune, juneManifest);
  writeFileSync(path, JSON.stringify(mergedJune, null, 2));

  const latestBeforeJuly = JSON.parse(readFileSync(path, "utf8")) as TopdeckHistoricalImportManifest;
  const mergedJuly = mergeHistoricalImportManifest(latestBeforeJuly, julyManifest);
  writeFileSync(path, JSON.stringify(mergedJuly, null, 2));

  return JSON.parse(readFileSync(path, "utf8")) as TopdeckHistoricalImportManifest;
}

const dir = mkdtempSync(join(tmpdir(), "topdeck-manifest-test-"));
const manifestPath = join(dir, "topdeck-historical-import-v1.json");

const juneWrite: TopdeckHistoricalImportManifest = {
  version: "topdeck-historical-import-v1",
  updatedAt: "2026-08-11T23:45:13.080Z",
  months: { "2026-06": monthRecord("2026-06", "run-june") },
};

const julyWrite: TopdeckHistoricalImportManifest = {
  version: "topdeck-historical-import-v1",
  updatedAt: "2026-08-11T23:45:03.339Z",
  months: { "2026-07": monthRecord("2026-07", "run-july") },
};

const finalManifest = simulateConcurrentSave(manifestPath, juneWrite, julyWrite);

assert.ok(finalManifest.months["2026-06"], "June record must survive concurrent completion");
assert.ok(finalManifest.months["2026-07"], "July record must survive concurrent completion");
assert.equal(finalManifest.months["2026-06"]?.runId, "run-june");
assert.equal(finalManifest.months["2026-07"]?.runId, "run-july");

const lastWriteWinsLoss = mergeHistoricalImportManifest(juneWrite, {
  ...julyWrite,
  months: { "2026-07": monthRecord("2026-07", "run-july-only") },
});
assert.ok(
  lastWriteWinsLoss.months["2026-06"],
  "mergeHistoricalImportManifest must never drop unrelated month keys",
);

console.log("topdeck-historical-manifest concurrency tests: OK");
