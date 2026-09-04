/**
 * Measures the cumulative resident heap of every artifact cache the Professor
 * build path warms, in the order a live build touches them.
 *
 * Diagnostic for the Cloud Run OOM (heap ceiling ~1024 MB on a 2Gi container).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSemanticMapNeighbors, loadSemanticMapPoints } from "@/lib/semantic-visualization/artifact-loader";
import { loadSpellbookComboArtifacts } from "@/lib/commander-optimization-score/v1/load-artifacts";
import { loadCommanderGameChangerSnapshot } from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";

function loadEnvLocal(): void {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

type Row = { stage: string; delta: number; cumulative: number; peakRss: number };

async function main(): Promise<void> {
  loadEnvLocal();
  const rows: Row[] = [];
  const baseline = (global.gc?.(), process.memoryUsage().heapUsed);
  let prev = baseline;

  const stages: Array<[string, () => Promise<unknown> | unknown]> = [
    ["deck resolution catalog", () => loadDeckResolutionCatalog()],
    ["game changer snapshot", () => loadCommanderGameChangerSnapshot()],
    ["semantic map points", () => loadSemanticMapPoints()],
    ["semantic map neighbors", () => loadSemanticMapNeighbors()],
    ["spellbook combo artifacts", () => loadSpellbookComboArtifacts()],
  ];

  for (const [stage, run] of stages) {
    await run();
    global.gc?.();
    const now = process.memoryUsage().heapUsed;
    rows.push({
      stage,
      delta: mb(now - prev),
      cumulative: mb(now - baseline),
      peakRss: mb(process.memoryUsage().rss),
    });
    prev = now;
  }

  console.log(`baseline heap: ${mb(baseline)} MB`);
  console.log("");
  console.log("stage                         delta(MB)  cumulative(MB)  rss(MB)");
  for (const r of rows) {
    console.log(
      `${r.stage.padEnd(28)} ${String(r.delta).padStart(9)} ${String(r.cumulative).padStart(15)} ${String(r.peakRss).padStart(8)}`,
    );
  }
  console.log("");
  console.log(`FLOOR (all caches warm): ${mb(process.memoryUsage().heapUsed)} MB heap / ${mb(process.memoryUsage().rss)} MB rss`);
  console.log(`Node default heap ceiling on a 2Gi container: ~1024 MB`);
}

void main();
