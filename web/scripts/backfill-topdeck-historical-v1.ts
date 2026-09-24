#!/usr/bin/env npx tsx
/**
 * 12-month TopDeck EDH historical backfill — import, v3.3 normalize, monthly QA gates.
 * Preserves existing immutable raw artifacts; only imports missing months.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  twelveMonthWindowKeys,
  monthStartIso,
} from "../src/lib/commander-strategy/topdeck/historical-window-v1";
import {
  loadHistoricalImportManifest,
  saveHistoricalImportManifest,
} from "../src/lib/commander-strategy/topdeck/historical-manifest";
import { topdeckArtifactPath, topdeckRawRunDir } from "../src/lib/commander-strategy/topdeck/artifact-paths";
import { DECK_RESOLVER_VERSION, TOPDECK_NORMALIZATION_VERSION } from "../src/lib/commander-strategy/types";
import { evaluateMonthlyBackfillGate } from "./lib/monthly-backfill-gate-v1";

loadProjectEnvLocal();

const WEB_DIR = resolve(__dirname, "..");
const MONTHS = twelveMonthWindowKeys(new Date("2026-08-11T00:00:00.000Z"));

type MonthProgress = {
  monthKey: string;
  importStatus: "skipped_existing" | "imported" | "failed";
  normalizeStatus: "ok" | "failed";
  gatePass: boolean;
  gateStopReason?: string;
  runId?: string;
  rawDigest?: string;
  gateChecks?: ReturnType<typeof evaluateMonthlyBackfillGate>["checks"];
  unresolvedRecorded?: {
    quantity: number;
    uniqueNames: number;
    topNames: Array<{ name: string; quantity: number; category: string }>;
  };
};

type BackfillProgress = {
  version: "topdeck-12month-backfill-v1";
  startedAt: string;
  updatedAt: string;
  resolverVersion: string;
  normalizationVersion: string;
  monthsWindow: string[];
  monthProgress: MonthProgress[];
  status: "in_progress" | "completed" | "stopped";
  stopReason?: string;
};

function loadProgress(): BackfillProgress {
  const path = topdeckArtifactPath("backfillProgress");
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf8")) as BackfillProgress;
  }
  return {
    version: "topdeck-12month-backfill-v1",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolverVersion: DECK_RESOLVER_VERSION,
    normalizationVersion: TOPDECK_NORMALIZATION_VERSION,
    monthsWindow: MONTHS,
    monthProgress: [],
    status: "in_progress",
  };
}

function saveProgress(progress: BackfillProgress): void {
  progress.updatedAt = new Date().toISOString();
  writeFileSync(topdeckArtifactPath("backfillProgress"), JSON.stringify(progress, null, 2));
}

function run(cmd: string): void {
  console.log(`> ${cmd}`);
  execSync(cmd, {
    cwd: WEB_DIR,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=8192" },
  });
}

async function renormalizeMonth(monthKey: string): Promise<void> {
  run(`npm run topdeck:renormalize -- --months ${monthKey}`);
}

async function runMonthGate(monthKey: string, catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>) {
  const corpus = await loadCombinedCorpus([monthKey]);
  return evaluateMonthlyBackfillGate({ monthKey, corpus, catalog });
}

async function main() {
  const catalog = await loadDeckResolutionCatalog();
  const progress = loadProgress();
  console.log(`12-month backfill window: ${MONTHS.join(", ")}`);
  console.log(`Resolver: ${DECK_RESOLVER_VERSION}`);

  for (const monthKey of MONTHS) {
    const existing = progress.monthProgress.find((m) => m.monthKey === monthKey);
    if (existing?.gatePass && existing.normalizeStatus === "ok") {
      console.log(`\n=== ${monthKey}: already complete, skipping ===`);
      continue;
    }

    if (existing?.importStatus === "imported" && existing.normalizeStatus === "ok" && !existing.gatePass) {
      console.log(`\n=== ${monthKey}: re-running gate after prior failure ===`);
    }

    console.log(`\n=== ${monthKey} ===`);
    const historical = loadHistoricalImportManifest();
    const record = historical.months[monthKey];
    const monthProgress: MonthProgress = { monthKey, importStatus: "skipped_existing", normalizeStatus: "ok", gatePass: false };

    if (record?.status === "COMPLETE" && record.runId && existsSync(`${topdeckRawRunDir(record.runId)}/raw-tournaments.jsonl.gz`)) {
      console.log(`Raw import preserved: ${record.runId}`);
      monthProgress.importStatus = "skipped_existing";
      monthProgress.runId = record.runId;
      const manifest = JSON.parse(readFileSync(`${topdeckRawRunDir(record.runId)}/run-manifest.json`, "utf8")) as {
        rawDigest: string;
      };
      monthProgress.rawDigest = manifest.rawDigest;
    } else {
      try {
        run(`npm run topdeck:import -- --months 1 --start ${monthStartIso(monthKey)}`);
        monthProgress.importStatus = "imported";
        const updated = loadHistoricalImportManifest().months[monthKey];
        monthProgress.runId = updated?.runId;
        if (updated?.runId) {
          const manifest = JSON.parse(
            readFileSync(`${topdeckRawRunDir(updated.runId)}/run-manifest.json`, "utf8"),
          ) as { rawDigest: string };
          monthProgress.rawDigest = manifest.rawDigest;
          if (updated) {
            updated.rawDigest = manifest.rawDigest;
            historical.months[monthKey] = updated;
            saveHistoricalImportManifest(historical);
          }
        }
      } catch (err) {
        monthProgress.importStatus = "failed";
        monthProgress.normalizeStatus = "failed";
        monthProgress.gatePass = false;
        progress.monthProgress = [...progress.monthProgress.filter((m) => m.monthKey !== monthKey), monthProgress];
        progress.status = "stopped";
        progress.stopReason = `import_failed_${monthKey}: ${err instanceof Error ? err.message : err}`;
        saveProgress(progress);
        throw err;
      }
    }

    try {
      await renormalizeMonth(monthKey);
    } catch (err) {
      monthProgress.normalizeStatus = "failed";
      progress.monthProgress = [...progress.monthProgress.filter((m) => m.monthKey !== monthKey), monthProgress];
      progress.status = "stopped";
      progress.stopReason = `normalize_failed_${monthKey}`;
      saveProgress(progress);
      throw err;
    }

    const gate = await runMonthGate(monthKey, catalog);
    monthProgress.gateChecks = gate.checks;
    monthProgress.gatePass = gate.pass;
    monthProgress.gateStopReason = gate.stopReason;
    if (gate.unresolvedClassification) {
      monthProgress.unresolvedRecorded = {
        quantity: gate.unresolvedClassification.unresolvedCardQuantity,
        uniqueNames: gate.unresolvedClassification.unresolvedUniqueNames,
        topNames: gate.unresolvedClassification.allUnresolved.slice(0, 25).map((r) => ({
          name: r.name,
          quantity: r.quantity,
          category: r.category,
        })),
      };
    }

    progress.monthProgress = [...progress.monthProgress.filter((m) => m.monthKey !== monthKey), monthProgress];
    saveProgress(progress);

    console.log(`Gate ${monthKey}: ${gate.pass ? "PASS" : "FAIL"} ${gate.stopReason ?? ""}`);
    console.log(`  unresolved: ${gate.checks.unresolvedUniqueNames} unique / qty recorded`);
    console.log(`  alias investigation signals: ${gate.checks.aliasInvestigationSignals}`);

    if (!gate.pass) {
      progress.status = "stopped";
      progress.stopReason = gate.stopReason;
      saveProgress(progress);
      throw new Error(`Monthly gate failed for ${monthKey}: ${gate.stopReason}`);
    }
  }

  console.log("\n=== Final full-corpus renormalize ===");
  run(`npm run topdeck:renormalize -- --months ${MONTHS.join(",")}`);

  console.log("\n=== 12-month consolidated QA report ===");
  run("npm run topdeck:12month-qa");

  progress.status = "completed";
  saveProgress(progress);
  console.log("\n12-month backfill complete.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
